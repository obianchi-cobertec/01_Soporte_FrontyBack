/**
 * Intake Store — SQLite persistence para revisiones humanas post-Redmine
 *
 * Base: data/intake.db
 * Tablas: pending_reviews, review_audit_log, reassignment_patterns, config_change_log
 */

import Database from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';
import type {
  PendingReview,
  PendingReviewStatus,
  ReviewAuditLog,
  ReviewAuditAction,
  ReassignmentPattern,
  PatternStatus,
  ConfigChangeLog,
  ConfigChangeType,
  ReassignmentHistoryEntry,
  CreatePendingReviewData,
  CreateAuditLogData,
  CreateConfigChangeData,
} from '../../intake-store-types.js';

const INTAKE_DB_PATH = process.env.INTAKE_DB_PATH ?? 'data/intake.db';

export class IntakeStore {
  private db: Database.Database;

  constructor(dbPath: string = INTAKE_DB_PATH) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  // ─── Schema ─────────────────────────────────────────────

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_reviews (
        id                              TEXT PRIMARY KEY,
        session_id                      TEXT NOT NULL,
        status                          TEXT NOT NULL,
        redmine_ticket_id               INTEGER NOT NULL,
        redmine_ticket_url              TEXT NOT NULL,
        redmine_project_id              INTEGER NOT NULL,
        user_id                         TEXT NOT NULL,
        company_id                      TEXT NOT NULL,
        company_name                    TEXT NOT NULL,
        intake_description              TEXT NOT NULL,
        original_classification         TEXT NOT NULL,
        current_assignee_role           TEXT NOT NULL,
        current_assignee_redmine_user_id INTEGER NOT NULL,
        current_assignee_email          TEXT NOT NULL,
        current_assignee_name           TEXT NOT NULL,
        reassignment_count              INTEGER NOT NULL DEFAULT 0,
        reassignment_history            TEXT,
        created_at                      TEXT NOT NULL,
        expires_at                      TEXT NOT NULL,
        resolved_at                     TEXT,
        current_token_jti               TEXT NOT NULL UNIQUE
      );

      CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_reviews(status);
      CREATE INDEX IF NOT EXISTS idx_pending_expires ON pending_reviews(expires_at);
      CREATE INDEX IF NOT EXISTS idx_pending_assignee ON pending_reviews(current_assignee_redmine_user_id);

      CREATE TABLE IF NOT EXISTS review_audit_log (
        id                    TEXT PRIMARY KEY,
        pending_review_id     TEXT NOT NULL,
        redmine_ticket_id     INTEGER NOT NULL,
        action                TEXT NOT NULL,
        actor_type            TEXT NOT NULL,
        actor_user_id         TEXT,
        actor_redmine_user_id INTEGER,
        actor_name            TEXT,
        from_role             TEXT,
        from_redmine_user_id  INTEGER,
        to_role               TEXT,
        to_redmine_user_id    INTEGER,
        reason                TEXT,
        domain                TEXT,
        nature                TEXT,
        company_id            TEXT,
        redmine_journal_id    INTEGER,
        redmine_sync_status   TEXT,
        redmine_sync_error    TEXT,
        payload               TEXT,
        created_at            TEXT NOT NULL,
        FOREIGN KEY (pending_review_id) REFERENCES pending_reviews(id)
      );

