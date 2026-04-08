import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { IntakeEvent, EventType } from '../../types.js';

// =============================================================================
// Event Store — Registro de eventos para métricas del piloto
//
// Almacena cada evento del flujo de intake en SQLite.
// Diseñado para ser ligero y autocontenido en el MVP.
// Migrable a PostgreSQL si se necesita en producción.
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = resolve(__dirname, '../../../data/events.db');

let db: Database.Database | null = null;

export function initEventStore(dbPath?: string): void {
  const path = dbPath ?? process.env.EVENT_STORE_PATH ?? DEFAULT_DB_PATH;

  db = new Database(path);

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  `);
}

export function logEvent(
  eventType: EventType,
  sessionId: string,
  data: Record<string, unknown> = {}
): IntakeEvent {
  if (!db) {
    throw new Error('Event store no inicializado. Llama a initEventStore() primero.');
  }

  const event: IntakeEvent = {
    event_id: uuidv4(),
    event_type: eventType,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    data,
  };

  const stmt = db.prepare(`
    INSERT INTO events (event_id, event_type, session_id, timestamp, data)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    event.event_id,
    event.event_type,
    event.session_id,
    event.timestamp,
    JSON.stringify(event.data)
  );

  return event;
}

export function getEventsBySession(sessionId: string): IntakeEvent[] {
  if (!db) {
    throw new Error('Event store no inicializado.');
  }

  const rows = db.prepare(
    'SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC'
  ).all(sessionId) as Array<{
    event_id: string;
    event_type: string;
    session_id: string;
    timestamp: string;
    data: string;
  }>;

  return rows.map(row => ({
    event_id: row.event_id,
    event_type: row.event_type as EventType,
    session_id: row.session_id,
    timestamp: row.timestamp,
    data: JSON.parse(row.data),
  }));
}

export function getEventsByType(eventType: EventType, limit = 100): IntakeEvent[] {
  if (!db) {
    throw new Error('Event store no inicializado.');
  }

  const rows = db.prepare(
    'SELECT * FROM events WHERE event_type = ? ORDER BY timestamp DESC LIMIT ?'
  ).all(eventType, limit) as Array<{
    event_id: string;
    event_type: string;
    session_id: string;
    timestamp: string;
    data: string;
  }>;

  return rows.map(row => ({
    event_id: row.event_id,
    event_type: row.event_type as EventType,
    session_id: row.session_id,
    timestamp: row.timestamp,
    data: JSON.parse(row.data),
  }));
}

/** Métricas básicas del piloto */
export function getPilotMetrics(): Record<string, unknown> {
  if (!db) {
    throw new Error('Event store no inicializado.');
  }

  const totalFlows = db.prepare(
    "SELECT COUNT(DISTINCT session_id) as count FROM events WHERE event_type = 'flow_started'"
  ).get() as { count: number };

  const completedFlows = db.prepare(
    "SELECT COUNT(DISTINCT session_id) as count FROM events WHERE event_type = 'ticket_created'"
  ).get() as { count: number };

  const abandonedFlows = db.prepare(
    "SELECT COUNT(DISTINCT session_id) as count FROM events WHERE event_type = 'flow_abandoned'"
  ).get() as { count: number };

  const edits = db.prepare(
    "SELECT COUNT(*) as count FROM events WHERE event_type = 'confirmation_edited'"
  ).get() as { count: number };

  const errors = db.prepare(
    "SELECT COUNT(*) as count FROM events WHERE event_type = 'flow_error'"
  ).get() as { count: number };

  const confidenceDistribution = db.prepare(`
    SELECT json_extract(data, '$.confidence') as confidence, COUNT(*) as count
    FROM events
    WHERE event_type = 'classification_completed'
    GROUP BY json_extract(data, '$.confidence')
  `).all() as Array<{ confidence: string; count: number }>;

  const avgDuration = db.prepare(`
    SELECT AVG(CAST(json_extract(data, '$.duration_ms') AS REAL)) as avg_ms
    FROM events
    WHERE event_type = 'classification_completed'
  `).get() as { avg_ms: number | null };

  return {
    total_flows: totalFlows.count,
    completed_flows: completedFlows.count,
    abandoned_flows: abandonedFlows.count,
    completion_rate: totalFlows.count > 0
      ? (completedFlows.count / totalFlows.count * 100).toFixed(1) + '%'
      : 'N/A',
    total_edits: edits.count,
    total_errors: errors.count,
    confidence_distribution: Object.fromEntries(
      confidenceDistribution.map(r => [r.confidence, r.count])
    ),
    avg_classification_ms: avgDuration.avg_ms ? Math.round(avgDuration.avg_ms) : null,
  };
}

export function closeEventStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}
