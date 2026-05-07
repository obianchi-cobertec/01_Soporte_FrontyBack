/**
 * Intake Store Cron — Tareas periódicas del sistema de revisión
 *
 * runExpiryCheck: marca como expired_unreviewed los pending_reviews vencidos
 * runOutOfSyncCheck: detecta tickets reasignados externamente en Redmine
 */

import { getIntakeStore } from './store.js';
import { getIdentityStore } from '../identity/store.js';
import { getMailer } from '../mailer/index.js';

export async function runExpiryCheck(): Promise<void> {
  const store = getIntakeStore();
  const expired = store.getPendingReviewsExpired();
  if (expired.length === 0) return;

  for (const review of expired) {
    store.updatePendingReviewStatus(review.id, 'expired_unreviewed', new Date().toISOString());
    store.logAuditEvent({
      pending_review_id: review.id,
      redmine_ticket_id: review.redmine_ticket_id,
      action: 'expired_unreviewed',
      actor_type: 'system',
    });
  }

  // Notificar a Bruno con resumen de expirados
  const bruce = getIdentityStore().getSupportLead();
  if (bruce) {
    try {
      await getMailer().sendBrunoExpiryDigest({
        to: bruce.email,
        name: bruce.name,
        expired_reviews: expired.map(r => ({
          id: r.id,
          redmine_ticket_id: r.redmine_ticket_id,
          redmine_ticket_url: r.redmine_ticket_url,
          company_name: r.company_name,
        })),
      });
    } catch (e) {
      console.error('[Cron] Error enviando email de expirados a Bruno:', e);
    }
  }

  console.log(`[Cron] ${expired.length} review(s) marcada(s) como expired_unreviewed`);
}

export async function runOutOfSyncCheck(): Promise<void> {
  if (!process.env.REDMINE_URL || !process.env.REDMINE_API_KEY) return;

  const store = getIntakeStore();
  const active = store.getPendingReviewsActiveForSync();

  for (const review of active) {
    try {
      const res = await fetch(
        `${process.env.REDMINE_URL}/issues/${review.redmine_ticket_id}.json`,
        { headers: { 'X-Redmine-API-Key': process.env.REDMINE_API_KEY! } },
      );
      if (!res.ok) continue;

      const data = await res.json() as { issue: { assigned_to?: { id: number } } };
      const redmineAssigneeId = data.issue?.assigned_to?.id;

      if (redmineAssigneeId && redmineAssigneeId !== review.current_assignee_redmine_user_id) {
        store.updatePendingReviewStatus(review.id, 'out_of_sync');
        store.logAuditEvent({
          pending_review_id: review.id,
          redmine_ticket_id: review.redmine_ticket_id,
          action: 'out_of_sync_detected',
          actor_type: 'system',
          payload: JSON.stringify({
            expected: review.current_assignee_redmine_user_id,
            actual: redmineAssigneeId,
          }),
        });

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
          }).catch(e => console.error('[Cron] Error email out_of_sync:', e));
        }
      }
    } catch (e) {
      console.error(`[Cron] Error verificando ticket ${review.redmine_ticket_id}:`, e);
    }
  }
}
