/**
 * Auth & Identity types — Frontend
 * Subconjunto de backend/src/identity-types.ts
 * OAuth 2.0 compatible
 */

export interface CompanyDTO {
  id: string;
  name: string;
}

export interface LoginRequest {
  grant_type: 'password';
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  companies: CompanyDTO[];
  must_change_password: boolean;
}

export interface SelectCompanyRequest {
  company_id: string;
}

export interface SelectCompanyResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  company: CompanyDTO;
}

export interface RefreshResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
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

export interface AuthError {
  error: string;
  message: string;
}

export interface AuthState {
  status: 'unauthenticated' | 'authenticated' | 'company_selected' | 'must_change_password';
  accessToken: string | null;
  user: MeResponse | null;
  selectedCompany: CompanyDTO | null;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface ChangePasswordResponse {
  ok: true;
}

// ─── Recuperación de contraseña ──────────────────────────

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  ok: true;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
  confirm_password: string;
}

export interface ResetPasswordResponse {
  ok: true;
}

// ─── Solicitudes de alta ─────────────────────────────────

export type UserRequestStatus = 'pending' | 'approved' | 'rejected';

export interface UserRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_id: string | null;
  company_name_requested: string;
  phone: string;
  status: UserRequestStatus;
  rejection_reason: string | null;
  redmine_user_id: number | null;
  created_at: string;
  updated_at: string;
}
