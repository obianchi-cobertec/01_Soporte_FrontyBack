export interface Attachment {
  filename: string;
  content_type: string;
  data: string;
}

/** Tipo local del formulario (no viaja al backend). */
export interface AttachmentItem {
  id: string;               // UUID local para key React y borrado
  filename: string;
  mime_type: string;
  data_base64: string;
  size_bytes: number;       // tamaño real del archivo (no del base64)
  preview_url: string | null; // objectURL para imágenes, null para no-imagen
  source: 'file' | 'paste';
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
  is_billing_disambiguation?: boolean;
}

// ─── Facturación ─────────────────────────────────────────────────────────────

export interface BillableInfo {
  is_billable: boolean;
  requires_disambiguation: boolean;
  min_cost_eur: number;
  notice_text: string;
  matched_rule_nature?: string;
}

export interface BillingAcceptance {
  accepted: boolean;
  accepted_at: string; // ISO timestamp
}

// Responses
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

// Nota: clarifying_question_skipped eliminado — la pregunta ya no es saltable

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
