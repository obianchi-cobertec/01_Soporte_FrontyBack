// =============================================================================
// Contratos de datos — Tipos centrales del MVP
// Fuente: Especificación técnica del MVP Fase 1
// =============================================================================

// --- Valores de taxonomía ---

export const NATURE_VALUES = [
  'incidencia_error', 'consulta_funcional', 'formacion_duda_uso', 'configuracion',
  'peticion_cambio_mejora', 'usuario_acceso', 'instalacion_entorno',
  'importacion_exportacion', 'rendimiento_bloqueo', 'ambiguo'
] as const;
export type Nature = typeof NATURE_VALUES[number];

export const DOMAIN_VALUES = [
  'funcionamiento_general', 'compras', 'ventas_facturacion', 'almacen_stocks',
  'gmao', 'movilsat', 'portal_ot', 'presupuestos_proyectos', 'financiero',
  'crm', 'ofertas_comerciales', 'planificador_inteligente', 'app_fichajes',
  'servidor_sistemas', 'tarifas_catalogos', 'dominio_no_claro'
] as const;
export type Domain = typeof DOMAIN_VALUES[number];

export const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
export type Confidence = typeof CONFIDENCE_VALUES[number];

export const REVIEW_STATUS_VALUES = [
  'auto_ok', 'review_recommended', 'ambiguous', 'out_of_map', 'human_required'
] as const;
export type ReviewStatus = typeof REVIEW_STATUS_VALUES[number];

export const PRIORITY_VALUES = ['normal', 'high', 'urgent'] as const;
export type Priority = typeof PRIORITY_VALUES[number];

// --- Payload de intake (Frontend → Backend) ---

export interface Attachment {
  filename: string;
  content_type: string;
  data: string; // base64
}

export interface IntakePayload {
  session_id: string;
  user_id: string;
  company_id: string;
  company_name: string;
  description: string;
  attachments: Attachment[];
  timestamp: string; // ISO 8601
}

// --- Payload de clasificación (Backend → Motor IA) ---

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
}

// --- Respuesta de clasificación (Motor IA → Backend) ---

export interface Classification {
  nature: Nature;
  domain: Domain;
  object: string;
  action: string;
}

export interface RedmineMapping {
  block: string;
  module: string;
  need: string;
}

export interface ClassificationResponse {
  session_id: string;
  summary: string;
  classification: Classification;
  redmine_mapping: RedmineMapping;
  confidence: Confidence;
  review_status: ReviewStatus;
  suggested_priority: Priority;
  suggested_assignee: string | null;
  reasoning: string;
}

// --- Payload de confirmación (Frontend → Backend) ---

export interface ConfirmationPayload {
  session_id: string;
  action: 'confirm' | 'edit';
  edited_description: string | null;
  additional_attachments: Attachment[];
  timestamp: string;
}

// --- Respuestas al frontend ---

export interface ClassifiedResponse {
  session_id: string;
  status: 'classified';
  display: {
    summary: string;
    estimated_area: string;
    impact: string | null;
    attachments_received: string[];
  };
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
  error_code: 'classification_failed' | 'redmine_failed' | 'validation_failed';
  error_message: string;
}

export type IntakeResponse = ClassifiedResponse | CreatedResponse | ErrorResponse;

// --- Eventos (métricas) ---

export const EVENT_TYPES = [
  'flow_started', 'description_submitted', 'classification_requested',
  'classification_completed', 'confirmation_shown', 'confirmation_accepted',
  'confirmation_edited', 'ticket_created', 'flow_error', 'flow_abandoned'
] as const;
export type EventType = typeof EVENT_TYPES[number];

export interface IntakeEvent {
  event_id: string;
  event_type: EventType;
  session_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}
