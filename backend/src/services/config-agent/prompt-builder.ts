import { getTaxonomy, getRedmineMapping, getAssignmentRules } from '../../config/loader.js';
import type { ReassignmentPattern } from '../../intake-store-types.js';

export function buildAgentSystemPrompt(): string {
  return `Eres un agente de optimización de configuración para un sistema de intake de soporte técnico.
Analiza patrones de reasignación de tickets y propón mejoras a los archivos de configuración.
Responde SIEMPRE con un JSON válido con este schema:
{
  "analysis": "string",
  "proposed_changes": [{ "config_file": "assignment-rules.json|redmine-mapping.json|taxonomy.json", "jsonpath": "string", "before": any, "after": any, "reasoning": "string", "summary": "string", "confidence": "high|medium|low" }],
  "no_changes_needed": boolean,
  "reasoning": "string"
}`;
}

export function buildAgentUserPrompt(patterns: ReassignmentPattern[], auditLogs: unknown[]): string {
  const taxonomy = getTaxonomy();
  const mapping = getRedmineMapping();
  const rules = getAssignmentRules();

  return `## Patrones de reasignación detectados
${JSON.stringify(patterns, null, 2)}

## Historial de reasignaciones relacionadas
${JSON.stringify(auditLogs.slice(0, 20), null, 2)}

## Configuración actual (assignment-rules.json)
${JSON.stringify(rules, null, 2)}

## role_to_user_id actual
${JSON.stringify(mapping.role_to_user_id ?? {}, null, 2)}

Analiza los patrones y propón cambios concretos si hay evidencia suficiente.`;
}
