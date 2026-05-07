/**
 * Admin Reviews Routes — /api/admin/reviews
 *
 * Panel de revisiones para el support lead y superadmin.
 * Requiere is_support_lead || is_superadmin.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getIntakeStore } from '../services/intake-store/store.js';
import { getIdentityStore } from '../services/identity/store.js';
import { getRedmineClient, resolveAssigneeFromRole } from '../services/redmine/index.js';
import { getRedmineMapping } from '../config/loader.js';
import { getMailer } from '../services/mailer/index.js';
import { signReviewToken } from '../services/review-tokens/index.js';
import type { PendingReviewStatus } from '../intake-store-types.js';

const ForceReassignBodySchema = z.object({
  new_role: z.string().min(1, 'El rol es obligatorio'),
  reason: z.string().min(1, 'El motivo es obligatorio'),
});

function requireSupportLead(request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply): string | null {
  const auth = request.requireAuth();
  const store = getIdentityStore();
  const isAllowed = store.isSupportLead(auth.sub) || store.isSuperAdmin(auth.sub);
  if (!isAllowed) {
    reply.status(403).send({ error: 'FORBIDDEN', message: 'Acceso denegado. Se requiere rol de responsable de soporte.' });
    return null;
  }
  return auth.sub;
}

export async function adminReviewsRoutes(app: FastifyInstance): Promise<void> {

  // ─────────────────────────────────────────────────────────────
  // GET / — lista de pending_reviews con filtros
  // ─────────────────────────────────────────────────────────────
  app.get('/', async (request, reply) => {
    const userId = requireSupportLead(request, reply);
    if (!userId) return;

    const query = request.query as Record<string, string>;
    const filters: {
      status?: PendingReviewStatus;
      company_id?: string;
      assignee_redmine_user_id?: number;
      from_date?: string;
      to_date?: string;
    } = {};

    if (query.status) filters.status = query.status as PendingReviewStatus;
    if (query.company_id) filters.company_id = query.company_id;
    if (query.assignee_id) filters.assignee_redmine_user_id = parseInt(query.assignee_id, 10);
    if (query.from_date) filters.from_date = query.from_date;
    if (query.to_date) filters.to_date = query.to_date;

    const reviews = getIntakeStore().listPendingReviews(filters);
    return reply.status(200).send({ reviews });
  });

  // ─────────────────────────────────────────────────────────────
  // GET /:id — detalle de un pending_review con audit log
  // ─────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireSupportLead(request, reply);
    if (!userId) return;

    const review = getIntakeStore().getPendingReviewById(request.params.id);
    if (!review) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Revisión no encontrada.' });
    }

    const auditLog = getIntakeStore().listAuditLog({ pending_review_id: review.id });
    return reply.status(200).send({ review, audit_log: auditLog });
  });

  // ─────────────────────────────────────────────────────────────
  // POST /:id/force-approve — aprobar desde el panel admin
  // ─────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/force-approve', async (request, reply) => {
    const auth = request.requireAuth();
    const store = getIdentityStore();

    // Solo support lead puede forzar aprobaciones
    if (!store.isSupportLead(auth.sub) && !store.isSuperAdmin(auth.sub)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Se requiere rol de responsable de soporte.' });
    }

    const intakeStore = getIntakeStore();
    const review = intakeStore.getPendingReviewById(request.params.id);
    if (!review) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Revisión no encontrada.' });
    }
    if (review.status === 'approved') {
      return reply.status(409).send({ error: 'ALREADY_RESOLVED', message: 'Esta revisión ya fue aprobada.' });
    }

    const resolvedAt = new Date().toISOString();
    intakeStore.updatePendingReviewStatus(review.id, 'approved', resolvedAt);
    intakeStore.logAuditEvent({
      pending_review_id: review.id,
      redmine_ticket_id: review.redmine_ticket_id,
      action: 'approved',
      actor_type: 'user',
      actor_user_id: auth.sub,
      actor_name: 'Admin (forzado desde panel)',
    });

    return reply.status(200).send({ ok: true, message: 'Revisión aprobada correctamente.' });
  });

  // ─────────────────────────────────────────────────────────────
  // POST /:id/force-reassign — reasignar desde el panel admin
  // ─────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/force-reassign', async (request, reply) => {
    const auth = request.requireAuth();
    const identityStore = getIdentityStore();

    if (!identityStore.isSupportLead(auth.sub) && !identityStore.isSuperAdmin(auth.sub)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Se requiere rol de responsable de soporte.' });
    }

    const parseResult = ForceReassignBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parseResult.error.issues.map(i => i.message).join('; '),
      });
    }
    const { new_role, reason } = parseResult.data;

    const mapping = getRedmineMapping();
    const roleMap: Record<string, number> = mapping.role_to_user_id ?? {};
    if (!roleMap[new_role]) {
      return reply.status(422).send({
        error: 'ROLE_NOT_FOUND',
        message: `El rol "${new_role}" no existe en la configuración.`,
      });
    }

    const newAssignee = resolveAssigneeFromRole(new_role);
    if (!newAssignee) {
      return reply.status(422).send({
        error: 'ASSIGNEE_UNRESOLVABLE',
        message: `No se pudo resolver el email del rol "${new_role}".`,
      });
    }

    const intakeStore = getIntakeStore();
    const review = intakeStore.getPendingReviewById(request.params.id);
    if (!review) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Revisión no encontrada.' });
    }

    // Reasignar en Redmine
    const redmine = getRedmineClient();
    try {
      await redmine.updateIssueAssignee(review.redmine_ticket_id, newAssignee.redmine_user_id);
    } catch (err) {
      intakeStore.logAuditEvent({
        pending_review_id: review.id,
        redmine_ticket_id: review.redmine_ticket_id,
        action: 'reassign_failed',
        actor_type: 'user',
        actor_user_id: auth.sub,
        reason,
        redmine_sync_error: err instanceof Error ? err.message : String(err),
      });
      return reply.status(502).send({
        error: 'REDMINE_FAILED',
        message: 'No se pudo reasignar el ticket en Redmine.',
      });
    }

    const fromRole = review.current_assignee_role;
    const fromRedmineUserId = review.current_assignee_redmine_user_id;
    const reassignedAt = new Date().toISOString();
    const actorContact = getIdentityStore().getContactByUserId(auth.sub);
    const actorName = actorContact?.name ?? null;

    intakeStore.incrementReassignmentCount(review.id);
    intakeStore.appendReassignmentHistory(review.id, {
      from_role: fromRole,
      to_role: new_role,
      from_redmine_user_id: fromRedmineUserId,
      to_redmine_user_id: newAssignee.redmine_user_id,
      reason,
      reassigned_at: reassignedAt,
    });
    intakeStore.updatePendingReviewAssignee(review.id, {
      role: newAssignee.role,
      redmine_user_id: newAssignee.redmine_user_id,
      email: newAssignee.email,
      name: newAssignee.name,
    });

    const newJti = randomUUID();
    intakeStore.rotateToken(review.id, newJti);

    intakeStore.logAuditEvent({
      pending_review_id: review.id,
      redmine_ticket_id: review.redmine_ticket_id,
      action: 'reassigned',
      actor_type: 'user',
      actor_user_id: auth.sub,
      actor_name: actorName,
      from_role: fromRole,
      from_redmine_user_id: fromRedmineUserId,
      to_role: new_role,
      to_redmine_user_id: newAssignee.redmine_user_id,
      reason,
    });

    // Enviar email al nuevo revisor
    const ttlDays = parseInt(process.env.REVIEW_TOKEN_TTL_DAYS ?? '7', 10);
    const newToken = signReviewToken(review.id, newJti, ttlDays);
    try {
      const classification = JSON.parse(review.original_classification) as {
        classification?: { nature?: string; domain?: string };
      };
      await getMailer().sendReviewerNotification({
        to: newAssignee.email,
        reviewer_name: newAssignee.name,
        review_token: newToken,
        redmine_ticket_url: review.redmine_ticket_url,
        company_name: review.company_name,
        intake_description: review.intake_description,
        nature: classification?.classification?.nature ?? '',
        domain: classification?.classification?.domain ?? '',
        suggested_assignee: new_role,
      });
    } catch (emailErr) {
      console.error('[AdminReviews] Error enviando email al nuevo revisor:', emailErr);
    }

    return reply.status(200).send({ ok: true, message: 'Reasignación aplicada correctamente.' });
  });

  // ─────────────────────────────────────────────────────────────
  // POST /:id/retry-redmine-note-sync — reintentar nota privada
  // ─────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/retry-redmine-note-sync', async (request, reply) => {
    const auth = request.requireAuth();
    const identityStore = getIdentityStore();

    if (!identityStore.isSupportLead(auth.sub) && !identityStore.isSuperAdmin(auth.sub)) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Se requiere rol de responsable de soporte.' });
    }

    const intakeStore = getIntakeStore();
    const review = intakeStore.getPendingReviewById(request.params.id);
    if (!review) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Revisión no encontrada.' });
    }

    // Construir nota con el historial de reasignaciones
    const history = review.reassignment_history
      ? JSON.stringify(JSON.parse(review.reassignment_history), null, 2)
      : 'Sin historial de reasignaciones';
    const note = `[SINCRONIZACIÓN MANUAL - ${new Date().toLocaleDateString('es-ES')}]\nHistorial de reasignaciones:\n${history}`;

    const redmine = getRedmineClient();
    try {
      await redmine.addPrivateNote(review.redmine_ticket_id, note);
      intakeStore.logAuditEvent({
        pending_review_id: review.id,
        redmine_ticket_id: review.redmine_ticket_id,
        action: 'redmine_note_synced',
        actor_type: 'user',
        actor_user_id: auth.sub,
      });
      return reply.status(200).send({ ok: true, message: 'Nota sincronizada correctamente.' });
    } catch (err) {
      intakeStore.logAuditEvent({
        pending_review_id: review.id,
        redmine_ticket_id: review.redmine_ticket_id,
        action: 'redmine_note_failed',
        actor_type: 'user',
        actor_user_id: auth.sub,
        redmine_sync_error: err instanceof Error ? err.message : String(err),
      });
      return reply.status(502).send({
        error: 'REDMINE_FAILED',
        message: 'No se pudo sincronizar la nota con Redmine.',
      });
    }
  });
}
