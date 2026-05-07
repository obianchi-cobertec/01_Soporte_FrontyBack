/**
 * Review API — cliente para los endpoints públicos /api/review?t=<token>
 */

const API_BASE = '/api';

export interface AvailableAssignee {
  role: string;
  name: string;
}

export interface ReviewData {
  pending_review_id: string;
  redmine_ticket_id: number;
  redmine_ticket_url: string;
  company_name: string;
  intake_description: string;
  current_assignee_role: string;
  current_assignee_name: string;
  original_classification: Record<string, unknown>;
  reassignment_count: number;
  status: string;
  expires_at: string;
  available_assignees: AvailableAssignee[];
}

interface ApiError {
  error: string;
  message: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errBody: ApiError;
    try {
      errBody = await res.json() as ApiError;
    } catch {
      errBody = { error: 'UNKNOWN_ERROR', message: 'Ha ocurrido un error inesperado.' };
    }
    throw errBody;
  }
  return res.json() as Promise<T>;
}

export async function fetchReviewData(token: string): Promise<ReviewData> {
  const res = await fetch(`${API_BASE}/review?t=${encodeURIComponent(token)}`);
  return handleResponse<ReviewData>(res);
}

export async function approveReview(token: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/review/approve?t=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return handleResponse<{ ok: boolean; message: string }>(res);
}

export async function reassignReview(
  token: string,
  new_role: string,
  reason: string,
): Promise<{ ok: boolean; message: string; new_token?: string; is_escalated?: boolean }> {
  const res = await fetch(`${API_BASE}/review/reassign?t=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_role, reason }),
  });
  return handleResponse<{ ok: boolean; message: string; new_token?: string; is_escalated?: boolean }>(res);
}
