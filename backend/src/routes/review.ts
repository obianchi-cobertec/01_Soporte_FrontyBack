/**
 * Review Routes — /api/review?t=<token>
 *
 * Endpoints públicos (sin autenticación JWT de usuario) para la revisión humana.
 * El token de revisión (JWT con audience 'review') viaja como query param ?t=
 * para evitar el rechazo de Fastify con puntos en parámetros de ruta.
 *
 * GET  /api/review?t=<token>           → carga los datos del pending_review
 * POST /api/review/approve?t=<token>   → confirma la asignación
 * POST /api/review/reassign?t=<token>  → reasigna a otro técnico
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getIntakeStore } from '../services/intake-store/store.js';
import { getIdentityStore } from '../services/identity/store.js';
import { getRedmineClient, resolveAssigneeFromRole } from '../services/redmine/index.js';
import { getRedmineMapping } from '../config/loader.js';

/** Construye la lista de asignables disponibles a partir de role_to_user_id. */
function buildAvailableAssignees(): Array<{ role: string; name: string }> {
  const mapping = getRedmineMapping();
  const roleMap: Record<string, number> = mapping.role_to_user_id ?? {};
  return Object.keys(roleMap)
    .map(role => {
      const resolved = resolveAssigneeFromRole(role);
      return resolved ? { role, name: resolved.name } : null;
    })
    .filter((a): a is { role: string; name: string } => a !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
import { verifyReviewToken, signReviewToken } from '../services/review-tokens/index.js';
import { getMailer } from '../services/mailer/index.js';

const ReassignBodySchema = z.object({
  new_role: z.string().min(1, 'El rol es obligatorio'),
  reason: z.string().min(1, 'El motivo es obligatorio'),
});

export async function reviewRoutes(app: FastifyInstance): Promise<void> {

  // ─────────────────────────────────────────────────────────────
  // GET /api/review?t=<token> — cargar datos del pending_review
  // ─────────────────────────────────────────────────────────────
  app.get<{ Querystring: { t?: string } }>('/', async (request, reply) => {
    const token = request.query.t;
    if (!token) {
      return reply.status(403).send({ error: 'INVALID_TOKEN', message: 'El enlace no es válido o ha expirado.' });
    }

    let payload;
    try {
      payload = verifyReviewToken(token);
    } catch {
      return reply.status(403).send({
        error: 'INVALID_TOKEN',
        message: 'El enlace no es válido o ha expirado.',
      });
    }

    const review = getIntakeStore().getPendingReviewByJti(payload.jti);
    if (!review || review.status !== 'pending_review' || review.current_token_jti !== payload.jti) {
      return reply.status(403).send({
        error: 'INVALID_TOKEN',
        message: 'El enlace no es válido, ha expirado o ya fue utilizado.',
      });
    }

    return reply.status(200).send({
      pending_review_id: review.id,
      redmine_ticket_id: review.redmine_ticket_id,
      redmine_ticket_url: review.redmine_ticket_url,
      company_name: review.company_name,
      intake_description: review.intake_description,
      current_assignee_role: review.current_assignee_role,
      current_assignee_name: review.current_assignee_name,
      original_classification: JSON.parse(review.original_classification) as Record<string, unknown>,
      reassignment_count: review.reassignment_count,
      status: review.status,
      expires_at: review.expires_at,
      available_assignees: buildAvailableAssignees(),
    });
  });

  // ─────────────────────────────────────────────────────────────
  // POST /api/review/approve?t=<token> — confirmar asignación
  // ─────────────────────────────────────────────────────────────
  app.post<{ Querystring: { t?: string } }>('/approve', async (request, reply) => {
    const token = request.query.t;
    if (!token) {
      return reply.status(403).send({ error: 'INVALID_TOKEN', message: 'El enlace no es válido o ha expirado.' });
    }

    let payload;
    try {
      payload = verifyReviewToken(token);
    } catch {
      return reply.status(403).send({
        error: 'INVALID_TOKEN',
        message: 'El enlace no es válido o ha expirado.',
      });
    }

    const store = getIntakeStore();
    const review = store.getPendingReviewByJti(payload.jti);
    if (!review || review.status !== 'pending_review' || review.current_token_jti !== payload.jti) {
      return reply.status(403).send({
        error: 'INVALID_TOKEN',
        message: 'El enlace no es válido, ha expirado o ya fue utilizado.',
      });
    }

    const resolvedAt = new Date().toISOString();
    store.updatePendingReviewStatus(review.id, 'approved', resolvedAt);

    store.logAuditEvent({
      pending_review_id: review.id,
      redmine_ticket_id: review.redmine_ticket_id,
      action: 'approved',
      actor_type: 'user',
      actor_redmine_user_id: review.current_assignee_redmine_user_id,
      actor_name: review.current_assignee_name,
    });

    // Invalidar token con sentinela
    store.rotateToken(review.id, `CONSUMED_${review.current_token_jti}`);

    return reply.status(200).send({ ok: true, message: 'Asignación confirmada correctamente.' });
  });

  // ─────────────────────────────────────────────────────────────
  // POST /api/review/reassign?t=<token> — reasignar a otro técnico
  // ─────────────────────────────────────────────────────────────
  app.post<{ Querystring: { t?: string } }>('/reassign', async (request, reply) => {
    const token = request.query.t;
    if (!token) {
      return reply.status(403).send({ error: 'INVALID_TOKEN', message: 'El enlace no es válido o ha expirado.' });
    }

    let payload;
    try {
      payload = verifyReviewToken(token);
    } catch {
      return reply.status(403).send({
        error: 'INVALID_TOKEN',
        message: 'El enlace no es válido o ha expirado.',
      });
    }

    const store = getIntakeStore();
    const review = store.getPendingReviewByJti(payload.jti);
    if (!review || review.status !== 'pending_review' || review.current_token_jti !== payload.jti) {
      return reply.status(403).send({
        error: 'INVALID_TOKEN',
        message: 'El enlace no es válido, ha expirado o ya fue utilizado.',
      });
    }

    // Validar body
    const parseResult = ReassignBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parseResult.error.issues.map(i => i.message).join('; '),
      });
    }
    const { new_role, reason } = parseResult.data;

    // Validar que el rol existe
    const mapping = getRedmineMapping();
    const roleMap: Record<string, number> = mapping.role_to_user_id ?? {};
    if (!roleMap[new_role]) {
      return reply.status(422).send({
        error: 'ROLE_NOT_FOUND',
        message: `El rol "${new_role}" no existe en la configuración.`,
      });
    }

    // Resolver nuevo assignee
    const newAssignee = resolveAssigneeFromRole(new_role);
    if (!newAssignee) {
      return reply.status(422).send({
        error: 'ASSIGNEE_UNRESOLVABLE',
        message: `No se pudo resolver el email del rol "${new_role}". Contacta con el administrador.`,
      });
    }

    // Detección out_of_sync (solo si REDMINE_URL configurado)
    if (process.env.REDMINE_URL && process.env.REDMINE_API_KEY) {
      try {
        const syncRes = await fetch(
          `${process.env.REDMINE_URL}/issues/${review.redmine_ticket_id}.json`,
          { headers: { 'X-Redmine-API-Key': process.env.REDMINE_API_KEY } },
        );
        if (syncRes.ok) {
          const syncData = await syncRes.json() as { issue: { assigned_to?: { id: number } } };
          const redmineCurrentId = syncData.issue?.assigned_to?.id;
          if (redmineCurrentId && redmineCurrentId !== review.current_assignee_redmine_user_id) {
            store.updatePendingReviewStatus(review.id, 'out_of_sync');
            store.logAuditEvent({
              pending_review_id: review.id,
              redmine_ticket_id: review.redmine_ticket_id,
              action: 'out_of_sync_detected',
              actor_type: 'system',
              payload: JSON.stringify({
                expected: review.current_assignee_redmine_user_id,
                actual: redmineCurrentId,
              }),
            });

            // Notificar a Bruno
            const bruce = getIdentityStore().getSupportLead();
            if (bruce) {
              getMailer().sendBrunoOutOfSyncAlert({
                to: bruce.email,
                name: bruce.name,
                review: {
                  id: review.id,
                  redmine_ticket_id: review.redmine_ticket_id,
                  redmine_ticket_url: review.redmine_ticket_url,
                  company_name: review.company_name,
                },
              }).catch(e => console.error('[Review] Error email out_of_sync:', e));
            }

            return reply.status(409).send({
              error: 'OUT_OF_SYNC',
              message: 'El ticket fue reasignado externamente en Redmine. El responsable de soporte ha sido notificado.',
            });
          }
        }
      } catch (syncErr) {
        console.warn('[Review] Error comprobando out_of_sync:', syncErr);
        // No bloquear la reasignación por fallo de sincronización
      }
    }

    // PUT 1: reasignar en Redmine
    // Resolvemos el identificador de proyecto del cliente para poder añadir membresía
    // automáticamente si el técnico no es miembro (422 "Asignado a no es válido").
    const projectIdentifier = mapping.company_to_project[review.company_id]
      ?? mapping.company_to_project['_default'];

    const redmine = getRedmineClient();
    try {
      await redmine.updateIssueAssignee(review.redmine_ticket_id, newAssignee.redmine_user_id, projectIdentifier);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Review] reassign FAILED → ticket=%d new_role=%s new_redmine_id=%d error: %s',
        review.redmine_ticket_id, new_role, newAssignee.redmine_user_id, errMsg);
      store.logAuditEvent({
        pending_review_id: review.id,
        redmine_ticket_id: review.redmine_ticket_id,
        action: 'reassign_failed',
        actor_type: 'user',
        from_role: review.current_assignee_role,
        from_redmine_user_id: review.current_assignee_redmine_user_id,
        to_role: new_role,
        to_redmine_user_id: newAssignee.redmine_user_id,
        reason,
        redmine_sync_error: errMsg,
      });
      return reply.status(502).send({
        error: 'REDMINE_FAILED',
        message: 'No se pudo reasignar el ticket en Redmine. Inténtalo de nuevo.',
      });
    }

    // Actualizar estado en BD
    const fromRole = review.current_assignee_role;
    const fromRedmineUserId = review.current_assignee_redmine_user_id;
    const reassignedAt = new Date().toISOString();

    store.incrementReassignmentCount(review.id);
    store.appendReassignmentHistory(review.id, {
      from_role: fromRole,
      to_role: new_role,
      from_redmine_user_id: fromRedmineUserId,
      to_redmine_user_id: newAssignee.redmine_user_id,
      reason,
      reassigned_at: reassignedAt,
    });
    store.updatePendingReviewAssignee(review.id, {
      role: newAssignee.role,
      redmine_user_id: newAssignee.redmine_user_id,
      email: newAssignee.email,
      name: newAssignee.name,
    });

    const newJti = randomUUID();
    store.rotateToken(review.id, newJti);

    store.logAuditEvent({
      pending_review_id: review.id,
      redmine_ticket_id: review.redmine_ticket_id,
      action: 'reassigned',
      actor_type: 'user',
      actor_redmine_user_id: fromRedmineUserId,
      actor_name: review.current_assignee_name,
      from_role: fromRole,
      from_redmine_user_id: fromRedmineUserId,
      to_role: new_role,
      to_redmine_user_id: newAssignee.redmine_user_id,
      reason,
    });

    // Registrar patrón de reasignación
    const classification = JSON.parse(review.original_classification) as {
      classification?: { domain?: string };
    };
    const domain = classification?.classification?.domain ?? 'unknown';
    store.upsertPattern({
      domain,
      from_role: fromRole,
      to_role: new_role,
      pending_review_id: review.id,
      reason,
    });

    // Recuperar review actualizado para leer reassignment_count
    const updatedReview = store.getPendingReviewById(review.id);
    const newCount = updatedReview?.reassignment_count ?? 1;

    // PUT 2 (best-effort): nota privada en Redmine
    const fromName = review.current_assignee_name;
    const noteDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const privateNote = `[REASIGNACIÓN INTERNA - ${noteDate}]\nDe: ${fromRole} (${fromName})\nA: ${new_role} (${newAssignee.name})\nMotivo: ${reason}`;
    try {
      await redmine.addPrivateNote(review.redmine_ticket_id, privateNote);
      store.logAuditEvent({
        pending_review_id: review.id,
        redmine_ticket_id: review.redmine_ticket_id,
        action: 'redmine_note_synced',
        actor_type: 'system',
      });
    } catch (noteErr) {
      store.logAuditEvent({
        pending_review_id: review.id,
        redmine_ticket_id: review.redmine_ticket_id,
        action: 'redmine_note_failed',
        actor_type: 'system',
        redmine_sync_error: noteErr instanceof Error ? noteErr.message : String(noteErr),
      });
    }

    // Escalación si >= 3 reasignaciones
    const isEscalated = newCount >= 3;
    if (isEscalated) {
      store.updatePendingReviewStatus(review.id, 'escalated', new Date().toISOString());
      store.logAuditEvent({
        pending_review_id: review.id,
        redmine_ticket_id: review.redmine_ticket_id,
        action: 'escalated',
        actor_type: 'system',
      });

      const bruce = getIdentityStore().getSupportLead();
      if (bruce) {
        getMailer().sendBrunoEscalatedTicketAlert({
          to: bruce.email,
          name: bruce.name,
          review: {
            id: review.id,
            redmine_ticket_id: review.redmine_ticket_id,
            redmine_ticket_url: review.redmine_ticket_url,
            company_name: review.company_name,
            reassignment_count: newCount,
          },
        }).catch(e => console.error('[Review] Error email escalado:', e));
      }
    } else if (newCount >= 2) {
      // Alerta preventiva en 2 reasignaciones
      const bruce = getIdentityStore().getSupportLead();
      if (bruce) {
        getMailer().sendBrunoEscalationAlert({
          to: bruce.email,
          name: bruce.name,
          review: {
            id: review.id,
            redmine_ticket_id: review.redmine_ticket_id,
            redmine_ticket_url: review.redmine_ticket_url,
            company_name: review.company_name,
            reassignment_count: newCount,
          },
        }).catch(e => console.error('[Review] Error email alerta escalación:', e));
      }
    }

    // Enviar email al nuevo revisor (solo si no está escalado)
    if (!isEscalated) {
      const ttlDays = parseInt(process.env.REVIEW_TOKEN_TTL_DAYS ?? '7', 10);
      const newToken = signReviewToken(review.id, newJti, ttlDays);
      try {
        await getMailer().sendReviewerNotification({
          to: newAssignee.email,
          reviewer_name: newAssignee.name,
          review_token: newToken,
          redmine_ticket_url: review.redmine_ticket_url,
          company_name: review.company_name,
          intake_description: review.intake_description,
          nature: (classification as { classification?: { nature?: string } })?.classification?.nature ?? '',
          domain,
          suggested_assignee: new_role,
        });
      } catch (emailErr) {
        console.error('[Review] Error enviando email al nuevo revisor:', emailErr);
      }

      const ttlDaysForReturn = parseInt(process.env.REVIEW_TOKEN_TTL_DAYS ?? '7', 10);
      return reply.status(200).send({
        ok: true,
        message: 'Reasignación aplicada correctamente.',
        new_token: signReviewToken(review.id, newJti, ttlDaysForReturn),
        is_escalated: false,
      });
    }

    return reply.status(200).send({
      ok: true,
      message: 'Reasignación aplicada. El ticket ha sido escalado al responsable de soporte.',
      is_escalated: true,
    });
  });
}
