import { getIntakeStore } from '../intake-store/store.js';
import type { ReassignmentPattern } from '../../intake-store-types.js';

export interface AggregatedPattern {
  domain: string;
  from_role: string;
  to_role: string;
  count: number;
  pending_review_ids: string[];
  reasons: string[];
}

export function aggregateRecentReassignments(hoursWindow: number): AggregatedPattern[] {
  const store = getIntakeStore();
  const cutoff = new Date(Date.now() - hoursWindow * 3600 * 1000).toISOString();
  const logs = store.listAuditLog({ action: 'reassigned' })
    .filter(l => l.created_at > cutoff && l.from_role && l.to_role && l.domain);

  const map = new Map<string, AggregatedPattern>();
  for (const log of logs) {
    const key = `${log.domain}|${log.from_role}|${log.to_role}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      existing.pending_review_ids.push(log.pending_review_id);
      if (log.reason) existing.reasons.push(log.reason);
    } else {
      map.set(key, {
        domain: log.domain!,
        from_role: log.from_role!,
        to_role: log.to_role!,
        count: 1,
        pending_review_ids: [log.pending_review_id],
        reasons: log.reason ? [log.reason] : [],
      });
    }
  }
  return Array.from(map.values());
}

export function upsertPatternsFromAggregation(aggregations: AggregatedPattern[]): void {
  const store = getIntakeStore();
  for (const agg of aggregations) {
    for (const prId of agg.pending_review_ids) {
      store.upsertPattern({
        domain: agg.domain,
        from_role: agg.from_role,
        to_role: agg.to_role,
        pending_review_id: prId,
        reason: agg.reasons[0] ?? '',
      });
    }
  }
}

export function selectPatternsForAnalysis(): ReassignmentPattern[] {
  return getIntakeStore().listPatternsByStatus('buffering');
}

export function expireStaleBufferPatterns(bufferDays: number): void {
  getIntakeStore().expireStalePatterns(bufferDays);
}
