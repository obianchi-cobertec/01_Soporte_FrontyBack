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
  status: 'unauthenticated' | 'authenticated' | 'company_selected';
  accessToken: string | null;
  user: MeResponse | null;
  selectedCompany: CompanyDTO | null;
}
