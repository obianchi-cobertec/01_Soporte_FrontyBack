import { useState, useCallback, useRef } from 'react';
import { IntakeForm } from './components/IntakeForm';
import { ConfirmationView } from './components/ConfirmationView';
import { DynamicQuestions } from './components/DynamicQuestions';
import { TicketResult } from './components/TicketResult';
import { ErrorDisplay } from './components/ErrorDisplay';
import { Loading } from './components/Loading';
import { StepIndicator } from './components/StepIndicator';
import { Dashboard } from './components/Dashboard';
import { submitIntake, confirmIntake } from './services/api';
import { generateSessionId } from './utils/session';
import type {
  FlowStep,
  Attachment,
  ClassifiedResponse,
  CreatedResponse,
  DynamicQuestion,
} from './types';

type Page = 'intake' | 'dashboard';

const PLACEHOLDER_USER = {
  user_id: '__PENDIENTE_AUTH__',
  company_id: '__PENDIENTE_AUTH__',
  company_name: 'Empresa de prueba',
};

export default function App() {
  const [page, setPage] = useState<Page>('intake');
  const [step, setStep] = useState<FlowStep>('form');
  const [error, setError] = useState<string | null>(null);
  const [classifiedData, setClassifiedData] = useState<ClassifiedResponse | null>(null);
  const [createdData, setCreatedData] = useState<CreatedResponse | null>(null);
  const [questions, setQuestions] = useState<DynamicQuestion[]>([]);
  const [lastDescription, setLastDescription] = useState('');
  const [lastAttachments, setLastAttachments] = useState<Attachment[]>([]);

  const sessionIdRef = useRef(generateSessionId());

  const resetFlow = useCallback(() => {
    sessionIdRef.current = generateSessionId();
    setStep('form');
    setError(null);
    setClassifiedData(null);
    setCreatedData(null);
    setQuestions([]);
    setLastDescription('');
    setLastAttachments([]);
    setPage('intake');
  }, []);

  const handleSubmit = useCallback(async (description: string, attachments: Attachment[]) => {
    setLastDescription(description);
    setLastAttachments(attachments);
    setStep('loading');
    setError(null);

    try {
      const response = await submitIntake({
        session_id: sessionIdRef.current,
        user_id: PLACEHOLDER_USER.user_id,
        company_id: PLACEHOLDER_USER.company_id,
        company_name: PLACEHOLDER_USER.company_name,
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
  }, []);

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

  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1><span>Cobertec</span> — Soporte</h1>
          <button
            className="nav-link"
            onClick={() => setPage(page === 'intake' ? 'dashboard' : 'intake')}
          >
            {page === 'intake' ? 'Panel del piloto' : 'Nueva incidencia'}
          </button>
        </div>
      </header>

      <main className="app-main">
        {page === 'dashboard' ? (
          <Dashboard onBack={resetFlow} />
        ) : (
          <>
            <StepIndicator step={step} />
            <div className="card">
              {step === 'form' && (
                <IntakeForm
                  initialDescription={lastDescription}
                  initialAttachments={lastAttachments}
                  onSubmit={handleSubmit}
                />
              )}

              {step === 'loading' && (
                <Loading message="Analizando tu consulta..." />
              )}

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

              {step === 'creating' && (
                <Loading message="Creando incidencia..." />
              )}

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
        Intake IA v1 — Piloto {page === 'intake' && step === 'done' && (
          <> · <button className="nav-link" onClick={() => setPage('dashboard')}>Ver panel</button></>
        )}
      </footer>
    </div>
  );
}
