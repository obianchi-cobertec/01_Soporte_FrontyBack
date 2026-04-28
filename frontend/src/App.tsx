import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { CompanySelector } from './components/CompanySelector';
import { AdminPanel } from './components/AdminPanel';
import { RequestsPanel } from './pages/RequestsPanel';
import { RequestAccessPage } from './pages/RequestAccessPage';
import ConfigPanel from './pages/ConfigPanel';
import { IntakeForm } from './components/IntakeForm';
import { ConfirmationView } from './components/ConfirmationView';
import { DynamicQuestions } from './components/DynamicQuestions';
import { TicketResult } from './components/TicketResult';
import { ErrorDisplay } from './components/ErrorDisplay';
import { Loading } from './components/Loading';
import { StepIndicator } from './components/StepIndicator';
import { Dashboard } from './components/Dashboard';
import { ChangePasswordPage } from './components/ChangePasswordPage';
import { submitIntake, confirmIntake } from './services/api';
import { generateSessionId } from './utils/session';
import { authenticatedFetch } from './services/auth-api';
import type {
  FlowStep,
  Attachment,
  ClassifiedResponse,
  CreatedResponse,
  DynamicQuestion,
} from './types';
import type { CompanyDTO } from './auth-types';

type Page = 'intake' | 'dashboard' | 'admin' | 'config' | 'requests';
type PublicView = 'forgot-password' | 'reset-password' | 'request-access' | null;

