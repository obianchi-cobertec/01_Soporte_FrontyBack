/**
 * Identity & Auth types — Cobertec Intake
 *
 * Modelo: Contact → User → Company (canal agnóstico)
 * Auth: OAuth 2.0 compatible (grant_type: password | refresh_token)
 * Cobertec gestiona cuentas (no hay registro libre)
 */

import { z } from 'zod';

// ─── Entidades ──────────────────────────────────────────────

export interface Contact {
  id: string;           // UUID
  name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  created_at: string;   // ISO 8601
  updated_at: string;
}

export interface User {
  id: string;           // UUID
  contact_id: string;
  password_hash: string;
  active: boolean;
  is_superadmin: boolean;
  is_support_lead: boolean;
  must_change_password: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;           // UUID
  name: string;
  redmine_project_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCompany {
  user_id: string;
  company_id: string;
  role: 'user' | 'admin';
  created_at: string;
}

// ─── Solicitudes de alta ────────────────────────────────────

export type UserRequestStatus = 'pending' | 'approved' | 'rejected';

export interface UserRequest {
  id: string;           // UUID
  first_name: string;
  last_name: string;
  email: string;
  company_id: string | null;           // nullable — asignado por el admin antes de aprobar
  company_name_requested: string;      // nombre de empresa escrito por el usuario
  phone: string;                       // requerido
  status: UserRequestStatus;
  rejection_reason: string | null;
  redmine_user_id: number | null;  // poblado al aprobar
  created_at: string;
  updated_at: string;
}

export const UserRequestFormSchema = z.object({
  first_name: z.string().min(1, 'Nombre requerido'),
  last_name: z.string().min(1, 'Apellido requerido'),
  email: z.string().email('Email no válido'),
  company_name: z.string().min(1, 'Nombre de empresa requerido'),
  phone: z.string().min(1, 'Teléfono requerido'),
  // company_id: solo en edición admin (opcional); puede ser UUID o ID numérico string (empresas importadas de Redmine)
  company_id: z.string().min(1).optional().nullable(),
});
export type UserRequestForm = z.infer<typeof UserRequestFormSchema>;

export const ApproveRequestSchema = z.object({});
export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;

export const RejectRequestSchema = z.object({
  reason: z.string().min(1, 'El motivo del rechazo es obligatorio'),
});
export type RejectRequest = z.infer<typeof RejectRequestSchema>;

// ─── DTOs de salida ─────────────────────────────────────────

export interface CompanyDTO {
  id: string;
  name: string;
}

export interface MeResponse {
  user_id: string;
  is_superadmin: boolean;
  is_support_lead: boolean;
  contact: {
    name: string;
    email: string;
    phone: string | null;
  };
  company: CompanyDTO | null;
  companies: CompanyDTO[];
}

// ─── Auth payloads ──────────────────────────────────────────

export const TokenRequestSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('password'),
    email: z.string().min(1, 'Email o usuario requerido'),
    password: z.string().min(1, 'Contraseña requerida'),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
  }),
]);
export type TokenRequest = z.infer<typeof TokenRequestSchema>;

/** @deprecated Use TokenRequestSchema with grant_type: 'password' */
export const LoginRequestSchema = z.object({
  email: z.string().email('Email no válido'),
  password: z.string().min(1, 'Contraseña requerida'),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  companies: CompanyDTO[];
  must_change_password: boolean;
}

export interface LoginResponse extends TokenResponse {}

export const SelectCompanyRequestSchema = z.object({
  company_id: z.string().min(1, 'company_id requerido'),
});
export type SelectCompanyRequest = z.infer<typeof SelectCompanyRequestSchema>;

export interface SelectCompanyResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  company: CompanyDTO;
}

export const RefreshRequestSchema = z.object({}).strict();

export interface RefreshResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

// ─── JWT payloads ───────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;
  contact_id: string;
  company_id: string | null;
  company_name: string | null;
  must_change_password: boolean;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

// ─── Cambio de contraseña ────────────────────────────────────

export const ChangePasswordRequestSchema = z.object({
  current_password: z.string(),
  new_password: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
  confirm_password: z.string().min(1, 'Confirmación requerida'),
}).refine(data => data.new_password === data.confirm_password, {
  message: 'Las contraseñas no coinciden',
  path: ['confirm_password'],
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export interface ChangePasswordResponse {
  ok: true;
}

// ─── Recuperación de contraseña ──────────────────────────

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email('Email no válido'),
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export interface ForgotPasswordResponse {
  ok: true;
}

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1, 'Token requerido'),
  new_password: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
  confirm_password: z.string().min(1, 'Confirmación requerida'),
}).refine(data => data.new_password === data.confirm_password, {
  message: 'Las contraseñas no coinciden',
  path: ['confirm_password'],
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export interface ResetPasswordResponse {
  ok: true;
}

// ─── Errores tipados ────────────────────────────────────────

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_INACTIVE'
  | 'COMPANY_NOT_FOUND'
  | 'COMPANY_NOT_AUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'NO_REFRESH_TOKEN'
  | 'COMPANY_NOT_SELECTED'
  | 'UNSUPPORTED_GRANT_TYPE'
  | 'WRONG_CURRENT_PASSWORD'
  | 'RESET_TOKEN_INVALID'
  | 'RESET_TOKEN_EXPIRED';

export interface AuthError {
  error: AuthErrorCode;
  message: string;
}
