const API_BASE = '/api';

export interface PilotMetrics {
  total_flows: number;
  completed_flows: number;
  abandoned_flows: number;
  completion_rate: string;
  total_edits: number;
  total_errors: number;
  confidence_distribution: Record<string, number>;
  avg_classification_ms: number | null;
}

export interface RecentTicket {
  session_id: string;
  ticket_id: string;
  created_at: string;
  nature: string;
  domain: string;
  confidence: string;
  review_status: string;
  duration_ms: number | null;
}

export async function fetchMetrics(): Promise<PilotMetrics> {
  const res = await fetch(`${API_BASE}/metrics`);
  return res.json();
}

export async function fetchRecentTickets(): Promise<RecentTicket[]> {
  const res = await fetch(`${API_BASE}/metrics/recent`);
  const data = await res.json();
  return data.tickets ?? [];
}
