import type { ClassificationResponse, IntakePayload } from '../../types.js';

// =============================================================================
// Ticket Composer — Bloque 6
//
// Genera el asunto y la descripción enriquecida del ticket para Redmine.
// Sigue las reglas de composición definidas en la especificación.
// =============================================================================

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

const DOMAIN_LABELS: Record<string, string> = {
  funcionamiento_general: 'General',
  compras: 'Compras',
  ventas_facturacion: 'Ventas y facturación',
  almacen_stocks: 'Almacén y stocks',
  gmao: 'GMAO',
  movilsat: 'Movilsat',
  portal_ot: 'Portal OT',
  presupuestos_proyectos: 'Presupuestos y proyectos',
  financiero: 'Financiero',
  crm: 'CRM',
  ofertas_comerciales: 'Ofertas comerciales',
  planificador_inteligente: 'Planificador inteligente',
  app_fichajes: 'App fichajes',
  servidor_sistemas: 'Servidor / sistemas',
  tarifas_catalogos: 'Tarifas y catálogos',
  dominio_no_claro: 'No clasificado',
};

/**
 * Genera el asunto del ticket según la regla de composición:
 * [NATURALEZA] Dominio — Resumen breve (máx 80 caracteres en la parte libre)
 *
 * Si la confianza es baja o el caso está fuera de mapa:
 * [REVISIÓN] — Resumen breve
 */
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
  const domainLabel = DOMAIN_LABELS[classification.classification.domain] ?? 'Otro';
  const summary = truncate(classification.summary, 60);

  return `[${natureLabel}] ${domainLabel} — ${summary}`;
}

/**
 * Genera la descripción enriquecida del ticket.
 * Incluye texto original, resumen IA, clasificación, datos del caso y contexto.
 */
export function composeDescription(
  intake: IntakePayload,
  classification: ClassificationResponse
): string {
  const attachmentCount = intake.attachments.length;

  return `## Descripción original del cliente

${intake.description}

## Resumen operativo (generado por IA)

${classification.summary}

## Clasificación propuesta

- Naturaleza: ${classification.classification.nature}
- Dominio: ${classification.classification.domain}
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
  // Tomar solo la primera frase si hay varias
  const firstSentence = text.split(/[.!?]\s/)[0];
  const base = firstSentence.length <= maxLen ? firstSentence : text;

  if (base.length <= maxLen) return base;
  return base.slice(0, maxLen - 3) + '...';
}
