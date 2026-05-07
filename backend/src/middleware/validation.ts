import { z } from 'zod';

// =============================================================================
// Validación de payloads de entrada — Middleware
// =============================================================================

export const IntakePayloadSchema = z.object({
  session_id: z.string().uuid(),
  user_id: z.string().min(1),
  company_id: z.string().min(1),
  company_name: z.string().min(1),
  description: z.string().min(10, 'La descripción debe tener al menos 10 caracteres'),
  attachments: z.array(z.object({
    filename: z.string().min(1),
    content_type: z.string().min(1),
    data: z.string().min(1), // base64
  })).default([]),
  timestamp: z.string().datetime(),
});

export const ConfirmationPayloadSchema = z.object({
  session_id: z.string().uuid(),
  action: z.enum(['confirm', 'edit', 'clarify']),
  edited_description: z.string().nullable().default(null),
  additional_attachments: z.array(z.object({
    filename: z.string().min(1),
    content_type: z.string().min(1),
    data: z.string().min(1),
  })).default([]),
  timestamp: z.string().datetime(),
  clarification_answer: z.string().optional(),
  clarification_question: z.string().optional(),
  billing_acceptance: z.object({
    accepted: z.boolean(),
    accepted_at: z.string().datetime(),
  }).nullable().optional(),
}).superRefine((val, ctx) => {
  if (val.action === 'clarify') {
    if (!val.clarification_answer || val.clarification_answer.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La respuesta a la pregunta aclaratoria es obligatoria',
        path: ['clarification_answer'],
      });
    }
    if (!val.clarification_question || val.clarification_question.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La pregunta aclaratoria original es obligatoria',
        path: ['clarification_question'],
      });
    }
  }
});

export type ValidatedIntakePayload = z.infer<typeof IntakePayloadSchema>;
export type ValidatedConfirmationPayload = z.infer<typeof ConfirmationPayloadSchema>;
