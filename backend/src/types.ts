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
  action: 'confirm' | 'edit' | 'clarify';
  edited_description: string | null;
  additional_attachments: Attachment[];
  timestamp: string;
  // Solo presentes cuando action === 'clarify'
  clarification_answer?: string;
  clarification_question?: string;
  // Solo presente cuando action === 'confirm' e is_billable === true
  billing_acceptance?: BillingAcceptance | null;
}

// ─── Pregunta aclaratoria única ───────────────────────────────────────────────

export interface ClarifyingQuestion {
  question: string;
  options: string[] | null; // null = pregunta abierta; si tiene array, máx 4 opciones
  reason: string;           // por qué el LLM cree que necesita aclarar (logging/debug)
  is_billing_disambiguation?: boolean; // true → pregunta de desambiguación de facturación
}

// ─── Facturación ─────────────────────────────────────────────────────────────

export interface BillableInfo {
  is_billable: boolean;              // true → mostrar aviso + checkbox; false → flujo normal
  requires_disambiguation: boolean;  // true → aún no se sabe, esperar respuesta
  min_cost_eur: number;
  notice_text: string;               // texto del aviso con placeholder sustituido
  matched_rule_nature?: string;      // para auditoría
}

export interface BillingAcceptance {
  accepted: boolean;
  accepted_at: string; // ISO timestamp
}

// ─── Responses ────────────────────────────────────────────────────────────────

export interface ClassifiedResponse {
  session_id: string;
  status: 'classified';
  display: {
    summary: string;
    nature?: string;
    estimated_area: string;
    impact: string | null;
    attachments_received: string[];
    need: string | null;
  };
  clarifying_question: ClarifyingQuestion | null;
  billable: BillableInfo | null;
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

export type FlowStep = 'form' | 'loading' | 'clarifying' | 'confirmation' | 'creating' | 'done' | 'error';

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
  'Academia Cobertec',
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

// ─── ClassificationRequest (request al LLM) ──────────────────────────────────

export interface ClassificationRequest {
  session_id: string;
  description: string;
  user_context: {
    user_id: string;
    company_id: string;
    company_name: string;
  };
  attachment_names: string[];
  attempt: number;
  clarification?: {
    question: string;
    answer: string;
  };
}

// ─── ClassificationResponse (salida del LLM — usada en response-validator y classifier) ───────

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
  alternative_solutions: string[]; // soluciones alternativas que el LLM consideró antes de elegir; array vacío si no hay
}

// ─── Event Store ──────────────────────────────────────────────────────────────

export type EventType =
  | 'flow_started'
  | 'description_submitted'
  | 'classification_requested'
  | 'classification_completed'
  | 'confirmation_shown'
  | 'confirmation_accepted'
  | 'confirmation_edited'
  | 'ticket_created'
  | 'flow_error'
  | 'flow_abandoned'
  | 'clarifying_question_generated'
  | 'clarifying_question_answered'
  | 'unassignable_fallback_applied'
  | 'intake_cancelled';

export interface IntakeEvent {
  event_id: string;
  event_type: EventType;
  session_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}
