import { z } from 'zod';
import {
  NATURE_VALUES,
  DOMAIN_VALUES,
  CONFIDENCE_VALUES,
  REVIEW_STATUS_VALUES,
  PRIORITY_VALUES,
  type ClassificationResponse,
} from '../../types.js';

// =============================================================================
// Response Validator — Motor IA v1
//
// Valida que la respuesta del LLM cumpla el contrato de datos.
// Si el LLM devuelve JSON malformado o campos inválidos, se detecta aquí.
// =============================================================================

const ClassificationSchema = z.object({
  summary: z.string().min(1, 'El resumen no puede estar vacío'),
  classification: z.object({
    nature: z.enum(NATURE_VALUES),
    domain: z.enum(DOMAIN_VALUES),
    object: z.string().min(1),
    action: z.string().min(1),
  }),
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
});

export type ValidationResult =
  | { success: true; data: Omit<ClassificationResponse, 'session_id'> }
  | { success: false; errors: string[]; raw: string };

/**
 * Parsea y valida la respuesta raw del LLM.
 * Intenta extraer JSON incluso si viene envuelto en markdown fences.
 */
export function validateClassificationResponse(
  raw: string,
  sessionId: string
): { success: true; data: ClassificationResponse } | { success: false; errors: string[]; raw: string } {
  // Limpiar posibles markdown fences
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Intentar parsear JSON
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

  // Validar contra schema
  const result = ClassificationSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.issues.map(
      issue => `${issue.path.join('.')}: ${issue.message}`
    );
    return { success: false, errors, raw: cleaned };
  }

  // Validar coherencia confidence ↔ review_status
  const data = result.data;
  const coherenceErrors = validateCoherence(data);

  if (coherenceErrors.length > 0) {
    // No rechazamos, pero corregimos
    applyCoherenceFixes(data);
  }

  return {
    success: true,
    data: {
      session_id: sessionId,
      ...data,
    },
  };
}

/**
 * Verifica coherencia entre confidence y review_status.
 */
function validateCoherence(data: z.infer<typeof ClassificationSchema>): string[] {
  const errors: string[] = [];

  if (data.confidence === 'high' && data.review_status !== 'auto_ok') {
    errors.push(`Incoherencia: confidence=high pero review_status=${data.review_status}. Se corregirá a auto_ok.`);
  }

  if (data.confidence === 'low' && data.review_status === 'auto_ok') {
    errors.push(`Incoherencia: confidence=low pero review_status=auto_ok. Se corregirá a review_recommended.`);
  }

  return errors;
}

/**
 * Aplica correcciones automáticas de coherencia.
 * Muta el objeto directamente (ya validado por Zod).
 */
function applyCoherenceFixes(data: z.infer<typeof ClassificationSchema>): void {
  // Si confidence es high, review_status debe ser auto_ok
  if (data.confidence === 'high' && data.review_status !== 'auto_ok') {
    data.review_status = 'auto_ok';
  }

  // Si confidence es low, review_status no puede ser auto_ok
  if (data.confidence === 'low' && data.review_status === 'auto_ok') {
    data.review_status = 'review_recommended';
  }

  // Si confidence es medium y review_status es auto_ok, subir a review_recommended
  if (data.confidence === 'medium' && data.review_status === 'auto_ok') {
    data.review_status = 'review_recommended';
  }
}

/**
 * Genera una respuesta fallback cuando el LLM falla completamente.
 * El ticket se crea con clasificación mínima y se marca para revisión humana.
 */
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
    redmine_mapping: {
      block: 'general',
      module: '*',
      need: 'error',
    },
    confidence: 'low',
    review_status: 'human_required',
    suggested_priority: 'normal',
    suggested_assignee: 'Soporte',
    reasoning: 'Fallback: el motor IA no pudo clasificar este caso. Requiere revisión humana completa.',
  };
}
