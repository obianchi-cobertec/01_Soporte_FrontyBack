import type { ClassificationResponse, IntakePayload, BillableInfo, BillingAcceptance } from '../../types.js';

/** Elimina patrones de sujeto en tercera persona que el LLM puede generar */
function stripSubject(text: string): string {
  return text
    .replace(/^el (cliente|usuario|técnico)\s+(no\s+puede|intenta|encuentra|reporta|indica|dice|tiene|quiere|necesita|solicita)\s+/i, '')
    .replace(/^(un usuario|el sistema)\s+/i, '')
    .trim();
}

function truncate(text: string, maxLen: number): string {
  const firstSentence = text.split(/[.!?]\s/)[0];
  const base = firstSentence.length <= maxLen ? firstSentence : text;
  if (base.length <= maxLen) return base;
  return base.slice(0, maxLen - 3) + '...';
}

export function composeSubject(classification: ClassificationResponse, forceReview?: boolean): string {
  const needsReview =
    forceReview === true ||
    classification.confidence === 'low' ||
    classification.review_status === 'out_of_map' ||
    classification.review_status === 'human_required';

  const summary = stripSubject(classification.summary);

  if (needsReview) {
    return `[REVISIÓN] ${truncate(summary, 72)}`;
  }

  return truncate(summary, 80);
}

export function composeDescription(
  intake: IntakePayload,
  classification: ClassificationResponse,
  clarification?: { question: string; answer: string },
  billable?: BillableInfo | null,
  billingAcceptance?: BillingAcceptance | null
): string {
  const attachmentCount = intake.attachments.length;

  let description = `## Descripción original del cliente:\n\n${intake.description}`;

  if (clarification) {
    description += `\n\n---\n\n## Aclaración del usuario:\n\n**Pregunta:** ${clarification.question}\n\n**Respuesta:** ${clarification.answer}`;
  }

  description += `\n\n---\n\n## Resumen operativo (IA):\n\n${classification.summary}`;

  if (attachmentCount > 0) {
    description += `\n\nAdjuntos: ${attachmentCount} archivo(s)`;
  }

  if (billable?.is_billable && billingAcceptance?.accepted) {
    const d = new Date(billingAcceptance.accepted_at);
    const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    description += `\n\n**Coste mínimo aceptado por el cliente:** ${billable.min_cost_eur}€ (aceptado el ${dateStr})`;
  }

  return description;
}
