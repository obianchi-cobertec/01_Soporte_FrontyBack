import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { IntakePayloadSchema, ConfirmationPayloadSchema } from '../middleware/validation.js';
import { getClassifier } from '../services/classifier/index.js';
import { getRedmineClient, resolveAssigneeFromRole } from '../services/redmine/index.js';
import { logEvent } from '../services/events/index.js';
import { isExecutableExtension } from '../utils/blocked-extensions.js';
import { getRedmineMapping } from '../config/loader.js';
import {
  evaluateBillable,
  buildBillingDisambiguationQuestion,
  findDisambiguationOptionId,
  type DisambiguationAnswer,
} from '../services/classifier/billable-evaluator.js';
import { getIntakeStore } from '../services/intake-store/store.js';
import { getIdentityStore } from '../services/identity/store.js';
import { signReviewToken } from '../services/review-tokens/index.js';
import { getMailer } from '../services/mailer/index.js';
import type {
  IntakePayload,
  ClassificationRequest,
  ClassificationResponse,
  ClassifiedResponse,
  CreatedResponse,
  ErrorResponse,
  BillableInfo,
} from '../types.js';

// ─── Helper: resuelve el support lead como assignee ──────────────────────────

async function getSupportLeadAsAssignee(): Promise<{
  role: string;
  redmine_user_id: number;
  email: string;
  name: string;
} | null> {
  const lead = getIdentityStore().getSupportLead();
  if (!lead) return null;
  const user = getIdentityStore().getUserById(lead.user_id);
  const redmineUserId = (user as { redmine_user_id?: number | null } | null)?.redmine_user_id ?? null;
  if (!redmineUserId) return null;
  return { role: 'support_lead', redmine_user_id: redmineUserId, email: lead.email, name: lead.name };
}

// =============================================================================
// Rutas de Intake — Workflow principal del MVP
//
// POST   /api/intake/submit   → Recibe descripción, clasifica, devuelve confirmación
// POST   /api/intake/confirm  → Confirma, edita o aclara
// DELETE /api/intake/session  → Cancela y elimina la sesión activa
//
// Todas las rutas requieren JWT con empresa seleccionada (requireCompany).
// =============================================================================

// Almacén temporal de sesiones en memoria.
// En producción, esto debería persistirse (Redis, SQLite, etc.)
const sessionStore = new Map<string, {
  intake: IntakePayload;
  classification: ClassificationResponse;
  attempt: number;
  clarification_attempted: boolean;
  clarification?: { question: string; answer: string };
  clarifying_question_reason: string | null;
  billable: BillableInfo | null;
  billing_disambiguation_question_id: string | null;
  billing_disambiguation_answer?: DisambiguationAnswer;
}>();

