/**
 * Admin Config Proposals API — cliente para /api/admin/config-proposals
 */

import { authenticatedFetch } from './auth-api';

export interface ConfigProposal {
  id: string;
  pattern_id: string | null;
  pending_review_ids: string | null;  // JSON string de string[]
  config_file: string;
  change_type: 'proposed' | 'applied' | 'rejected';
  diff: string;              // JSON string: { jsonpath: string; before: unknown; after: unknown }
  llm_reasoning: string | null;
  llm_summary: string | null;
  llm_confidence: 'high' | 'medium' | 'low' | string | null;
  human_reasons: string | null;  // JSON string de string[]
  reviewed_by: string | null;
  review_decision_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface ConfigProposalDiff {
  jsonpath: string;
  before: unknown;
  after: unknown;
}

export async function fetchConfigProposals(
  filter?: { change_type?: 'proposed' | 'applied' | 'rejected' },
): Promise<ConfigProposal[]> {
  const params = new URLSearchParams();
  if (filter?.change_type) params.set('change_type', filter.change_type);
  const qs = params.toString();
  return authenticatedFetch<ConfigProposal[]>(
    `/admin/config-proposals${qs ? `?${qs}` : ''}`,
  );
}

export async function fetchConfigProposalById(id: string): Promise<ConfigProposal> {
  return authenticatedFetch<ConfigProposal>(`/admin/config-proposals/${id}`);
}

export async function applyConfigProposal(
  id: string,
  reason?: string,
): Promise<{ ok: boolean; message: string }> {
  return authenticatedFetch<{ ok: boolean; message: string }>(
    `/admin/config-proposals/${id}/apply`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export async function rejectConfigProposal(
  id: string,
  reason?: string,
): Promise<{ ok: boolean; message: string }> {
  return authenticatedFetch<{ ok: boolean; message: string }>(
    `/admin/config-proposals/${id}/reject`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}
