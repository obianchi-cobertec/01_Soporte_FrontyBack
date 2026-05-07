import { getAssignmentRules } from '../../config/loader.js';
import type { ClassificationResponse } from '../../types.js';

// =============================================================================
// Assignee Resolver — aplica las reglas de assignment-rules.json
// de forma determinista sobre la clasificación del LLM.
// Esto garantiza que el assignee siempre sea correcto independientemente
// de lo que haya devuelto el LLM.
// =============================================================================

export function resolveAssignee(classification: ClassificationResponse): string {
  const { master_rules, default_assignee } = getAssignmentRules();
  const rules = master_rules ?? [];

  const block = classification.redmine_mapping.block;
  const module = classification.redmine_mapping.module;
  const need = classification.redmine_mapping.need;
  const solution = classification.solution_associated;
  const nature = classification.classification.nature;

  // Ordenar por prioridad ascendente (menor = más específica)
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (!rule.assignee) continue; // ignorar objetos de comentario sin assignee
    const matchBlock = rule.block === '*' || rule.block === block;
    const matchModule = rule.module === '*' || rule.module === module;
    const matchNeed = rule.need === '*' || rule.need === need;
    const matchSolution = !rule.solution || rule.solution === '*' || rule.solution === solution;
    const matchNature = !rule.nature || rule.nature === '*' || rule.nature === nature;

    if (matchBlock && matchModule && matchNeed && matchSolution && matchNature) {
      return rule.assignee;
    }
  }

  return default_assignee ?? 'soporte_errores_expertis';
}