import type { ClassificationResponse, BillableInfo } from '../../types.js';
import type { BillableRulesConfig } from '../../config/loader.js';

export interface DisambiguationAnswer {
  question_id: string;
  selected_option_id: string;
}

/**
 * Evalúa si una clasificación es facturable según las reglas de `billable_rules`.
 * Devuelve null si no aplica ninguna regla.
 */
export function evaluateBillable(
  classification: ClassificationResponse,
  disambiguationAnswers: DisambiguationAnswer[],
  config: BillableRulesConfig | undefined
): BillableInfo | null {
  if (!config?.rules?.length) return null;

  const nature = classification.classification.nature;
  const domain = classification.classification.domain;

  for (const rule of config.rules) {
    if (rule.nature !== nature) continue;
    if (rule.domains && rule.domains.length > 0 && !rule.domains.includes(domain)) continue;

    if (rule.requires_disambiguation && rule.disambiguation_question_id) {
      const qId = rule.disambiguation_question_id;
      const answer = disambiguationAnswers.find(a => a.question_id === qId);

      if (!answer) {
        // Aún no se ha respondido la pregunta de desambiguación
        return {
          is_billable: false,
          requires_disambiguation: true,
          min_cost_eur: rule.min_cost_eur,
          notice_text: config.notice_template.replace('{min_cost_eur}', String(rule.min_cost_eur)),
          matched_rule_nature: nature,
        };
      }

      if (answer.selected_option_id === rule.billable_when_answer) {
        return {
          is_billable: true,
          requires_disambiguation: false,
          min_cost_eur: rule.min_cost_eur,
          notice_text: config.notice_template.replace('{min_cost_eur}', String(rule.min_cost_eur)),
          matched_rule_nature: nature,
        };
      }

      // Respondió pero no es la opción facturable → no facturable
      return null;
    }

    // Match directo sin desambiguación
    return {
      is_billable: true,
      requires_disambiguation: false,
      min_cost_eur: rule.min_cost_eur,
      notice_text: config.notice_template.replace('{min_cost_eur}', String(rule.min_cost_eur)),
      matched_rule_nature: nature,
    };
  }

  return null;
}

/**
 * Construye una ClarifyingQuestion a partir de una pregunta de desambiguación de facturación.
 */
export function buildBillingDisambiguationQuestion(
  questionId: string,
  config: BillableRulesConfig
): { question: string; options: string[]; reason: string; is_billing_disambiguation: boolean } | null {
  const qConfig = config.disambiguation_questions[questionId];
  if (!qConfig) return null;

  return {
    question: qConfig.question,
    options: qConfig.options.map(o => o.label),
    reason: `billing_disambiguation_${questionId}`,
    is_billing_disambiguation: true,
  };
}

/**
 * Dado el label seleccionado por el usuario, devuelve el option_id correspondiente.
 * Devuelve null si no se encuentra.
 */
export function findDisambiguationOptionId(
  questionId: string,
  selectedLabel: string,
  config: BillableRulesConfig
): string | null {
  const qConfig = config.disambiguation_questions[questionId];
  if (!qConfig) return null;
  const option = qConfig.options.find(o => o.label === selectedLabel);
  return option?.id ?? null;
}
