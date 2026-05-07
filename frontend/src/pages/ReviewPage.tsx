/**
 * ReviewPage — Página pública de revisión humana de tickets
 *
 * Accesible sin autenticación vía /review/:token
 * El técnico puede confirmar su asignación o reasignar a otro compañero.
 */

import { useState, useEffect } from 'react';
import { fetchReviewData, approveReview, reassignReview } from '../services/review-api';
import type { ReviewData, AvailableAssignee } from '../services/review-api';

type ReviewState =
  | 'loading'
  | 'loaded'
  | 'reassigning'
  | 'success_approved'
  | 'success_reassigned'
  | 'error';

interface ApiError {
  error: string;
  message: string;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: 'Este enlace no es válido o ha expirado. Si crees que es un error, contacta con el administrador del sistema.',
  TOKEN_EXPIRED: 'Este enlace de revisión ha expirado. El periodo de revisión es de 7 días desde la creación del ticket.',
  OUT_OF_SYNC: 'El ticket fue reasignado manualmente en Redmine. El responsable de soporte ha sido notificado para revisar la situación.',
  REDMINE_FAILED: 'No se pudo realizar la reasignación en Redmine. Por favor, inténtalo de nuevo en unos minutos.',
};

function getErrorMessage(err: ApiError): string {
  return ERROR_MESSAGES[err.error] ?? err.message ?? 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
}

interface Props {
  token: string;
}

export function ReviewPage({ token }: Props) {
  const [state, setState] = useState<ReviewState>('loading');
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Campos de reasignación
  const [newRole, setNewRole] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setError('No se proporcionó un token de revisión.');
      return;
    }

    fetchReviewData(token)
      .then(data => {
        setReviewData(data);
        setState('loaded');
      })
      .catch((err: ApiError) => {
        setState('error');
        setError(getErrorMessage(err));
      });
  }, [token]);

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      const result = await approveReview(token);
      setSuccessMessage(result.message);
      setState('success_approved');
    } catch (err) {
      setError(getErrorMessage(err as ApiError));
      setState('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    if (!newRole.trim()) {
      setFieldError('Selecciona el técnico al que quieres reasignar el ticket.');
      return;
    }
    if (!reason.trim()) {
      setFieldError('Introduce el motivo de la reasignación.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await reassignReview(token, newRole.trim(), reason.trim());
      setSuccessMessage(result.message);
      setState('success_reassigned');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.error === 'OUT_OF_SYNC' || apiErr.error === 'REDMINE_FAILED') {
        setError(getErrorMessage(apiErr));
        setState('error');
      } else {
        setFieldError(apiErr.message ?? 'Error al reasignar.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-lg mb-2">Cargando datos de revisión...</div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md max-w-lg w-full p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">No se puede cargar la revisión</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-400">
            Si necesitas ayuda, contacta con{' '}
            <a href="mailto:soporte@cobertec.com" className="text-blue-600 underline">
              soporte@cobertec.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  if (state === 'success_approved' || state === 'success_reassigned') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md max-w-lg w-full p-8 text-center">
          <div className="text-green-500 text-5xl mb-4">✓</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">
            {state === 'success_approved' ? 'Asignación confirmada' : 'Reasignación completada'}
          </h2>
          <p className="text-gray-600">{successMessage}</p>
          {reviewData && (
            <a
              href={reviewData.redmine_ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-6 text-blue-600 underline text-sm"
            >
              Ver ticket #{reviewData.redmine_ticket_id} en Redmine →
            </a>
          )}
        </div>
      </div>
    );
  }

  if (state === 'reassigning' && reviewData) {
    const assigneeOptions: AvailableAssignee[] = (reviewData.available_assignees ?? [])
      .filter(a => a.role !== reviewData.current_assignee_role);

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md max-w-xl w-full p-8">
          <h1 className="text-xl font-semibold text-gray-800 mb-1">Reasignar ticket</h1>
          <p className="text-gray-500 text-sm mb-6">
            Ticket #{reviewData.redmine_ticket_id} · {reviewData.company_name}
          </p>

          <form onSubmit={handleReassignSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nuevo técnico responsable
              </label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                disabled={isSubmitting}
              >
                <option value="">— Selecciona un técnico —</option>
                {assigneeOptions.map(a => (
                  <option key={a.role} value={a.role}>
                    {a.name} — {a.role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motivo de la reasignación
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Explica brevemente por qué reasignas este ticket..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            {fieldError && (
              <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">
                {fieldError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md text-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Aplicando...' : 'Aplicar reasignación'}
              </button>
              <button
                type="button"
                onClick={() => setState('loaded')}
                disabled={isSubmitting}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-md text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Estado 'loaded'
  if (!reviewData) return null;

  const classification = reviewData.original_classification;
  const classif = classification['classification'] as Record<string, string> | undefined;
  const expiresDate = new Date(reviewData.expires_at).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md max-w-2xl w-full p-8">
        {/* Cabecera */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">Revisión de incidencia</h1>
            <p className="text-gray-500 text-sm mt-1">
              Ticket #{reviewData.redmine_ticket_id} · Válido hasta {expiresDate}
            </p>
          </div>
          {reviewData.reassignment_count > 0 && (
            <span className="bg-orange-100 text-orange-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {reviewData.reassignment_count} reasignación{reviewData.reassignment_count !== 1 ? 'es' : ''}
            </span>
          )}
        </div>

        {/* Datos del ticket */}
        <div className="space-y-4 mb-6">
          <div className="bg-gray-50 rounded-md p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Empresa</div>
            <div className="text-gray-800 font-medium">{reviewData.company_name}</div>
          </div>

          <div className="bg-gray-50 rounded-md p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Descripción del usuario</div>
            <div className="text-gray-700 text-sm whitespace-pre-wrap">
              {truncate(reviewData.intake_description, 300)}
            </div>
          </div>

          {classif && (
            <div className="bg-gray-50 rounded-md p-4 grid grid-cols-2 gap-3">
              {classif['nature'] && (
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Naturaleza</div>
                  <div className="text-gray-700 text-sm">{classif['nature']}</div>
                </div>
              )}
              {classif['domain'] && (
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Área</div>
                  <div className="text-gray-700 text-sm">{classif['domain']}</div>
                </div>
              )}
            </div>
          )}

          <div className="bg-blue-50 rounded-md p-4">
            <div className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Asignado a</div>
            <div className="text-gray-800 font-medium">{reviewData.current_assignee_name}</div>
            <div className="text-gray-500 text-xs mt-0.5">{reviewData.current_assignee_role}</div>
          </div>
        </div>

        {/* Link a Redmine */}
        <a
          href={reviewData.redmine_ticket_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-blue-600 text-sm underline mb-6"
        >
          Ver ticket #{reviewData.redmine_ticket_id} en Redmine →
        </a>

        {/* Acciones */}
        <div className="flex gap-3 border-t border-gray-100 pt-6">
          <button
            onClick={handleApprove}
            disabled={isSubmitting}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-md disabled:opacity-50"
          >
            {isSubmitting ? 'Confirmando...' : 'Confirmar asignación'}
          </button>
          <button
            onClick={() => setState('reassigning')}
            disabled={isSubmitting}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 px-4 rounded-md disabled:opacity-50"
          >
            Reasignar a otro técnico
          </button>
        </div>
      </div>
    </div>
  );
}
