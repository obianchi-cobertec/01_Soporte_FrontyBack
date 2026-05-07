/**
 * Intake Store Types — Cobertec Intake
 *
 * Tipos para las entidades de intake.db:
 *   - PendingReview: tickets en espera de revisión humana post-Redmine
 *   - ReviewAuditLog: historial de acciones sobre cada review
 *   - ReassignmentPattern: patrones de reasignación detectados
 *   - ConfigChangeLog: propuestas de cambio de configuración generadas por el agente LLM
 */

// ─── Status types ────────────────────────────────────────────

export type PendingReviewStatus =
  | 'pending_review'
  | 'approved'
  | 'reassigned'
  | 'escalated'
  | 'expired_unreviewed'
  | 'out_of_sync';

export type ReviewAuditAction =
  | 'created'
  | 'approved'
  | 'reassigned'
  | 'escalated'
  | 'expired_unreviewed'
  | 'reassign_failed'
  | 'out_of_sync_detected'
  | 'redmine_note_synced'
  | 'redmine_note_failed';

export type PatternStatus = 'buffering' | 'analyzed' | 'expired';

export type ConfigChangeType = 'proposed' | 'applied' | 'rejected';

// ─── Entidades ───────────────────────────────────────────────

export interface PendingReview {
  id: string;
  session_id: string;
  status: PendingReviewStatus;
  redmine_ticket_id: number;
  redmine_ticket_url: string;
  redmine_project_id: number;
  user_id: string;
  company_id: string;
  company_name: string;
  intake_description: string;
  original_classification: string;   // JSON string
  current_assignee_role: string;
  current_assignee_redmine_user_id: number;
  current_assignee_email: string;
  current_assignee_name: string;
  reassignment_count: number;
  reassignment_history: string | null;  // JSON string de ReassignmentHistoryEntry[]
  last_reassigned_by_name: string | null; // actor_name del último evento 'reassigned' (subquery)
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
  current_token_jti: string;
}

export interface ReviewAuditLog {
  id: string;
  pending_review_id: string;
  redmine_ticket_id: number;
  action: ReviewAuditAction;
  actor_type: string;       // 'system' | 'user'
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
  redmine_journal_id: number | null;
  redmine_sync_status: string | null;
  redmine_sync_error: string | null;
  payload: string | null;   // JSON string
  created_at: string;
}

export interface ReassignmentPattern {
  id: string;
  pattern_key: string;
  domain: string;
  from_role: string;
  to_role: string;
  occurrence_count: number;
  pending_review_ids: string;   // JSON string de string[]
  reasons: string;              // JSON string de string[]
  first_seen_at: string;
  last_seen_at: string;
  analyzed_at: string | null;
  status: PatternStatus;
}

export interface ConfigChangeLog {
  id: string;
  pattern_id: string | null;
  pending_review_ids: string | null;  // JSON string
  config_file: string;
  change_type: ConfigChangeType;
  diff: string;               // JSON string con { jsonpath, before, after }
  llm_reasoning: string | null;
  llm_summary: string | null;
  llm_confidence: string | null;
  human_reasons: string | null;
  reviewed_by: string | null;
  review_decision_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

// ─── Historial de reasignaciones ─────────────────────────────

export interface ReassignmentHistoryEntry {
  from_role: string;
  to_role: string;
  from_redmine_user_id: number;
  to_redmine_user_id: number;
  reason: string;
  reassigned_at: string;
}

// ─── DTOs de creación ────────────────────────────────────────

export interface CreatePendingReviewData {
  session_id: string;
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
  expires_at: string;
  current_token_jti: string;
}

export interface CreateAuditLogData {
  pending_review_id: string;
  redmine_ticket_id: number;
  action: ReviewAuditAction;
  actor_type: string;
  actor_user_id?: string | null;
  actor_redmine_user_id?: number | null;
  actor_name?: string | null;
  from_role?: string | null;
  from_redmine_user_id?: number | null;
  to_role?: string | null;
  to_redmine_user_id?: number | null;
  reason?: string | null;
  domain?: string | null;
  nature?: string | null;
  company_id?: string | null;
  redmine_journal_id?: number | null;
  redmine_sync_status?: string | null;
  redmine_sync_error?: string | null;
  payload?: string | null;
}

export interface CreateConfigChangeData {
  pattern_id?: string | null;
  pending_review_ids?: string | null;
  config_file: string;
  change_type: ConfigChangeType;
  diff: string;
  llm_reasoning?: string | null;
  llm_summary?: string | null;
  llm_confidence?: string | null;
}
