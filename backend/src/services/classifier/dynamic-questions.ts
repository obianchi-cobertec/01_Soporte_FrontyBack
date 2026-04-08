import type { ClassificationResponse } from '../../types.js';

// =============================================================================
// Dynamic Questions v2 — Preguntas de contexto operativo
//
// PRINCIPIO FUNDAMENTAL:
//   La IA clasifica. El usuario NUNCA clasifica.
//   Las preguntas no piden naturaleza, dominio, bloque, módulo ni necesidad.
//   Las preguntas solo piden contexto operativo que ayude al técnico a resolver.
//
// Cuándo preguntar:
//   - confidence = high → 0 preguntas (la IA ya sabe lo que necesita)
//   - confidence = medium → 0-1 preguntas (solo si el contexto es realmente pobre)
//   - confidence = low → 1-2 preguntas (la descripción es demasiado corta o vaga)
//
// Qué preguntar:
//   - ¿Te aparece algún mensaje de error? (si es incidencia pero no hay mensaje)
//   - ¿Desde cuándo te pasa? (si no menciona temporalidad)
//   - ¿Afecta solo a ti o a más personas? (si parece un bloqueo pero no dice alcance)
//   - ¿Puedes describir un poco más qué estabas intentando hacer? (si es muy vago)
//
// Qué NO preguntar nunca:
//   - ¿En qué módulo estás? ¿Qué tipo de problema es? ¿Es error o consulta?
//   - Nada que sea trabajo del clasificador.
// =============================================================================

export interface QuestionOption {
  value: string;
  label: string;
}

export interface DynamicQuestion {
  id: string;
  text: string;
  type: 'options' | 'freetext';
  options?: QuestionOption[];
  placeholder?: string;
}

// --- Banco de preguntas de contexto operativo ---

const Q_ERROR_MESSAGE: DynamicQuestion = {
  id: 'error_message',
  text: '¿Te aparece algún mensaje de error? Si es así, ¿qué dice?',
  type: 'freetext',
  placeholder: 'Ej: "Error de base de datos", "Acceso denegado", o "no aparece ningún mensaje"',
};

const Q_SINCE_WHEN: DynamicQuestion = {
  id: 'since_when',
  text: '¿Desde cuándo te ocurre?',
  type: 'options',
  options: [
    { value: 'today', label: 'Desde hoy' },
    { value: 'few_days', label: 'Hace unos días' },
    { value: 'always', label: 'Siempre ha pasado' },
    { value: 'after_change', label: 'Después de un cambio o actualización' },
  ],
};

const Q_SCOPE: DynamicQuestion = {
  id: 'scope',
  text: '¿Afecta solo a ti o a más personas?',
  type: 'options',
  options: [
    { value: 'only_me', label: 'Solo a mí' },
    { value: 'several', label: 'A varias personas' },
    { value: 'everyone', label: 'A todo el equipo / departamento' },
    { value: 'unknown', label: 'No estoy seguro' },
  ],
};

const Q_MORE_DETAIL: DynamicQuestion = {
  id: 'more_detail',
  text: '¿Puedes describir un poco más qué estabas intentando hacer?',
  type: 'freetext',
  placeholder: 'Cuéntanos el paso a paso de lo que hacías cuando ocurrió el problema',
};

/**
 * Genera preguntas de contexto operativo basadas en la clasificación.
 * 
 * - confidence=high → nunca pregunta
 * - confidence=medium → pregunta solo si falta contexto crítico
 * - confidence=low → pregunta para obtener mínimo contexto operativo
 */
export function generateQuestions(classification: ClassificationResponse): DynamicQuestion[] {
  // Si la confianza es alta, el clasificador tiene lo que necesita
  if (classification.confidence === 'high') {
    return [];
  }

  const questions: DynamicQuestion[] = [];
  const nature = classification.classification.nature;
  const desc = classification.reasoning?.toLowerCase() ?? '';

  if (classification.confidence === 'low') {
    // Descripción muy vaga — pedir más detalle
    questions.push(Q_MORE_DETAIL);

    // Si parece error pero no hay mensaje
    if (nature === 'incidencia_error' || nature === 'rendimiento_bloqueo') {
      questions.push(Q_SINCE_WHEN);
    }
  }

  if (classification.confidence === 'medium') {
    // Solo preguntar si realmente falta algo útil para el técnico
    if (nature === 'incidencia_error' && !desc.includes('mensaje')) {
      questions.push(Q_ERROR_MESSAGE);
    } else if (nature === 'rendimiento_bloqueo') {
      questions.push(Q_SCOPE);
    }
    // Si no hay pregunta relevante, no forzar ninguna
  }

  // Máximo 2 preguntas
  return questions.slice(0, 2);
}