export async function intakeRoutes(app: FastifyInstance): Promise<void> {

  // ─────────────────────────────────────────────
  // DELETE /api/intake/session
  // ─────────────────────────────────────────────
  app.delete('/api/intake/session', async (request, reply) => {
    request.requireAuth();
    request.requireCompany();

    const sessionId = (request.query as Record<string, string>).session_id;

    if (sessionId) {
      sessionStore.delete(sessionId);
      logEvent('intake_cancelled', sessionId, {});
    }

    return reply.status(200).send({ ok: true });
  });

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
        session_id: (request.body as { session_id?: string })?.session_id ?? 'unknown',
        status: 'error',
        error_code: 'validation_failed',
        error_message: parseResult.error.issues
          .map(i => i.message)
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

    // ── Validar extensiones de adjuntos ──
    for (const att of intake.attachments) {
      if (isExecutableExtension(att.filename)) {
        return reply.status(400).send({
          error: {
            code: 'EXECUTABLE_NOT_ALLOWED',
            message: `No se pueden adjuntar archivos ejecutables por seguridad. Archivo rechazado: ${att.filename}`,
          },
        });
      }
    }

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

      // Evaluar facturación
      const redmineConfig = getRedmineMapping();
      const billableResult = evaluateBillable(result.response, [], redmineConfig.billable_rules);

      // Determinar pregunta aclaratoria: la desambiguación de facturación tiene prioridad
      let clarifyingQuestion = result.clarifying_question;
      let pendingBillingDisambiguationId: string | null = null;

      if (billableResult?.requires_disambiguation) {
        const rule = redmineConfig.billable_rules?.rules.find(
          r => r.nature === result.response.classification.nature &&
               r.requires_disambiguation &&
               r.disambiguation_question_id
        );
        if (rule?.disambiguation_question_id) {
          const billingQ = buildBillingDisambiguationQuestion(
            rule.disambiguation_question_id,
            redmineConfig.billable_rules!
          );
          if (billingQ) {
            clarifyingQuestion = billingQ;
            pendingBillingDisambiguationId = rule.disambiguation_question_id;
          }
        }
      }

      // Guardar en sesión
      sessionStore.set(sessionId, {
        intake,
        classification: result.response,
        attempt,
        clarification_attempted: false,
        clarifying_question_reason: clarifyingQuestion?.reason ?? null,
        billable: billableResult,
        billing_disambiguation_question_id: pendingBillingDisambiguationId,
      });

      // Loguear generación de pregunta aclaratoria
      if (clarifyingQuestion) {
        logEvent('clarifying_question_generated', sessionId, {
          question: clarifyingQuestion.question,
          has_options: clarifyingQuestion.options !== null,
          reason: clarifyingQuestion.reason,
        });
      }

      const displayResponse: ClassifiedResponse = {
        session_id: sessionId,
        status: 'classified',
        display: {
          summary: result.response.summary,
          nature: result.response.classification.nature,
          estimated_area: result.response.classification.domain,
          impact: result.response.suggested_priority !== 'normal'
            ? `Prioridad sugerida: ${result.response.suggested_priority}`
            : null,
          attachments_received: intake.attachments.map(a => a.filename),
          need: result.response.redmine_mapping?.need ?? null,
        },
        clarifying_question: clarifyingQuestion,
        billable: billableResult,
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
        session_id: (request.body as { session_id?: string })?.session_id ?? 'unknown',
        status: 'error',
        error_code: 'validation_failed',
        error_message: parseResult.error.issues
          .map(i => i.message)
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

    // --- Acción: CLARIFY ---
    if (confirmation.action === 'clarify') {
      // Caso especial: desambiguación de facturación
      if (session.billing_disambiguation_question_id) {
        const qId = session.billing_disambiguation_question_id;
        const redmineConfig = getRedmineMapping();
        const selectedLabel = confirmation.clarification_answer!;

        const optionId = findDisambiguationOptionId(qId, selectedLabel, redmineConfig.billable_rules!);
        const disambiguationAnswer: DisambiguationAnswer = {
          question_id: qId,
          selected_option_id: optionId ?? selectedLabel,
        };

        // Re-evaluar facturación con la respuesta
        const updatedBillable = evaluateBillable(
          session.classification,
          [disambiguationAnswer],
          redmineConfig.billable_rules
        );

        session.billing_disambiguation_question_id = null;
        session.billing_disambiguation_answer = disambiguationAnswer;
        session.billable = updatedBillable;
        session.clarification_attempted = true;

        logEvent('clarifying_question_answered', sessionId, {
          question: confirmation.clarification_question,
          answer: selectedLabel,
          reason: 'billing_disambiguation',
          is_billable: updatedBillable?.is_billable ?? false,
        });

        const billingDisambiguationResponse: ClassifiedResponse = {
          session_id: sessionId,
          status: 'classified',
          display: {
            summary: session.classification.summary,
            nature: session.classification.classification.nature,
            estimated_area: session.classification.classification.domain,
            impact: session.classification.suggested_priority !== 'normal'
              ? `Prioridad sugerida: ${session.classification.suggested_priority}`
              : null,
            attachments_received: session.intake.attachments.map(a => a.filename),
            need: session.classification.redmine_mapping?.need ?? null,
          },
          clarifying_question: null,
          billable: updatedBillable,
        };

        logEvent('confirmation_shown', sessionId, {});
        return reply.status(200).send(billingDisambiguationResponse);
      }

      // Caso especial: confirmación de solución negada → pedir descripción libre
      if (
        session.clarifying_question_reason === 'heuristic_solution_confirm' &&
        confirmation.clarification_answer === 'No'
      ) {
        session.clarification_attempted = true;
        session.clarifying_question_reason = 'heuristic_solution_confirm_no';

        logEvent('clarifying_question_answered', sessionId, {
          question: confirmation.clarification_question,
          answer: 'No',
          reason: 'heuristic_solution_confirm',
        });

        const followUpResponse: ClassifiedResponse = {
          session_id: sessionId,
          status: 'classified',
          display: {
            summary: session.classification.summary,
            nature: session.classification.classification.nature,
            estimated_area: session.classification.classification.domain,
            impact: session.classification.suggested_priority !== 'normal'
              ? `Prioridad sugerida: ${session.classification.suggested_priority}`
              : null,
            attachments_received: session.intake.attachments.map(a => a.filename),
            need: session.classification.redmine_mapping?.need ?? null,
          },
          clarifying_question: {
            question: '¿Sobre qué solución o aplicación es tu consulta? Descríbelo brevemente.',
            options: null,
            reason: 'heuristic_solution_confirm_no',
          },
          billable: session.billable,
        };

        return reply.status(200).send(followUpResponse);
      }

      // Impedir bucles: solo una iteración de clarify por sesión
      if (session.clarification_attempted) {
        const errorResponse: ErrorResponse = {
          session_id: sessionId,
          status: 'error',
          error_code: 'clarification_already_attempted',
          error_message: 'Ya se ha realizado una aclaración en esta sesión. Confirma o edita la descripción.',
        };
        return reply.status(400).send(errorResponse);
      }

      const clarificationAnswer = confirmation.clarification_answer!;
      const clarificationQuestion = confirmation.clarification_question!;

      const clarification = {
        question: clarificationQuestion,
        answer: clarificationAnswer,
      };

      logEvent('clarifying_question_answered', sessionId, {
        question: clarificationQuestion,
        answer: clarificationAnswer,
      });

      // Re-clasificar con la aclaración
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
        clarification,
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

      // Actualizar sesión: marcar intento y guardar aclaración
      session.classification = result.response;
      session.attempt = newAttempt;
      session.clarification_attempted = true;
      session.clarification = clarification;

      // Re-evaluar facturación con la nueva clasificación
      const redmineConfigClarify = getRedmineMapping();
      const clarifyBillable = evaluateBillable(
        result.response,
        session.billing_disambiguation_answer ? [session.billing_disambiguation_answer] : [],
        redmineConfigClarify.billable_rules
      );
      session.billable = clarifyBillable;

      const displayResponse: ClassifiedResponse = {
        session_id: sessionId,
        status: 'classified',
        display: {
          summary: result.response.summary,
          nature: result.response.classification.nature,
          estimated_area: result.response.classification.domain,
          impact: result.response.suggested_priority !== 'normal'
            ? `Prioridad sugerida: ${result.response.suggested_priority}`
            : null,
          attachments_received: session.intake.attachments.map(a => a.filename),
          need: result.response.redmine_mapping?.need ?? null,
        },
        clarifying_question: null, // Segunda iteración nunca genera nueva pregunta
        billable: clarifyBillable,
      };

      logEvent('confirmation_shown', sessionId, {});

      return reply.status(200).send(displayResponse);
    }

    // --- Acción: EDIT ---
    if (confirmation.action === 'edit') {
      logEvent('confirmation_edited', sessionId, {});

      // Validar extensiones de adjuntos adicionales
      for (const att of confirmation.additional_attachments) {
        if (isExecutableExtension(att.filename)) {
          return reply.status(400).send({
            error: {
              code: 'EXECUTABLE_NOT_ALLOWED',
              message: `No se pueden adjuntar archivos ejecutables por seguridad. Archivo rechazado: ${att.filename}`,
            },
          });
        }
      }

      // Actualizar descripción y adjuntos
      if (confirmation.edited_description) {
        session.intake.description = confirmation.edited_description;
      }
      if (confirmation.additional_attachments.length > 0) {
        session.intake.attachments.push(
          ...(confirmation.additional_attachments as IntakePayload['attachments'])
        );
      }

      // Re-clasificar (sin clarification — nueva clasificación limpia)
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

      // Re-evaluar facturación con la nueva clasificación (reset de desambiguación en edit)
      const redmineConfigEdit = getRedmineMapping();
      const editBillableResult = evaluateBillable(result.response, [], redmineConfigEdit.billable_rules);

      let editClarifyingQuestion = result.clarifying_question;
      let editPendingBillingDisambiguationId: string | null = null;

      if (editBillableResult?.requires_disambiguation) {
        const rule = redmineConfigEdit.billable_rules?.rules.find(
          r => r.nature === result.response.classification.nature &&
               r.requires_disambiguation &&
               r.disambiguation_question_id
        );
        if (rule?.disambiguation_question_id) {
          const billingQ = buildBillingDisambiguationQuestion(
            rule.disambiguation_question_id,
            redmineConfigEdit.billable_rules!
          );
          if (billingQ) {
            editClarifyingQuestion = billingQ;
            editPendingBillingDisambiguationId = rule.disambiguation_question_id;
          }
        }
      }

      // Actualizar sesión (reset clarification state en edit)
      session.classification = result.response;
      session.attempt = newAttempt;
      session.clarification_attempted = false;
      session.clarification = undefined;
      session.clarifying_question_reason = editClarifyingQuestion?.reason ?? null;
      session.billable = editBillableResult;
      session.billing_disambiguation_question_id = editPendingBillingDisambiguationId;
      session.billing_disambiguation_answer = undefined;

      // Loguear generación de pregunta aclaratoria tras edición
      if (editClarifyingQuestion) {
        logEvent('clarifying_question_generated', sessionId, {
          question: editClarifyingQuestion.question,
          has_options: editClarifyingQuestion.options !== null,
          reason: editClarifyingQuestion.reason,
        });
      }

      const displayResponse: ClassifiedResponse = {
        session_id: sessionId,
        status: 'classified',
        display: {
          summary: result.response.summary,
          nature: result.response.classification.nature,
          estimated_area: result.response.classification.domain,
          impact: result.response.suggested_priority !== 'normal'
            ? `Prioridad sugerida: ${result.response.suggested_priority}`
            : null,
          attachments_received: session.intake.attachments.map(a => a.filename),
          need: result.response.redmine_mapping?.need ?? null,
        },
        clarifying_question: editClarifyingQuestion,
        billable: editBillableResult,
      };

      logEvent('confirmation_shown', sessionId, {});

      return reply.status(200).send(displayResponse);
    }

    // --- Acción: CONFIRM ---
    // Validar aceptación de coste si la incidencia es facturable
    if (session.billable?.is_billable === true) {
      const billingAcceptance = confirmation.billing_acceptance;
      if (!billingAcceptance || billingAcceptance.accepted !== true) {
        const errorResponse: ErrorResponse = {
          session_id: sessionId,
          status: 'error',
          error_code: 'billing_acceptance_required',
          error_message: 'Debes aceptar el aviso de coste antes de confirmar la incidencia.',
        };
        return reply.status(400).send(errorResponse);
      }
    }

    try {
      logEvent('confirmation_accepted', sessionId, {});

      const redmine = getRedmineClient();
      const ticketResult = await redmine.createTicket(
        session.intake,
        session.classification,
        session.clarification,
        session.billable,
        confirmation.billing_acceptance ?? null
      );

      logEvent('ticket_created', sessionId, {
        ticket_id: ticketResult.ticket_id,
        assigned_to: session.classification.suggested_assignee,
      });

      // ── Lógica de revisión humana post-Redmine ──────────────────────────
      const requireReview = (process.env.REQUIRE_HUMAN_REVIEW ?? 'true') === 'true';

      if (requireReview) {
        try {
          const roleKey = session.classification.suggested_assignee ?? 'default';
          const assignee = resolveAssigneeFromRole(roleKey);
          const finalAssignee = assignee ?? await getSupportLeadAsAssignee();

          if (finalAssignee) {
            const jti = randomUUID();
            const ttlDays = parseInt(process.env.REVIEW_TOKEN_TTL_DAYS ?? '7', 10);
            const expiresAt = new Date(Date.now() + ttlDays * 86400 * 1000).toISOString();

            const review = getIntakeStore().createPendingReview({
              session_id: sessionId,
              redmine_ticket_id: parseInt(ticketResult.ticket_id, 10),
              redmine_ticket_url: ticketResult.ticket_url,
              redmine_project_id: 0,
              user_id: session.intake.user_id,
              company_id: session.intake.company_id,
              company_name: session.intake.company_name,
              intake_description: session.intake.description,
              original_classification: JSON.stringify(session.classification),
              current_assignee_role: finalAssignee.role,
              current_assignee_redmine_user_id: finalAssignee.redmine_user_id,
              current_assignee_email: finalAssignee.email,
              current_assignee_name: finalAssignee.name,
              expires_at: expiresAt,
              current_token_jti: jti,
            });

            getIntakeStore().logAuditEvent({
              pending_review_id: review.id,
              redmine_ticket_id: parseInt(ticketResult.ticket_id, 10),
              action: 'created',
              actor_type: 'system',
              domain: session.classification.classification.domain,
              nature: session.classification.classification.nature,
              company_id: session.intake.company_id,
            });

            // Enviar email al revisor
            const reviewToken = signReviewToken(review.id, jti, ttlDays);
            try {
              await getMailer().sendReviewerNotification({
                to: finalAssignee.email,
                reviewer_name: finalAssignee.name,
                review_token: reviewToken,
                redmine_ticket_url: ticketResult.ticket_url,
                company_name: session.intake.company_name,
                intake_description: session.intake.description,
                nature: session.classification.classification.nature,
                domain: session.classification.classification.domain,
                suggested_assignee: session.classification.suggested_assignee ?? 'sin determinar',
              });
            } catch (emailErr) {
              console.error('[Review] Error enviando email al revisor:', emailErr);
            }
          }
        } catch (reviewErr) {
          // No fallar el flujo principal si la creación del review falla
          console.error('[Review] Error creando pending_review:', reviewErr);
        }
      }

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
