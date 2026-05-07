import type { ClassificationResponse, ClarifyingQuestion } from '../../types.js';

// Soluciones que resuelven claramente al ERP o a la app móvil
const SOLUTION_EXPERTIS = 'Expertis / Movilsat ERP';
const SOLUTION_MOVILSAT = 'Movilsat';

// Mapeo de Solution a label legible (usado en Caso 0 dinámico y Caso 3)
const SOLUTION_LABELS: Record<string, string> = {
  'Expertis / Movilsat ERP':             'Movilsat ERP',
  'Movilsat':                            'Movilsat App Móvil',
  'Sistemas':                            'Sistemas',
  'Portal OT':                           'Portal OT',
  'App Fichajes / Gastos / Vacaciones':  'App de Fichajes / Gastos / Vacaciones',
  'Soluciones IA':                       'Soluciones IA',
  'Planificador Inteligente':            'Planificador Inteligente',
  'Business Intelligence':               'Business Intelligence',
  'Comercial':                           'Comercial',
  'Resto':                               'otras aplicaciones',
};

export function generateClarifyingQuestion(classification: ClassificationResponse): ClarifyingQuestion {
  const solution = classification.solution_associated;

  // Caso 0 — Conflicto de solución (confidence medium/low + LLM declaró alternativas)
  if (classification.confidence !== 'high' && classification.alternative_solutions.length > 0) {
    const allSolutions = [solution, ...classification.alternative_solutions];
    const uniqueSolutions = [...new Set(allSolutions)].slice(0, 3);
    const options = [
      ...uniqueSolutions.map(s => SOLUTION_LABELS[s] ?? s),
      'Otra aplicación o servicio',
    ];
    return {
      question: 'Para identificar mejor tu incidencia, ¿sobre qué solución o aplicación es tu consulta?',
      options,
      reason: 'heuristic_solution_conflict',
    };
  }

  // Caso 1 — ERP Movilsat ERP
  if (solution === SOLUTION_EXPERTIS) {
    return {
      question: 'Para identificar mejor la incidencia, indica el módulo de Movilsat ERP en el que te ocurre.',
      options: ['GMAO', 'Proyectos', 'General', 'Financiero', 'Logística', 'Comercial', 'CRM', 'Fabricación', 'No sé', 'Otro'],
      reason: 'heuristic_expertis_module',
    };
  }

  // Caso 2 — Movilsat (app móvil)
  if (solution === SOLUTION_MOVILSAT) {
    return {
      question: '¿Dónde estás viendo el problema?',
      options: ['En el programa de gestión Movilsat ERP (ordenador de oficina)', 'En la app móvil Movilsat (móvil o tablet de los técnicos)', 'En ambos', 'No sé'],
      reason: 'heuristic_movilsat_device',
    };
  }

  // Caso 3 — Solución concreta identificada
  const label = SOLUTION_LABELS[solution];
  if (label) {
    return {
      question: `¿Tu consulta es sobre ${label}?`,
      options: ['Sí', 'No'],
      reason: 'heuristic_solution_confirm',
    };
  }

  // Caso 4 — Solución ambigua o no identificada
  return {
    question: '¿Dónde estás experimentando este problema?',
    options: ['En el programa de gestión Movilsat ERP', 'En la app móvil Movilsat', 'Otro'],
    reason: 'heuristic_ambiguous',
  };
}
