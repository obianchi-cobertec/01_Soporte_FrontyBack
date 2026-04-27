/**
 * AuthContext — Estado de autenticación global para la SPA
 *
 * Al montar, intenta refresh silencioso para restaurar sesión.
 * Si el usuario solo tiene 1 empresa, auto-selecciona.
 * Si el usuario es superadmin, salta el selector de empresa.
 * Si must_change_password, intercepta antes de continuar.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

import type {
  AuthState,
  CompanyDTO,
  MeResponse,
} from '../auth-types.js';

import {
  loginApi,
  selectCompanyApi,
  logoutApi,
  refreshToken,
  fetchMe,
  setAccessToken,
  AuthApiError,
  changePasswordApi,
} from '../services/auth-api.js';

// ─── Context shape ──────────────────────────────────────

interface AuthContextValue {
  authState: AuthState;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  selectCompany: (companyId: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────

const INITIAL_STATE: AuthState = {
  status: 'unauthenticated',
  accessToken: null,
  user: null,
  selectedCompany: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Refresh silencioso al montar ───────────────────

  useEffect(() => {
    let cancelled = false;

    async function tryRestore() {
      try {
        const refreshed = await refreshToken();
        setAccessToken(refreshed.access_token);

        const me = await fetchMe();
        if (cancelled) return;

        // Detectar must_change_password desde el token
        const mustChange = parseMustChangeFromToken(refreshed.access_token);

        if (mustChange) {
          setAuthState({
            status: 'must_change_password',
            accessToken: refreshed.access_token,
            user: me,
            selectedCompany: null,
          });
          return;
        }

        setAuthState({
          status: me.company || me.is_superadmin ? 'company_selected' : 'authenticated',
          accessToken: refreshed.access_token,
          user: me,
          selectedCompany: me.company,
        });
      } catch {
        if (!cancelled) {
          setAuthState(INITIAL_STATE);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    tryRestore();
    return () => { cancelled = true; };
  }, []);

  // ─── Login ──────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await loginApi(email, password);

      // Interceptar cambio de contraseña obligatorio
      if (response.must_change_password) {
        const me = await fetchMe();
        setAuthState({
          status: 'must_change_password',
          accessToken: response.access_token,
          user: me,
          selectedCompany: null,
        });
        return;
      }

      const me = await fetchMe();

      // Superadmin: salta el selector de empresa
      if (me.is_superadmin) {
        setAuthState({
          status: 'company_selected',
          accessToken: response.access_token,
          user: me,
          selectedCompany: null,
        });
        return;
      }

      // Una sola empresa: auto-seleccionar
      if (response.companies.length === 1) {
        const selected = await selectCompanyApi({
          company_id: response.companies[0].id,
        });
        const meWithCompany = await fetchMe();
        setAuthState({
          status: 'company_selected',
          accessToken: selected.access_token,
          user: meWithCompany,
          selectedCompany: selected.company,
        });
        return;
      }

      // Varias empresas: mostrar selector
      setAuthState({
        status: 'authenticated',
        accessToken: response.access_token,
        user: me,
        selectedCompany: null,
      });
    } catch (err) {
      const msg =
        err instanceof AuthApiError
          ? err.body.message
          : 'Error de conexión';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── Select Company ─────────────────────────────────

  const selectCompany = useCallback(async (companyId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await selectCompanyApi({ company_id: companyId });
      const me = await fetchMe();

      setAuthState({
        status: 'company_selected',
        accessToken: response.access_token,
        user: me,
        selectedCompany: response.company,
      });
    } catch (err) {
      const msg =
        err instanceof AuthApiError
          ? err.body.message
          : 'Error seleccionando empresa';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── Change Password ─────────────────────────────────

  const changePassword = useCallback(async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      await changePasswordApi({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword });

      // Tras cambiar contraseña: hacer login silencioso con nueva contraseña
      // El token actual sigue válido pero must_change_password = false en DB.
      // Hacemos refresh para obtener token actualizado.
      const refreshed = await refreshToken();
      setAccessToken(refreshed.access_token);
      const me = await fetchMe();

      setAuthState(prev => ({
        ...prev,
        status: me.is_superadmin ? 'company_selected' : (me.companies.length === 1 ? 'authenticated' : 'authenticated'),
        accessToken: refreshed.access_token,
        user: me,
        selectedCompany: null,
      }));

      // Auto-seleccionar empresa si solo hay una
      if (!me.is_superadmin && me.companies.length === 1) {
        const selected = await selectCompanyApi({ company_id: me.companies[0].id });
        const meWithCompany = await fetchMe();
        setAuthState({
          status: 'company_selected',
          accessToken: selected.access_token,
          user: meWithCompany,
          selectedCompany: selected.company,
        });
      } else if (me.is_superadmin) {
        setAuthState(prev => ({ ...prev, status: 'company_selected' }));
      }

    } catch (err) {
      const msg =
        err instanceof AuthApiError
          ? err.body.message
          : 'Error al cambiar la contraseña';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── Logout ─────────────────────────────────────────

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      setAuthState(INITIAL_STATE);
      setError(null);
    }
  }, []);

  // ─── Render ─────────────────────────────────────────

  return (
    <AuthContext.Provider
      value={{ authState, isLoading, error, login, selectCompany, logout, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}

// ─── Helpers ────────────────────────────────────────────

function parseMustChangeFromToken(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.must_change_password === true;
  } catch {
    return false;
  }
}
