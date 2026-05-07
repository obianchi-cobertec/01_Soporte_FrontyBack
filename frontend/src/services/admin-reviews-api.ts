/**
 * Admin Reviews API — cliente para /api/admin/reviews
 */

import { authenticatedFetch } from './auth-api';

export interface PendingReviewSummary {
  id: string;
  session_id: string;
  status: string;
  redmine_ticket_id: number;
  redmine_ticket_url: string;
  redmine_project_id: number;
  user_id: string;
  company_id: string;
  company_name: string;
  intake_description: string;
  original_classification: string;
  current_assignee_role: string;
  current_assignee_redmine_user_id: number;
  current_assignee_email: string;
  current_assignee_name: string;
  reassignment_count: number;
  reassignment_history: string | null;
  last_reassigned_by_name: string | null;
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
  current_token_jti: string;
}

export interface AuditLogEntry {
  id: string;
  pending_review_id: string;
  redmine_ticket_id: number;
  action: string;
  actor_type: string;
  actor_user_id: string | null;
  actor_redmine_user_id: number | null;
  actor_name: string | null;
  from_role: string | null;
  from_redmine_user_id: number | null;
  to_role: string | null;
  to_redmine_user_id: number | null;
  reason: string | null;
  domain: string | null;
  nature: string | null;
  company_id: string | null;
  redmine_sync_status: string | null;
  redmine_sync_error: string | null;
  created_at: string;
}

export interface ReviewFilters {
  status?: string;
  company_id?: string;
  from_date?: string;
  to_date?: string;
}

export async function fetchPendingReviews(filters?: ReviewFilters): Promise<PendingReviewSummary[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.company_id) params.set('company_id', filters.company_id);
  if (filters?.from_date) params.set('from_date', filters.from_date);
  if (filters?.to_date) params.set('to_date', filters.to_date);

  const qs = params.toString();
  const data = await authenticatedFetch<{ reviews: PendingReviewSummary[] }>(
    `/admin/reviews${qs ? `?${qs}` : ''}`,
  );
  return data.reviews;
}

export async function fetchPendingReviewDetail(
  id: string,
): Promise<{ review: PendingReviewSummary; audit_log: AuditLogEntry[] }> {
  return authenticatedFetch<{ review: PendingReviewSummary; audit_log: AuditLogEntry[] }>(
    `/admin/reviews/${id}`,
  );
}

export async function forceApprovePendingReview(id: string): Promise<{ ok: boolean; message: string }> {
  return authenticatedFetch<{ ok: boolean; message: string }>(
    `/admin/reviews/${id}/force-approve`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function forceReassignPendingReview(
  id: string,
  new_role: string,
  reason: string,
): Promise<{ ok: boolean; message: string }> {
  return authenticatedFetch<{ ok: boolean; message: string }>(
    `/admin/reviews/${id}/force-reassign`,
    { method: 'POST', body: JSON.stringify({ new_role, reason }) },
  );
}

export async function retryRedmineNoteSync(id: string): Promise<{ ok: boolean; message: string }> {
  return authenticatedFetch<{ ok: boolean; message: string }>(
    `/admin/reviews/${id}/retry-redmine-note-sync`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}
