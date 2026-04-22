import type { FastifyInstance } from 'fastify';
import { IntakePayloadSchema, ConfirmationPayloadSchema } from '../middleware/validation.js';
import { getClassifier } from '../services/classifier/index.js';
import { generateQuestions } from '../services/classifier/dynamic-questions.js';
import { getRedmineClient } from '../services/redmine/index.js';
import { logEvent } from '../services/events/index.js';
import type {
  IntakePayload,
  ClassificationRequest,
  ClassificationResponse,
  ClassifiedResponse,
  CreatedResponse,
  ErrorResponse,
} from '../types.js';

// =============================================================================
// Rutas de Intake — Workflow principal del MVP
//
// POST /api/intake/submit   → Recibe descripción, clasifica, devuelve confirmación
// POST /api/intake/confirm  → Confirma o edita, crea ticket en Redmine
//
// Ambas rutas requieren JWT con empresa seleccionada (requireCompany).
// =============================================================================

// Almacén temporal de sesiones en memoria.
// En producción, esto debería persistirse (Redis, SQLite, etc.)
const sessionStore = new Map<string, {
  intake: IntakePayload;
  classification: ClassificationResponse;
  attempt: number;
}>();

export async function intakeRoutes(app: FastifyInstance): Promise<void> {

  // ─────────────────────────────────────────────
  // POST /api/intake/submit
  // ─────────────────────────────────────────────
  app.post('/api/intake/submit', async (request, reply) => {
    // ── Auth: exigir JWT con empresa seleccionada ──
    const auth = request.requireCompany();

    // Validar payload
    const parseResult = IntakePayloadSchema.safeParse(request.body);
    if (!parseResult.success) {
      const errorResponse: ErrorResponse = {
        session_id: (request.body as any)?.session_id ?? 'unknown',
        status: 'error',
        error_code: 'validation_failed',
        error_message: parseResult.error.issues
          .map(i => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      };
      return reply.status(400).send(errorResponse);
    }

    const intake = parseResult.data as IntakePayload;
    const sessionId = intake.session_id;

    // ── Sobreescribir con datos del JWT (fuente de verdad) ──
    intake.user_id = auth.sub;
    intake.company_id = auth.company_id;
    intake.company_name = auth.company_name;

    try {
      // Registrar eventos
      logEvent('flow_started', sessionId, {
        user_id: intake.user_id,
        company_id: intake.company_id,
      });

      logEvent('description_submitted', sessionId, {
        char_count: intake.description.length,
        has_attachments: intake.attachments.length > 0,
      });

      // Construir request de clasificación
      const attempt = (sessionStore.get(sessionId)?.attempt ?? 0) + 1;
      const classificationRequest: ClassificationRequest = {
        session_id: sessionId,
        description: intake.description,
        user_context: {
          user_id: intake.user_id,
          company_id: intake.company_id,
          company_name: intake.company_name,
        },
        attachment_names: intake.attachments.map(a => a.filename),
        attempt,
      };

      // Clasificar
      logEvent('classification_requested', sessionId, { attempt });

      const classifier = getClassifier();
      const result = await classifier.classify(classificationRequest);

      logEvent('classification_completed', sessionId, {
        nature: result.response.classification.nature,
        domain: result.response.classification.domain,
        confidence: result.response.confidence,
        review_status: result.response.review_status,
        duration_ms: result.durationMs,
        used_fallback: result.usedFallback,
      });

      // Guardar en sesión
      sessionStore.set(sessionId, {
        intake,
        classification: result.response,
        attempt,
      });

      // Construir respuesta para el frontend
      const questions = generateQuestions(result.response);

      const displayResponse = {
        session_id: sessionId,
        status: 'classified' as const,
        display: {
          summary: result.response.summary,
          estimated_area: result.response.classification.domain,
          impact: result.response.suggested_priority !== 'normal'
            ? `Prioridad sugerida: ${result.response.suggested_priority}`
            : null,
          attachments_received: intake.attachments.map(a => a.filename),
          need: result.response.redmine_mapping?.need ?? null,
        },
        questions: questions.length > 0 ? questions : undefined,
      };

      logEvent('confirmation_shown', sessionId, {});

      return reply.status(200).send(displayResponse);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error interno';
      logEvent('flow_error', sessionId, {
        error_code: 'classification_failed',
        step: 'submit',
        message: errorMsg,
      });

      const errorResponse: ErrorResponse = {
        session_id: sessionId,
        status: 'error',
        error_code: 'classification_failed',
        error_message: 'No se pudo procesar la descripción. Inténtalo de nuevo.',
      };
      return reply.status(500).send(errorResponse);
    }
  });

  // ─────────────────────────────────────────────
  // POST /api/intake/confirm
  // ─────────────────────────────────────────────
  app.post('/api/intake/confirm', async (request, reply) => {
    // ── Auth: exigir JWT con empresa seleccionada ──
    request.requireCompany();

    // Validar payload
    const parseResult = ConfirmationPayloadSchema.safeParse(request.body);
    if (!parseResult.success) {
      const errorResponse: ErrorResponse = {
        session_id: (request.body as any)?.session_id ?? 'unknown',
        status: 'error',
        error_code: 'validation_failed',
        error_message: parseResult.error.issues
          .map(i => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      };
      return reply.status(400).send(errorResponse);
    }

    const confirmation = parseResult.data;
    const sessionId = confirmation.session_id;

    // Recuperar sesión
    const session = sessionStore.get(sessionId);
    if (!session) {
      const errorResponse: ErrorResponse = {
        session_id: sessionId,
        status: 'error',
        error_code: 'validation_failed',
        error_message: 'Sesión no encontrada. Inicia el proceso de nuevo.',
      };
      return reply.status(404).send(errorResponse);
    }

    // --- Acción: EDIT ---
    if (confirmation.action === 'edit') {
      logEvent('confirmation_edited', sessionId, {});

      // Actualizar descripción y adjuntos
      if (confirmation.edited_description) {
        session.intake.description = confirmation.edited_description;
      }
      if (confirmation.additional_attachments.length > 0) {
        session.intake.attachments.push(
          ...(confirmation.additional_attachments as IntakePayload['attachments'])
        );
      }

      // Re-clasificar
      const newAttempt = session.attempt + 1;
      const classificationRequest: ClassificationRequest = {
        session_id: sessionId,
        description: session.intake.description,
        user_context: {
          user_id: session.intake.user_id,
          company_id: session.intake.company_id,
          company_name: session.intake.company_name,
        },
        attachment_names: session.intake.attachments.map(a => a.filename),
        attempt: newAttempt,
      };

      logEvent('classification_requested', sessionId, { attempt: newAttempt });

      const classifier = getClassifier();
      const result = await classifier.classify(classificationRequest);

      logEvent('classification_completed', sessionId, {
        nature: result.response.classification.nature,
        domain: result.response.classification.domain,
        confidence: result.response.confidence,
        review_status: result.response.review_status,
        duration_ms: result.durationMs,
        used_fallback: result.usedFallback,
      });

      // Actualizar sesión
      session.classification = result.response;
      session.attempt = newAttempt;

      const editQuestions = generateQuestions(result.response);

      const displayResponse = {
        session_id: sessionId,
        status: 'classified' as const,
        display: {
          summary: result.response.summary,
          estimated_area: result.response.classification.domain,
          impact: result.response.suggested_priority !== 'normal'
            ? `Prioridad sugerida: ${result.response.suggested_priority}`
            : null,
          attachments_received: session.intake.attachments.map(a => a.filename),
          need: result.response.redmine_mapping?.need ?? null,
        },
        questions: editQuestions.length > 0 ? editQuestions : undefined,
      };

      logEvent('confirmation_shown', sessionId, {});

      return reply.status(200).send(displayResponse);
    }

    // --- Acción: CONFIRM ---
    try {
      logEvent('confirmation_accepted', sessionId, {});

      const redmine = getRedmineClient();
	  
		console.log('[DEBUG] suggested_assignee:', session.classification.suggested_assignee);
		console.log('[DEBUG] domain:', session.classification.classification.domain);
		console.log('[DEBUG] block:', session.classification.redmine_mapping.block);
		console.log('[DEBUG] module:', session.classification.redmine_mapping.module);
		console.log('[DEBUG] need:', session.classification.redmine_mapping.need);
	  
	  
      const ticketResult = await redmine.createTicket(
        session.intake,
        session.classification
      );

      logEvent('ticket_created', sessionId, {
        ticket_id: ticketResult.ticket_id,
        assigned_to: session.classification.suggested_assignee,
      });

      // Limpiar sesión
      sessionStore.delete(sessionId);

      const createdResponse: CreatedResponse = {
        session_id: sessionId,
        status: 'created',
        ticket_id: ticketResult.ticket_id,
        ticket_url: ticketResult.ticket_url,
      };

      return reply.status(201).send(createdResponse);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error interno';
      console.error('[Redmine ERROR]', error);  
      logEvent('flow_error', sessionId, {
        error_code: 'redmine_failed',
        step: 'confirm',
        message: errorMsg,
      });

      const errorResponse: ErrorResponse = {
        session_id: sessionId,
        status: 'error',
        error_code: 'redmine_failed',
        error_message: 'No se pudo crear el ticket. Inténtalo de nuevo.',
      };
      return reply.status(500).send(errorResponse);
    }
  });
}
