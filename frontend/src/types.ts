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
