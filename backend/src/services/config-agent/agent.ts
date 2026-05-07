/**
 * Config Agent — análisis nocturno de patrones de reasignación
 *
 * Orquesta el ciclo: agregar patrones → seleccionar → llamar LLM → persistir propuestas.
 * Se invoca desde index.ts vía cron diario a las 03:00 UTC.
 */

import { getIntakeStore } from '../intake-store/store.js';
import { aggregateRecentReassignments, upsertPatternsFromAggregation, selectPatternsForAnalysis, expireStaleBufferPatterns } from './pattern-aggregator.js';
import { buildAgentSystemPrompt, buildAgentUserPrompt } from './prompt-builder.js';
import { validateAgentResponse } from './response-validator.js';
import { getLLMProvider } from '../llm/index.js';
import type { ReassignmentPattern, ConfigChangeType } from '../../intake-store-types.js';

interface ProposedChange {
  config_file: string;
  jsonpath: string;
  before: unknown;
  after: unknown;
  reasoning: string;
  summary: string;
  confidence: string;
}

export async function runAgent(): Promise<void> {
  console.log('[ConfigAgent] Iniciando ciclo de análisis...');

  const bufferDays = parseInt(process.env.REASSIGNMENT_PATTERN_BUFFER_DAYS ?? '14', 10);

  // 1. Agregar reasignaciones recientes (últimas 24h)
  const aggregations = aggregateRecentReassignments(24);
  upsertPatternsFromAggregation(aggregations);

  // 2. Expirar patrones obsoletos
  expireStaleBufferPatterns(bufferDays);

  // 3. Seleccionar patrones para análisis
  const patterns = selectPatternsForAnalysis();
  if (patterns.length === 0) {
    console.log('[ConfigAgent] No hay patrones para analizar.');
    return;
  }

  console.log(`[ConfigAgent] Analizando ${patterns.length} patrón(es)...`);

  for (const pattern of patterns) {
    await analyzePattern(pattern);
  }
}

async function analyzePattern(pattern: ReassignmentPattern): Promise<void> {
  const store = getIntakeStore();

  try {
    const auditLogs = store.listAuditLog({ pending_review_id: undefined });
    const patternIds: string[] = JSON.parse(pattern.pending_review_ids) as string[];
    const relatedLogs = auditLogs.filter(log => patternIds.includes(log.pending_review_id));

    const systemPrompt = buildAgentSystemPrompt();
    const userPrompt = buildAgentUserPrompt([pattern], relatedLogs);

    // Llamar directamente al proveedor LLM (capa de bajo nivel compartida con el clasificador)
    const llmResponse = await getLLMProvider().call(systemPrompt, userPrompt);
    const rawResponse = llmResponse.text;

    const agentOutput = validateAgentResponse(rawResponse);

    if (!agentOutput) {
      console.error(`[ConfigAgent] Respuesta inválida para patrón ${pattern.id}`);
      store.markPatternAnalyzed(pattern.id);
      return;
    }

    if (agentOutput.no_changes_needed) {
      console.log(`[ConfigAgent] Patrón ${pattern.id}: sin cambios necesarios`);
      store.markPatternAnalyzed(pattern.id);
      return;
    }

    const filteredChanges = checkAntiCycle(agentOutput.proposed_changes as ProposedChange[]);

    for (const change of filteredChanges) {
      store.createConfigChangeLog({
        pattern_id: pattern.id,
        pending_review_ids: pattern.pending_review_ids,
        config_file: change.config_file,
        change_type: 'proposed' as ConfigChangeType,
        diff: JSON.stringify({ jsonpath: change.jsonpath, before: change.before, after: change.after }),
        llm_reasoning: change.reasoning,
        llm_summary: change.summary,
        llm_confidence: change.confidence,
      });
    }

    store.markPatternAnalyzed(pattern.id);
    console.log(`[ConfigAgent] Patrón ${pattern.id}: ${filteredChanges.length} propuesta(s) generadas`);
  } catch (e: unknown) {
    console.error(`[ConfigAgent] Error analizando patrón ${pattern.id}:`, e);
    store.markPatternAnalyzed(pattern.id);
  }
}

function checkAntiCycle(proposed: ProposedChange[]): ProposedChange[] {
  const store = getIntakeStore();
  const cutoff = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const recentApplied = store.listConfigChangeLogs({ change_type: 'applied' as ConfigChangeType })
    .filter(c => c.created_at > cutoff);

  return proposed.filter(change => {
    return !recentApplied.some(applied => {
      try {
        const appliedDiff = JSON.parse(applied.diff) as { jsonpath: string; before: unknown; after: unknown };
        return appliedDiff.jsonpath === change.jsonpath &&
               JSON.stringify(appliedDiff.before) === JSON.stringify(change.after);
      } catch {
        return false;
      }
    });
  });
}
