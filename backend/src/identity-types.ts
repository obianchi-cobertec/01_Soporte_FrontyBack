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

// ─── DTOs de salida ─────────────────────────────────────────

export interface CompanyDTO {
  id: string;
  name: string;
}

export interface MeResponse {
  user_id: string;
  is_superadmin: boolean;
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
    email: z.string().email('Email no válido'),
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
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
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
  | 'UNSUPPORTED_GRANT_TYPE';

export interface AuthError {
  error: AuthErrorCode;
  message: string;
}
