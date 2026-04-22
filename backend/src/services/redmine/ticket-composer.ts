import type { ClassificationResponse, IntakePayload } from '../../types.js';

const EXPERTIS_MODULE_LABELS: Record<string, string> = {
  general: 'General',
  financiero: 'Financiero',
  logistica: 'Logística',
  comercial: 'Comercial',
  proyectos: 'Proyectos',
  gmao: 'GMAO',
  crm: 'CRM',
  calidad: 'Calidad',
  rrhh: 'RRHH',
  fabricacion: 'Fabricación',
  no_aplica: '',
  no_claro: '',
};

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

export function composeSubject(classification: ClassificationResponse): string {
  const needsReview =
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
  classification: ClassificationResponse
): string {
  const attachmentCount = intake.attachments.length;

  return `## Descripción original del cliente:

${intake.description}

---

## Resumen operativo (IA):

${classification.summary}${attachmentCount > 0 ? `\n\nAdjuntos: ${attachmentCount} archivo(s)` : ''}`;
}
