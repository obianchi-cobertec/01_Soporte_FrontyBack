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
  action: z.enum(['confirm', 'edit']),
  edited_description: z.string().nullable().default(null),
  additional_attachments: z.array(z.object({
    filename: z.string().min(1),
    content_type: z.string().min(1),
    data: z.string().min(1),
  })).default([]),
  timestamp: z.string().datetime(),
});

export type ValidatedIntakePayload = z.infer<typeof IntakePayloadSchema>;
export type ValidatedConfirmationPayload = z.infer<typeof ConfirmationPayloadSchema>;
