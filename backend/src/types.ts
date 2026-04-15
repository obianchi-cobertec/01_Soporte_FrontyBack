export interface Attachment {
  filename: string;
  content_type: string;
  data: string;
}

export interface IntakePayload {
  session_id: string;
  user_id: string;
  company_id: string;
  company_name: string;
  description: string;
  attachments: Attachment[];
  timestamp: string;
}

export interface ConfirmationPayload {
  session_id: string;
  action: 'confirm' | 'edit';
  edited_description: string | null;
  additional_attachments: Attachment[];
  timestamp: string;
}

// Dynamic questions
export interface DynamicQuestionOption {
  value: string;
  label: string;
}

export interface DynamicQuestion {
  id: string;
  text: string;
  type: 'options' | 'freetext';
  options?: DynamicQuestionOption[];
  placeholder?: string;
}

// Responses
export interface ClassifiedResponse {
  session_id: string;
  status: 'classified';
  display: {
    summary: string;
    estimated_area: string;
    impact: string | null;
    attachments_received: string[];
    need: string | null;
  };
  questions?: DynamicQuestion[];
}

export interface CreatedResponse {
  session_id: string;
  status: 'created';
  ticket_id: string;
  ticket_url: string | null;
}

export interface ErrorResponse {
  session_id: string;
  status: 'error';
  error_code: string;
  error_message: string;
}

export type IntakeResponse = ClassifiedResponse | CreatedResponse | ErrorResponse;

export type FlowStep = 'form' | 'loading' | 'questions' | 'confirmation' | 'creating' | 'done' | 'error';

// ─── Constantes para Zod enums (usadas en response-validator) ────────────────

export const NATURE_VALUES = [
  'incidencia_error',
  'consulta_funcional',
  'formacion_duda_uso',
  'configuracion',
  'peticion_cambio_mejora',
  'usuario_acceso',
  'instalacion_entorno',
  'importacion_exportacion',
  'rendimiento_bloqueo',
  'ambiguo',
] as const;

export const SOLUTION_VALUES = [
  'Expertis / Movilsat ERP',
  'Movilsat',
  'Sistemas',
  'Portal OT',
  'App Fichajes / Gastos / Vacaciones',
  'Soluciones IA',
  'Planificador Inteligente',
  'Business Intelligence',
  'Comercial',
  'Resto',
] as const;

export const EXPERTIS_MODULE_VALUES = [
  'general',
  'financiero',
  'logistica',
  'comercial',
  'proyectos',
  'gmao',
  'crm',
  'calidad',
  'rrhh',
  'fabricacion',
  'no_aplica',
  'no_claro',
] as const;

export const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;

export const REVIEW_STATUS_VALUES = [
  'auto_ok',
  'review_recommended',
  'ambiguous',
  'out_of_map',
  'human_required',
] as const;

export const PRIORITY_VALUES = ['normal', 'high', 'urgent'] as const;

// ─── Tipos derivados de las constantes ───────────────────────────────────────

export type Nature = (typeof NATURE_VALUES)[number];
export type Solution = (typeof SOLUTION_VALUES)[number];
export type ExpertisModule = (typeof EXPERTIS_MODULE_VALUES)[number];
export type Confidence = (typeof CONFIDENCE_VALUES)[number];
export type ReviewStatus = (typeof REVIEW_STATUS_VALUES)[number];
export type Priority = (typeof PRIORITY_VALUES)[number];

// ─── ClassificationResponse (usada en response-validator y classifier) ───────

export interface ClassificationResponse {
  session_id: string;
  summary: string;
  classification: {
    nature: Nature;
    domain: string;
    object: string;
    action: string;
  };
  solution_associated: Solution;
  expertis_module: ExpertisModule | null;
  redmine_mapping: {
    block: string;
    module: string;
    need: string;
  };
  confidence: Confidence;
  review_status: ReviewStatus;
  suggested_priority: Priority;
  suggested_assignee: string | null;
  reasoning: string;
}
