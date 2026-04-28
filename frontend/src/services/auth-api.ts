/**
 * Auth API client — OAuth 2.0 compatible
 *
 * - access_token en memoria (no localStorage)
 * - refresh_token como cookie httpOnly (lo gestiona el browser)
 * - Auto-refresh si un request falla con 401
 * - Token endpoint unificado: POST /auth/token
 */

import type {
  LoginRequest,
  LoginResponse,
  SelectCompanyRequest,
  SelectCompanyResponse,
  RefreshResponse,
  MeResponse,
  AuthError,
  ChangePasswordRequest,
  ChangePasswordResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from '../auth-types.js';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

// ─── Token en memoria ───────────────────────────────────

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

// ─── Fetch wrapper ──────────────────────────────────────

class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: AuthError,
  ) {
    super(body.message);
    this.name = 'AuthApiError';
  }
}

async function authFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'UNKNOWN', message: 'Error desconocido' }));
    throw new AuthApiError(res.status, body as AuthError);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Auto-refresh wrapper ───────────────────────────────

export async function authenticatedFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  try {
    return await authFetch<T>(path, options);
  } catch (err) {
    if (err instanceof AuthApiError && err.status === 401 && accessToken) {
      try {
        const refreshed = await refreshToken();
        setAccessToken(refreshed.access_token);
        return await authFetch<T>(path, options);
      } catch {
        setAccessToken(null);
        throw err;
      }
    }
    throw err;
  }
}

// ─── Auth API calls ─────────────────────────────────────

export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const body: LoginRequest = { grant_type: 'password', email, password };
  const response = await authFetch<LoginResponse>('/auth/token', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  setAccessToken(response.access_token);
  return response;
}

export async function selectCompanyApi(data: SelectCompanyRequest): Promise<SelectCompanyResponse> {
  const response = await authFetch<SelectCompanyResponse>('/auth/select', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  setAccessToken(response.access_token);
  return response;
}

export async function refreshToken(): Promise<RefreshResponse> {
  return authFetch<RefreshResponse>('/auth/token', {
    method: 'POST',
    body: JSON.stringify({ grant_type: 'refresh_token' }),
  });
}

export async function logoutApi(): Promise<void> {
  try {
    await authFetch<void>('/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
}

export async function fetchMe(): Promise<MeResponse> {
  return authenticatedFetch<MeResponse>('/identity/me');
}

export async function changePasswordApi(data: ChangePasswordRequest): Promise<ChangePasswordResponse> {
  return authFetch<ChangePasswordResponse>('/auth/password', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function forgotPasswordApi(data: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  return authFetch<ForgotPasswordResponse>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function resetPasswordApi(data: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  return authFetch<ResetPasswordResponse>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export { AuthApiError };