      CREATE INDEX IF NOT EXISTS idx_audit_pending ON review_audit_log(pending_review_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON review_audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_audit_domain_action ON review_audit_log(domain, action);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON review_audit_log(created_at);

      CREATE TABLE IF NOT EXISTS reassignment_patterns (
        id                  TEXT PRIMARY KEY,
        pattern_key         TEXT NOT NULL,
        domain              TEXT NOT NULL,
        from_role           TEXT NOT NULL,
        to_role             TEXT NOT NULL,
        occurrence_count    INTEGER NOT NULL,
        pending_review_ids  TEXT NOT NULL,
        reasons             TEXT NOT NULL,
        first_seen_at       TEXT NOT NULL,
        last_seen_at        TEXT NOT NULL,
        analyzed_at         TEXT,
        status              TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pattern_key ON reassignment_patterns(pattern_key);
      CREATE INDEX IF NOT EXISTS idx_pattern_status ON reassignment_patterns(status);

      CREATE TABLE IF NOT EXISTS config_change_log (
        id                      TEXT PRIMARY KEY,
        pattern_id              TEXT,
        pending_review_ids      TEXT,
        config_file             TEXT NOT NULL,
        change_type             TEXT NOT NULL,
        diff                    TEXT NOT NULL,
        llm_reasoning           TEXT,
        llm_summary             TEXT,
        llm_confidence          TEXT,
        human_reasons           TEXT,
        reviewed_by             TEXT,
        review_decision_reason  TEXT,
        created_at              TEXT NOT NULL,
        reviewed_at             TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_config_change_type ON config_change_log(change_type);
      CREATE INDEX IF NOT EXISTS idx_config_change_file ON config_change_log(config_file);
    `);
  }

  // ─── pending_reviews ────────────────────────────────────

  createPendingReview(data: CreatePendingReviewData): PendingReview {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO pending_reviews (
        id, session_id, status, redmine_ticket_id, redmine_ticket_url, redmine_project_id,
        user_id, company_id, company_name, intake_description, original_classification,
        current_assignee_role, current_assignee_redmine_user_id, current_assignee_email,
        current_assignee_name, reassignment_count, reassignment_history,
        created_at, expires_at, resolved_at, current_token_jti
      ) VALUES (
        ?, ?, 'pending_review', ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, 0, NULL,
        ?, ?, NULL, ?
      )
    `).run(
      id,
      data.session_id,
      data.redmine_ticket_id,
      data.redmine_ticket_url,
      data.redmine_project_id,
      data.user_id,
      data.company_id,
      data.company_name,
      data.intake_description,
      data.original_classification,
      data.current_assignee_role,
      data.current_assignee_redmine_user_id,
      data.current_assignee_email,
      data.current_assignee_name,
      now,
      data.expires_at,
      data.current_token_jti,
    );
    return this.getPendingReviewById(id)!;
  }

  getPendingReviewById(id: string): PendingReview | null {
    return this.db.prepare(
      'SELECT * FROM pending_reviews WHERE id = ?'
    ).get(id) as PendingReview | null;
  }

  getPendingReviewByJti(jti: string): PendingReview | null {
    return this.db.prepare(
      'SELECT * FROM pending_reviews WHERE current_token_jti = ?'
    ).get(jti) as PendingReview | null;
  }

  updatePendingReviewStatus(id: string, status: PendingReviewStatus, resolvedAt?: string): void {
    if (resolvedAt) {
      this.db.prepare(`
        UPDATE pending_reviews SET status = ?, resolved_at = ? WHERE id = ?
      `).run(status, resolvedAt, id);
    } else {
      this.db.prepare(`
        UPDATE pending_reviews SET status = ? WHERE id = ?
      `).run(status, id);
    }
  }

  updatePendingReviewAssignee(
    id: string,
    data: { role: string; redmine_user_id: number; email: string; name: string }
  ): void {
    this.db.prepare(`
      UPDATE pending_reviews
      SET current_assignee_role = ?,
          current_assignee_redmine_user_id = ?,
          current_assignee_email = ?,
          current_assignee_name = ?
      WHERE id = ?
    `).run(data.role, data.redmine_user_id, data.email, data.name, id);
  }

  incrementReassignmentCount(id: string): void {
    this.db.prepare(`
      UPDATE pending_reviews SET reassignment_count = reassignment_count + 1 WHERE id = ?
    `).run(id);
  }

  appendReassignmentHistory(id: string, entry: ReassignmentHistoryEntry): void {
    const row = this.db.prepare(
      'SELECT reassignment_history FROM pending_reviews WHERE id = ?'
    ).get(id) as { reassignment_history: string | null } | undefined;

    const current: ReassignmentHistoryEntry[] = row?.reassignment_history
      ? (JSON.parse(row.reassignment_history) as ReassignmentHistoryEntry[])
      : [];
    current.push(entry);

    this.db.prepare(`
      UPDATE pending_reviews SET reassignment_history = ? WHERE id = ?
    `).run(JSON.stringify(current), id);
  }

  rotateToken(id: string, newJti: string): void {
    this.db.prepare(`
      UPDATE pending_reviews SET current_token_jti = ? WHERE id = ?
    `).run(newJti, id);
  }

  listPendingReviews(filters?: {
    status?: PendingReviewStatus;
    company_id?: string;
    assignee_redmine_user_id?: number;
    from_date?: string;
    to_date?: string;
  }): PendingReview[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.company_id) {
      conditions.push('company_id = ?');
      params.push(filters.company_id);
    }
    if (filters?.assignee_redmine_user_id !== undefined) {
      conditions.push('current_assignee_redmine_user_id = ?');
      params.push(filters.assignee_redmine_user_id);
    }
    if (filters?.from_date) {
      conditions.push('created_at >= ?');
      params.push(filters.from_date);
    }
    if (filters?.to_date) {
      conditions.push('created_at <= ?');
      params.push(filters.to_date);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.db.prepare(
      `SELECT pr.*,
         (SELECT ral.actor_name FROM review_audit_log ral
          WHERE ral.pending_review_id = pr.id AND ral.action = 'reassigned'
          ORDER BY ral.created_at DESC LIMIT 1) AS last_reassigned_by_name
       FROM pending_reviews pr ${where} ORDER BY pr.created_at DESC`
    ).all(...params) as PendingReview[];
  }

  getPendingReviewsExpired(): PendingReview[] {
    return this.db.prepare(`
      SELECT * FROM pending_reviews
      WHERE status = 'pending_review'
        AND expires_at < datetime('now')
    `).all() as PendingReview[];
  }

  getPendingReviewsActiveForSync(): PendingReview[] {
    return this.db.prepare(`
      SELECT * FROM pending_reviews
      WHERE status = 'pending_review'
        AND created_at > datetime('now', '-7 days')
    `).all() as PendingReview[];
  }

  // ─── review_audit_log ───────────────────────────────────

  logAuditEvent(data: CreateAuditLogData): ReviewAuditLog {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO review_audit_log (
        id, pending_review_id, redmine_ticket_id, action, actor_type,
        actor_user_id, actor_redmine_user_id, actor_name,
        from_role, from_redmine_user_id, to_role, to_redmine_user_id,
        reason, domain, nature, company_id,
        redmine_journal_id, redmine_sync_status, redmine_sync_error, payload,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.pending_review_id,
      data.redmine_ticket_id,
      data.action,
      data.actor_type,
      data.actor_user_id ?? null,
      data.actor_redmine_user_id ?? null,
      data.actor_name ?? null,
      data.from_role ?? null,
      data.from_redmine_user_id ?? null,
      data.to_role ?? null,
      data.to_redmine_user_id ?? null,
      data.reason ?? null,
      data.domain ?? null,
      data.nature ?? null,
      data.company_id ?? null,
      data.redmine_journal_id ?? null,
      data.redmine_sync_status ?? null,
      data.redmine_sync_error ?? null,
      data.payload ?? null,
      now,
    );
    return this.db.prepare(
      'SELECT * FROM review_audit_log WHERE id = ?'
    ).get(id) as ReviewAuditLog;
  }

  listAuditLog(filters?: {
    pending_review_id?: string;
    action?: ReviewAuditAction;
  }): ReviewAuditLog[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.pending_review_id) {
      conditions.push('pending_review_id = ?');
      params.push(filters.pending_review_id);
    }
    if (filters?.action) {
      conditions.push('action = ?');
      params.push(filters.action);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.db.prepare(
      `SELECT * FROM review_audit_log ${where} ORDER BY created_at ASC`
    ).all(...params) as ReviewAuditLog[];
  }

  // ─── reassignment_patterns ──────────────────────────────

  upsertPattern(data: {
    domain: string;
    from_role: string;
    to_role: string;
    pending_review_id: string;
    reason: string;
  }): void {
    const key = createHash('sha256')
      .update(`${data.domain}|${data.from_role}|${data.to_role}`)
      .digest('hex')
      .slice(0, 16);

    const now = new Date().toISOString();
    const existing = this.db.prepare(
      'SELECT * FROM reassignment_patterns WHERE pattern_key = ?'
    ).get(key) as ReassignmentPattern | undefined;

    if (existing) {
      const ids: string[] = JSON.parse(existing.pending_review_ids) as string[];
      const reasons: string[] = JSON.parse(existing.reasons) as string[];
      if (!ids.includes(data.pending_review_id)) ids.push(data.pending_review_id);
      if (!reasons.includes(data.reason)) reasons.push(data.reason);

      this.db.prepare(`
        UPDATE reassignment_patterns
        SET occurrence_count = occurrence_count + 1,
            pending_review_ids = ?,
            reasons = ?,
            last_seen_at = ?
        WHERE pattern_key = ?
      `).run(JSON.stringify(ids), JSON.stringify(reasons), now, key);
    } else {
      const id = randomUUID();
      this.db.prepare(`
        INSERT INTO reassignment_patterns (
          id, pattern_key, domain, from_role, to_role,
          occurrence_count, pending_review_ids, reasons,
          first_seen_at, last_seen_at, analyzed_at, status
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL, 'buffering')
      `).run(
        id,
        key,
        data.domain,
        data.from_role,
        data.to_role,
        JSON.stringify([data.pending_review_id]),
        JSON.stringify([data.reason]),
        now,
        now,
      );
    }
  }

  listPatternsByStatus(status: PatternStatus): ReassignmentPattern[] {
    return this.db.prepare(
      'SELECT * FROM reassignment_patterns WHERE status = ? ORDER BY occurrence_count DESC'
    ).all(status) as ReassignmentPattern[];
  }

  markPatternAnalyzed(id: string): void {
    this.db.prepare(`
      UPDATE reassignment_patterns SET status = 'analyzed', analyzed_at = ? WHERE id = ?
    `).run(new Date().toISOString(), id);
  }

  expireStalePatterns(bufferDays: number): void {
    this.db.prepare(`
      UPDATE reassignment_patterns
      SET status = 'expired'
      WHERE status = 'buffering'
        AND last_seen_at < datetime('now', ? || ' days')
    `).run(`-${bufferDays}`);
  }

  // ─── config_change_log ──────────────────────────────────

  createConfigChangeLog(data: CreateConfigChangeData): ConfigChangeLog {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO config_change_log (
        id, pattern_id, pending_review_ids, config_file, change_type,
        diff, llm_reasoning, llm_summary, llm_confidence,
        human_reasons, reviewed_by, review_decision_reason,
        created_at, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL)
    `).run(
      id,
      data.pattern_id ?? null,
      data.pending_review_ids ?? null,
      data.config_file,
      data.change_type,
      data.diff,
      data.llm_reasoning ?? null,
      data.llm_summary ?? null,
      data.llm_confidence ?? null,
      now,
    );
    return this.getConfigChangeLogById(id)!;
  }

  listConfigChangeLogs(filters?: {
    change_type?: ConfigChangeType;
    config_file?: string;
  }): ConfigChangeLog[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.change_type) {
      conditions.push('change_type = ?');
      params.push(filters.change_type);
    }
    if (filters?.config_file) {
      conditions.push('config_file = ?');
      params.push(filters.config_file);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.db.prepare(
      `SELECT * FROM config_change_log ${where} ORDER BY created_at DESC`
    ).all(...params) as ConfigChangeLog[];
  }

  getConfigChangeLogById(id: string): ConfigChangeLog | null {
    return this.db.prepare(
      'SELECT * FROM config_change_log WHERE id = ?'
    ).get(id) as ConfigChangeLog | null;
  }

  updateConfigChangeDecision(
    id: string,
    data: { change_type: ConfigChangeType; reviewed_by: string; reason?: string }
  ): void {
    this.db.prepare(`
      UPDATE config_change_log
      SET change_type = ?, reviewed_by = ?, review_decision_reason = ?, reviewed_at = ?
      WHERE id = ?
    `).run(data.change_type, data.reviewed_by, data.reason ?? null, new Date().toISOString(), id);
  }

  // ─── Lifecycle ────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}

// ─── Singleton ──────────────────────────────────────────

let instance: IntakeStore | null = null;

export function getIntakeStore(): IntakeStore {
  if (!instance) {
    instance = new IntakeStore();
  }
  return instance;
}
