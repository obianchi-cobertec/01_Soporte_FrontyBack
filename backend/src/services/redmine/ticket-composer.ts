import type { ClassificationResponse, IntakePayload } from '../../types.js';

const NATURE_LABELS: Record<string, string> = {
  incidencia_error: 'ERROR',
  consulta_funcional: 'CONSULTA',
  formacion_duda_uso: 'FORMACIÓN',
  configuracion: 'CONFIGURACIÓN',
  peticion_cambio_mejora: 'MEJORA',
  usuario_acceso: 'ACCESO',
  instalacion_entorno: 'INSTALACIÓN',
  importacion_exportacion: 'IMPORTACIÓN',
  rendimiento_bloqueo: 'RENDIMIENTO',
  ambiguo: 'REVISIÓN',
};

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

/**
 * Resuelve el área legible para el asunto a partir de solution_associated
 * y expertis_module. Ejemplos:
 *   Expertis / Movilsat ERP + gmao     → "Expertis — GMAO"
 *   Expertis / Movilsat ERP + general  → "Expertis — General"
 *   Movilsat                           → "Movilsat"
 *   Portal OT                          → "Portal OT"
 */
function resolveAreaLabel(classification: ClassificationResponse): string {
  const solution = classification.solution_associated;

  if (solution === 'Expertis / Movilsat ERP') {
    const mod = classification.expertis_module;
    const modLabel = mod ? (EXPERTIS_MODULE_LABELS[mod] ?? '') : '';
    return modLabel ? `Expertis — ${modLabel}` : 'Expertis';
  }

  return solution;
}

export function composeSubject(classification: ClassificationResponse): string {
  const needsReview =
    classification.confidence === 'low' ||
    classification.review_status === 'out_of_map' ||
    classification.review_status === 'human_required';

  if (needsReview) {
    const summary = truncate(classification.summary, 70);
    return `[REVISIÓN] — ${summary}`;
  }

  const natureLabel = NATURE_LABELS[classification.classification.nature] ?? 'OTRO';
  const areaLabel = resolveAreaLabel(classification);
  const summary = truncate(classification.summary, 60);

  return `[${natureLabel}] ${areaLabel} — ${summary}`;
}

export function composeDescription(
  intake: IntakePayload,
  classification: ClassificationResponse
): string {
  const attachmentCount = intake.attachments.length;
  const moduleLine = classification.expertis_module &&
    classification.expertis_module !== 'no_aplica' &&
    classification.expertis_module !== 'no_claro'
    ? `\n- Módulo Expertis: ${EXPERTIS_MODULE_LABELS[classification.expertis_module] ?? classification.expertis_module}`
    : '';

  return `## Descripción original del cliente

${intake.description}

## Resumen operativo (generado por IA)

${classification.summary}

## Clasificación propuesta

- Naturaleza: ${classification.classification.nature}
- Solución: ${classification.solution_associated}${moduleLine}
- Objeto: ${classification.classification.object}
- Acción: ${classification.classification.action}
- Bloque: ${classification.redmine_mapping.block}
- Módulo: ${classification.redmine_mapping.module}
- Necesidad: ${classification.redmine_mapping.need}

## Datos del caso

- Confianza: ${classification.confidence}
- Estado de revisión: ${classification.review_status}
- Prioridad sugerida: ${classification.suggested_priority}
- Responsable propuesto: ${classification.suggested_assignee ?? '(por defecto)'}

## Contexto

- Empresa: ${intake.company_name}
- Usuario: ${intake.user_id}
- Sesión intake: ${intake.session_id}
- Adjuntos: ${attachmentCount} archivo(s)

---
*Ticket creado por intake IA v1 — ${new Date().toISOString()}*`;
}

function truncate(text: string, maxLen: number): string {
  const firstSentence = text.split(/[.!?]\s/)[0];
  const base = firstSentence.length <= maxLen ? firstSentence : text;
  if (base.length <= maxLen) return base;
  return base.slice(0, maxLen - 3) + '...';
}