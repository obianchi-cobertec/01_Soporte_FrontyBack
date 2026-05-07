import { z } from 'zod';
import {
  NATURE_VALUES,
  SOLUTION_VALUES,
  EXPERTIS_MODULE_VALUES,
  CONFIDENCE_VALUES,
  REVIEW_STATUS_VALUES,
  PRIORITY_VALUES,
  type ClassificationResponse,
} from '../../types.js';

const ClassificationSchema = z.object({
  summary: z.string().min(1, 'El resumen no puede estar vacío'),
  classification: z.object({
    nature: z.enum(NATURE_VALUES),
    domain: z.string().min(1),
    object: z.string().min(1),
    action: z.string().min(1),
  }),
  solution_associated: z.enum(SOLUTION_VALUES),
  expertis_module: z.enum(EXPERTIS_MODULE_VALUES).nullable(),
  redmine_mapping: z.object({
    block: z.string().min(1),
    module: z.string().min(1),
    need: z.string().min(1),
  }),
  confidence: z.enum(CONFIDENCE_VALUES),
  review_status: z.enum(REVIEW_STATUS_VALUES),
  suggested_priority: z.enum(PRIORITY_VALUES),
  suggested_assignee: z.string().nullable(),
  reasoning: z.string().min(1),
  alternative_solutions: z.array(z.string()).default([]),
}).passthrough(); // ignora campos extra que el LLM pueda devolver

export function validateClassificationResponse(
  raw: string,
  sessionId: string
):
  | { success: true; data: ClassificationResponse }
  | { success: false; errors: string[]; raw: string } {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      success: false,
      errors: [`JSON inválido: ${(e as Error).message}`],
      raw: cleaned,
    };
  }

  const result = ClassificationSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues.map(
      issue => `${issue.path.join('.')}: ${issue.message}`
    );
    return { success: false, errors, raw: cleaned };
  }

  const data = result.data;

  // Corrección: si solution ≠ Expertis, expertis_module debe ser null
  if (data.solution_associated !== 'Expertis / Movilsat ERP') {
    data.expertis_module = null;
  }

  // Corrección: si solution = Expertis y expertis_module es null → forzar "general"
  if (
    data.solution_associated === 'Expertis / Movilsat ERP' &&
    (data.expertis_module === null || data.expertis_module === undefined)
  ) {
    data.expertis_module = 'general';
  }

  // Corrección: si solution = Comercial → marcar out_of_map
  if (data.solution_associated === 'Comercial') {
    data.review_status = 'out_of_map';
    if (data.confidence === 'high') {
      data.confidence = 'medium';
    }
  }

  // Corrección de coherencia confidence ↔ review_status
  if (data.confidence === 'high' && data.review_status !== 'auto_ok') {
    data.review_status = 'auto_ok';
  }
  if (data.confidence === 'low' && data.review_status === 'auto_ok') {
    data.review_status = 'review_recommended';
  }
  if (data.confidence === 'medium' && data.review_status === 'auto_ok') {
    data.review_status = 'review_recommended';
  }

  return {
    success: true,
    data: { session_id: sessionId, ...data },
  };
}

export function buildFallbackResponse(
  sessionId: string,
  description: string
): ClassificationResponse {
  const truncatedDesc = description.length > 100
    ? description.slice(0, 100) + '...'
    : description;

  return {
    session_id: sessionId,
    summary: `El cliente reporta: ${truncatedDesc}. Clasificación automática no disponible.`,
    classification: {
      nature: 'ambiguo',
      domain: 'dominio_no_claro',
      object: '(no inferido)',
      action: '(no inferido)',
    },
    solution_associated: 'Expertis / Movilsat ERP',
    expertis_module: 'no_claro',
    redmine_mapping: {
      block: 'general',
      module: '*',
      need: 'error',
    },
    confidence: 'low',
    review_status: 'human_required',
    suggested_priority: 'normal',
    suggested_assignee: 'soporte_errores_expertis',
    reasoning: 'Fallback: el motor IA no pudo clasificar este caso. Requiere revisión humana completa.',
    alternative_solutions: [],
  };
}