export default function App() {
  const { authState, isLoading: authLoading, logout, selectCompany } = useAuth();

  // Vista pública: se inicializa desde la URL (para reset-password con ?token=)
  const [publicView, setPublicView] = useState<PublicView>(() => {
    if (window.location.pathname === '/solicitar-acceso') return 'request-access';
    if (new URLSearchParams(window.location.search).has('token')) return 'reset-password';
    return null;
  });
  const [resetToken] = useState<string>(() =>
    new URLSearchParams(window.location.search).get('token') ?? '',
  );

  const handleResetDone = useCallback(() => {
    window.history.replaceState({}, '', window.location.pathname);
    setPublicView(null);
  }, []);

  const [page, setPage] = useState<Page>('intake');
  const [step, setStep] = useState<FlowStep>('form');
  const [error, setError] = useState<string | null>(null);
  const [classifiedData, setClassifiedData] = useState<ClassifiedResponse | null>(null);
  const [createdData, setCreatedData] = useState<CreatedResponse | null>(null);
  const [questions, setQuestions] = useState<DynamicQuestion[]>([]);
  const [lastDescription, setLastDescription] = useState('');
  const [lastAttachments, setLastAttachments] = useState<Attachment[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [superadminCompany, setSuperadminCompany] = useState<CompanyDTO | null>(null);

  const sessionIdRef = useRef(generateSessionId());
  const isSuperAdmin = authState.user?.is_superadmin ?? false;

  // Superadmin entra directo a Configuración IA
  useEffect(() => {
    if (isSuperAdmin && authState.status === 'company_selected') {
      setPage('config');
    }
  }, [isSuperAdmin, authState.status]);

  // Check admin status
  useEffect(() => {
    if (!authState.user) {
      setIsAdmin(false);
      return;
    }
    authenticatedFetch<{ users: unknown[] }>('/admin/users')
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, [authState.user]);

  const resetFlow = useCallback(() => {
    sessionIdRef.current = generateSessionId();
    setStep('form');
    setError(null);
    setClassifiedData(null);
    setCreatedData(null);
    setQuestions([]);
    setLastDescription('');
    setLastAttachments([]);
    setSuperadminCompany(null);
    setPage('intake');
  }, []);

  const handleSuperadminCompanySelect = useCallback(async (company: CompanyDTO) => {
    await selectCompany(company.id);
    setSuperadminCompany(company);
  }, [selectCompany]);

  const handleSubmit = useCallback(async (description: string, attachments: Attachment[]) => {
    const company = isSuperAdmin ? superadminCompany : authState.selectedCompany;
    if (!authState.user || !company) return;

    setLastDescription(description);
    setLastAttachments(attachments);
    setStep('loading');
    setError(null);

    try {
      const response = await submitIntake({
        session_id: sessionIdRef.current,
        user_id: authState.user.user_id,
        company_id: company.id,
        company_name: company.name,
        description,
        attachments,
        timestamp: new Date().toISOString(),
      });

      if (response.status === 'classified') {
        setClassifiedData(response);
        if (response.questions && response.questions.length > 0) {
          setQuestions(response.questions);
          setStep('questions');
        } else {
          setStep('confirmation');
        }
      } else if (response.status === 'error') {
        setError(response.error_message);
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión con el servidor');
      setStep('error');
    }
  }, [authState, isSuperAdmin, superadminCompany]);

  const handleQuestionsSubmit = useCallback((_answers: Record<string, string>) => {
    setStep('confirmation');
  }, []);

  const handleQuestionsSkip = useCallback(() => {
    setStep('confirmation');
  }, []);

  const handleConfirm = useCallback(async () => {
    setStep('creating');
    setError(null);

    try {
      const response = await confirmIntake({
        session_id: sessionIdRef.current,
        action: 'confirm',
        edited_description: null,
        additional_attachments: [],
        timestamp: new Date().toISOString(),
      });

      if (response.status === 'created') {
        setCreatedData(response);
        setStep('done');
      } else if (response.status === 'error') {
        setError(response.error_message);
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión con el servidor');
      setStep('error');
    }
  }, []);

  const handleEdit = useCallback(() => {
    setStep('form');
  }, []);

  const handleRetry = useCallback(() => {
    if (lastDescription) {
      setStep('form');
    } else {
      resetFlow();
    }
  }, [lastDescription, resetFlow]);

  // ─── Reset password — prioridad máxima (pública, cualquier estado de auth) ──

  if (publicView === 'request-access') {
    return <RequestAccessPage />;
  }

  if (publicView === 'reset-password') {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1><span>Cobertec</span> — Soporte</h1>
        </header>
        <main className="app-main">
          <ResetPasswordPage token={resetToken} onDone={handleResetDone} />
        </main>
        <footer className="app-footer">Intake IA v1 — Piloto</footer>
      </div>
    );
  }

  // ─── Carga inicial ────────────────────────────────────

  if (authLoading && authState.status === 'unauthenticated') {
    return (
      <div className="app-container">
        <main className="app-main">
          <Loading message="Cargando..." />
        </main>
      </div>
    );
  }

  // ─── Login / Recuperación de contraseña ──────────────

  if (authState.status === 'unauthenticated') {
    if (publicView === 'forgot-password') {
      return (
        <div className="app-container">
          <header className="app-header">
            <h1><span>Cobertec</span> — Soporte</h1>
          </header>
          <main className="app-main">
            <ForgotPasswordPage onBack={() => setPublicView(null)} />
          </main>
          <footer className="app-footer">Intake IA v1 — Piloto</footer>
        </div>
      );
    }

    return (
      <div className="app-container">
        <header className="app-header">
          <h1><span>Cobertec</span> — Soporte</h1>
        </header>
        <main className="app-main">
          <LoginPage onForgotPassword={() => setPublicView('forgot-password')} />
        </main>
        <footer className="app-footer">Intake IA v1 — Piloto</footer>
      </div>
    );
  }

  // ─── Cambio de contraseña obligatorio ────────────────

  if (authState.status === 'must_change_password') {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1><span>Cobertec</span> — Soporte</h1>
        </header>
        <main className="app-main">
          <ChangePasswordPage />
        </main>
        <footer className="app-footer">Intake IA v1 — Piloto</footer>
      </div>
    );
  }

  // ─── Selección de empresa ─────────────────────────────

  if (authState.status === 'authenticated') {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1><span>Cobertec</span> — Soporte</h1>
        </header>
        <main className="app-main">
          <CompanySelector />
        </main>
        <footer className="app-footer">Intake IA v1 — Piloto</footer>
      </div>
    );
  }

  // ─── App principal ────────────────────────────────────

  const userName = authState.user?.contact?.name ?? '';
  const allCompanies = authState.user?.companies ?? [];

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-inner">
          <h1><span>Cobertec</span> — Soporte</h1>
          <nav className="header-nav">
            <span className="header-user">{userName}</span>
            <div className="nav-divider" />
            <button
              className={`nav-link${page === 'intake' ? ' nav-link-active' : ''}`}
              onClick={resetFlow}
            >
              Nueva incidencia
            </button>
            <button
              className={`nav-link${page === 'dashboard' ? ' nav-link-active' : ''}`}
              onClick={() => setPage('dashboard')}
            >
              Panel del piloto
            </button>
            {isAdmin && (
              <button
                className={`nav-link${page === 'admin' ? ' nav-link-active' : ''}`}
                onClick={() => setPage('admin')}
              >
                Administración
              </button>
            )}
            {isAdmin && (
              <button
                className={`nav-link${page === 'requests' ? ' nav-link-active' : ''}`}
                onClick={() => setPage('requests')}
              >
                Solicitudes de alta
              </button>
            )}
            {isAdmin && (
              <button
                className={`nav-link${page === 'config' ? ' nav-link-active' : ''}`}
                onClick={() => setPage('config')}
              >
                Configuración IA
              </button>
            )}
            <div className="nav-divider" />
            <button className="nav-link nav-link-logout" onClick={logout}>
              Salir
            </button>
          </nav>
        </div>
      </header>

      <main className={`app-main${(page === 'admin' || page === 'config' || page === 'requests') ? ' app-main-wide' : ''}`}>
        {page === 'admin' ? (
          <AdminPanel onBack={resetFlow} />
        ) : page === 'requests' ? (
          <RequestsPanel />
        ) : page === 'config' ? (
          <ConfigPanel />
        ) : page === 'dashboard' ? (
          <Dashboard onBack={resetFlow} />
        ) : (
          <>
            <StepIndicator step={step} />
            <div className="card">
              {/* Selector de empresa para superadmin */}
              {isSuperAdmin && !superadminCompany && step === 'form' && (
                <div className="superadmin-company-picker">
                  <h3>Selecciona la empresa para esta incidencia</h3>
                  <div className="company-picker-list">
                    {allCompanies.map(company => (
                      <button
                        key={company.id}
                        className="company-picker-btn"
                        onClick={() => handleSuperadminCompanySelect(company)}
                      >
                        {company.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 'form' && (!isSuperAdmin || superadminCompany) && (
                <>
                  {isSuperAdmin && superadminCompany && (
                    <div className="superadmin-company-tag">
                      <span>Empresa: <strong>{superadminCompany.name}</strong></span>
                      <button
                        className="superadmin-company-change"
                        onClick={() => setSuperadminCompany(null)}
                      >
                        Cambiar
                      </button>
                    </div>
                  )}
                  <IntakeForm
                    initialDescription={lastDescription}
                    initialAttachments={lastAttachments}
                    onSubmit={handleSubmit}
                  />
                </>
              )}

              {step === 'loading' && <Loading message="Analizando tu consulta..." />}

              {step === 'questions' && questions.length > 0 && (
                <DynamicQuestions
                  questions={questions}
                  onSubmit={handleQuestionsSubmit}
                  onSkip={handleQuestionsSkip}
                />
              )}

              {step === 'confirmation' && classifiedData && (
                <ConfirmationView
                  data={classifiedData}
                  onConfirm={handleConfirm}
                  onEdit={handleEdit}
                />
              )}

              {step === 'creating' && <Loading message="Creando incidencia..." />}

              {step === 'done' && createdData && (
                <TicketResult data={createdData} onNewTicket={resetFlow} />
              )}

              {step === 'error' && error && (
                <ErrorDisplay message={error} onRetry={handleRetry} />
              )}
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        Intake IA v1 — Piloto{page === 'intake' && step === 'done' && (
          <> · <button className="nav-link" onClick={() => setPage('dashboard')}>Ver panel</button></>
        )}
      </footer>
    </div>
  );
}
