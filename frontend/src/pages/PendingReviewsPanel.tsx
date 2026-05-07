/**
 * PendingReviewsPanel — Panel admin de revisiones humanas
 *
 * Accesible para support_lead y superadmin.
 * Tabla con filtros, detalle expandible con audit log, acciones por estado.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchPendingReviews,
  fetchPendingReviewDetail,
  forceApprovePendingReview,
  forceReassignPendingReview,
  retryRedmineNoteSync,
} from '../services/admin-reviews-api';
import type { PendingReviewSummary, AuditLogEntry } from '../services/admin-reviews-api';

interface ReassignmentHistoryEntry {
  from_role: string;
  to_role: string;
  from_redmine_user_id?: number;
  to_redmine_user_id?: number;
  reason: string;
  reassigned_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pendiente',
  approved: 'Aprobado',
  reassigned: 'Reasignado',
  escalated: 'Escalado',
  expired_unreviewed: 'Expirado',
  out_of_sync: 'Desincronizado',
};

const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  reassigned: 'bg-blue-100 text-blue-800',
  escalated: 'bg-red-100 text-red-800',
  expired_unreviewed: 'bg-gray-100 text-gray-600',
  out_of_sync: 'bg-purple-100 text-purple-800',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'Creado',
  approved: 'Aprobado',
  reassigned: 'Reasignado',
  escalated: 'Escalado',
  expired_unreviewed: 'Expirado',
  reassign_failed: 'Error reasignación',
  out_of_sync_detected: 'Desincronización detectada',
  redmine_note_synced: 'Nota sincronizada',
  redmine_note_failed: 'Error nota Redmine',
};

interface ForceReassignModal {
  reviewId: string;
  newRole: string;
  reason: string;
}

export function PendingReviewsPanel() {
  const [reviews, setReviews] = useState<PendingReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLogEntry[]>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reassignModal, setReassignModal] = useState<ForceReassignModal | null>(null);
  const [notaModalId, setNotaModalId] = useState<string | null>(null);

  const formatDate = (iso: string) => new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPendingReviews({
        status: statusFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      setReviews(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando revisiones');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, fromDate, toDate]);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const ensureDetailLoaded = async (reviewId: string) => {
    if (auditLogs[reviewId]) return;
    try {
      const detail = await fetchPendingReviewDetail(reviewId);
      setAuditLogs(prev => ({ ...prev, [reviewId]: detail.audit_log }));
    } catch {
      // silencioso
    }
  };

  const toggleExpand = async (reviewId: string) => {
    if (expandedId === reviewId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(reviewId);
    await ensureDetailLoaded(reviewId);
  };

  const handleNota = async (reviewId: string) => {
    setNotaModalId(reviewId);
    await ensureDetailLoaded(reviewId);
  };

  const handleForceApprove = async (reviewId: string) => {
    setActionLoading(reviewId);
    setActionMessage(null);
    try {
      const result = await forceApprovePendingReview(reviewId);
      setActionMessage(result.message);
      await loadReviews();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : 'Error al aprobar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceReassign = async () => {
    if (!reassignModal) return;
    setActionLoading(reassignModal.reviewId);
    setActionMessage(null);
    try {
      const result = await forceReassignPendingReview(
        reassignModal.reviewId,
        reassignModal.newRole,
        reassignModal.reason,
      );
      setActionMessage(result.message);
      setReassignModal(null);
      await loadReviews();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : 'Error al reasignar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryNote = async (reviewId: string) => {
    setActionLoading(`note-${reviewId}`);
    setActionMessage(null);
    try {
      const result = await retryRedmineNoteSync(reviewId);
      setActionMessage(result.message);
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : 'Error al sincronizar nota');
    } finally {
      setActionLoading(null);
    }
  };

  const exportToCSV = () => {
    const BOM = '\uFEFF';

    const esc = (val: string | number | null | undefined): string => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const makeRow = (cols: (string | number | null | undefined)[]) => cols.map(esc).join(',');

    // Columnas: 1-12 resumen, 13-18 detalle reasignación
    const headers = [
      'ticket_id', 'empresa', 'asignado_actual', 'rol_actual', 'estado',
      'reasignaciones', 'reasignado_por', 'fecha_creacion', 'fecha_resolucion', 'dominio',
      'naturaleza', 'descripcion_resumida',
      'de_rol', 'actor_nombre', 'a_rol', 'motivo', 'fecha_reasignacion', 'sync_redmine',
    ];

    const lines: string[] = [makeRow(headers)];

    for (const review of reviews) {
      let domain = '';
      let nature = '';
      try {
        const cls = JSON.parse(review.original_classification) as {
          classification?: { domain?: string; nature?: string };
        };
        domain = cls?.classification?.domain ?? '';
        nature = cls?.classification?.nature ?? '';
      } catch { /* ignorar JSON inválido */ }

      // Fila principal de resumen (cols 13-18 vacías)
      const lastReassignedBy = review.reassignment_count > 0
        ? (review.last_reassigned_by_name ?? '')
        : '';
      lines.push(makeRow([
        review.redmine_ticket_id,
        review.company_name,
        review.current_assignee_name,
        review.current_assignee_role,
        STATUS_LABELS[review.status] ?? review.status,
        review.reassignment_count,
        lastReassignedBy,
        formatDate(review.created_at),
        review.resolved_at ? formatDate(review.resolved_at) : '',
        domain,
        nature,
        review.intake_description.slice(0, 200),
        '', '', '', '', '', '',
      ]));

      // Filas de detalle de reasignaciones (col 1 = ticket_id, cols 2-11 vacías)
      if (review.reassignment_history) {
        try {
          const history = JSON.parse(review.reassignment_history) as ReassignmentHistoryEntry[];
          // Intentar correlacionar con el audit log si está cargado
          const reassignAudit = (auditLogs[review.id] ?? []).filter(l => l.action === 'reassigned');

          history.forEach((entry, i) => {
            const syncStatus = reassignAudit[i]?.redmine_sync_status ?? 'N/D';
            const actorNombre = reassignAudit[i]?.actor_name ?? '';
            lines.push(makeRow([
              review.redmine_ticket_id,
              '', '', '', '', '', '', '', '', '', '', '',
              entry.from_role,
              actorNombre,
              entry.to_role,
              entry.reason,
              formatDate(entry.reassigned_at),
              syncStatus,
            ]));
          });
        } catch { /* ignorar JSON inválido */ }
      }
    }

    const csv = BOM + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `revisiones_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ─── Datos del modal "Nota" ───────────────────────────────────
  const notaModalReview = notaModalId ? reviews.find(r => r.id === notaModalId) : null;
  let notaHistory: ReassignmentHistoryEntry[] = [];
  if (notaModalReview?.reassignment_history) {
    try { notaHistory = JSON.parse(notaModalReview.reassignment_history); } catch { /* ignorar */ }
  }
  const notaSyncEvents = notaModalId
    ? (auditLogs[notaModalId] ?? []).filter(
        l => l.action === 'redmine_note_synced' || l.action === 'redmine_note_failed',
      )
    : [];
  const notaReassignEvents = notaModalId
    ? (auditLogs[notaModalId] ?? []).filter(l => l.action === 'reassigned')
    : [];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">Revisiones pendientes</h2>
        <div className="flex gap-2">
          <button
            onClick={exportToCSV}
            disabled={reviews.length === 0}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
            title="Exportar revisiones visibles a CSV (UTF-8, compatible con Excel)"
          >
            Exportar CSV
          </button>
          <button
            onClick={loadReviews}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
          >
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6 bg-gray-50 p-4 rounded-lg">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Estado</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Desde</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Mensaje de acción */}
      {actionMessage && (
        <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded p-3">
          {actionMessage}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-gray-500 text-center py-12">Cargando revisiones...</div>
      ) : reviews.length === 0 ? (
        <div className="text-gray-400 text-center py-12">No hay revisiones con los filtros seleccionados.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left text-xs text-gray-600 uppercase tracking-wide">
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Reasignado por</th>
                <th className="px-3 py-2">Asignado a</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Reasign.</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reviews.map(review => (
                <>
                  <tr
                    key={review.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleExpand(review.id)}
                  >
                    <td className="px-3 py-2">
                      <a
                        href={review.redmine_ticket_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium"
                        onClick={e => e.stopPropagation()}
                      >
                        #{review.redmine_ticket_id}
                      </a>
                    </td>
                    <td className="px-3 py-2">{review.company_name}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {review.reassignment_count > 0
                        ? (review.last_reassigned_by_name ?? 'Sistema')
                        : ''}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{review.current_assignee_name}</div>
                      <div className="text-gray-400 text-xs">{review.current_assignee_role}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[review.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[review.status] ?? review.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">{review.reassignment_count}</td>
                    <td className="px-3 py-2 text-gray-500">{formatDate(review.created_at)}</td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1 flex-wrap">
                        {(review.status === 'escalated' || review.status === 'out_of_sync') && (
                          <>
                            <button
                              onClick={() => handleForceApprove(review.id)}
                              disabled={actionLoading === review.id}
                              className="bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-1 rounded disabled:opacity-50"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => setReassignModal({ reviewId: review.id, newRole: '', reason: '' })}
                              disabled={actionLoading === review.id}
                              className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded disabled:opacity-50"
                            >
                              Reasignar
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleNota(review.id)}
                          className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs px-2 py-1 rounded"
                          title="Ver historial de reasignaciones"
                        >
                          Nota
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Fila expandida: audit log completo */}
                  {expandedId === review.id && (
                    <tr key={`${review.id}-detail`}>
                      <td colSpan={8} className="px-3 py-4 bg-gray-50">
                        <div className="mb-3 text-xs text-gray-600">
                          <strong>Descripción:</strong>{' '}
                          {review.intake_description.slice(0, 200)}
                          {review.intake_description.length > 200 ? '…' : ''}
                        </div>

                        <div className="text-xs font-medium text-gray-500 uppercase mb-2">Historial de auditoría</div>
                        {auditLogs[review.id]?.length ? (
                          <table className="w-full text-xs border-collapse bg-white rounded">
                            <thead>
                              <tr className="bg-gray-100 text-gray-500">
                                <th className="px-2 py-1 text-left">Acción</th>
                                <th className="px-2 py-1 text-left">Actor</th>
                                <th className="px-2 py-1 text-left">Detalles</th>
                                <th className="px-2 py-1 text-left">Fecha</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {auditLogs[review.id].map(log => (
                                <tr key={log.id}>
                                  <td className="px-2 py-1 font-medium">
                                    {ACTION_LABELS[log.action] ?? log.action}
                                  </td>
                                  <td className="px-2 py-1">
                                    {log.actor_name ?? (log.actor_type === 'system' ? 'Sistema' : 'Usuario')}
                                  </td>
                                  <td className="px-2 py-1 text-gray-500">
                                    {log.from_role && log.to_role
                                      ? `${log.from_role} → ${log.to_role}`
                                      : log.reason ?? log.redmine_sync_error ?? '—'}
                                  </td>
                                  <td className="px-2 py-1 text-gray-400">{formatDate(log.created_at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="text-gray-400 text-xs">Cargando historial...</div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de reasignación forzada */}
      {reassignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Forzar reasignación</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rol funcional del nuevo técnico
                </label>
                <input
                  type="text"
                  value={reassignModal.newRole}
                  onChange={e => setReassignModal(prev => prev ? { ...prev, newRole: e.target.value } : null)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  placeholder="ej: gmao_instalaciones, ventas_senior..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo
                </label>
                <textarea
                  value={reassignModal.reason}
                  onChange={e => setReassignModal(prev => prev ? { ...prev, reason: e.target.value } : null)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Explica el motivo de la reasignación forzada..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleForceReassign}
                disabled={!!actionLoading || !reassignModal.newRole.trim() || !reassignModal.reason.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm disabled:opacity-50"
              >
                {actionLoading ? 'Aplicando...' : 'Aplicar reasignación'}
              </button>
              <button
                onClick={() => setReassignModal(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Nota": historial de reasignaciones */}
      {notaModalId && notaModalReview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                Historial de reasignaciones — Ticket #{notaModalReview.redmine_ticket_id}
              </h3>
              <button
                onClick={() => setNotaModalId(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {notaHistory.length === 0 ? (
              <p className="text-gray-500 text-sm py-6 text-center">
                Sin reasignaciones — asignación original aceptada.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Reasignación</th>
                      <th className="px-3 py-2 text-left">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {notaHistory.map((entry, i) => {
                      const actorName = notaReassignEvents[i]?.actor_name ?? 'Sistema';
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 whitespace-nowrap text-xs">
                            {formatDate(entry.reassigned_at)}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700">
                            <span className="font-medium">{actorName}</span>
                            {' reasignó de '}
                            <span className="font-mono text-gray-600">{entry.from_role}</span>
                            {' a '}
                            <span className="font-mono text-blue-700 font-medium">{entry.to_role}</span>
                          </td>
                          <td className="px-3 py-2 text-gray-700">{entry.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Estado de sincronización de notas con Redmine */}
            {notaSyncEvents.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Sincronización con Redmine
                </div>
                <div className="space-y-1.5">
                  {notaSyncEvents.map(ev => (
                    <div key={ev.id} className="flex items-center gap-3 text-xs">
                      <span className={ev.action === 'redmine_note_synced'
                        ? 'text-green-600 font-medium'
                        : 'text-red-500 font-medium'}
                      >
                        {ev.action === 'redmine_note_synced' ? '✓ Nota sincronizada' : '✗ Error al sincronizar'}
                      </span>
                      <span className="text-gray-400">{formatDate(ev.created_at)}</span>
                      {ev.redmine_sync_error && (
                        <span className="text-red-400 truncate max-w-xs" title={ev.redmine_sync_error}>
                          {ev.redmine_sync_error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => handleRetryNote(notaModalId)}
                disabled={actionLoading === `note-${notaModalId}`}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded disabled:opacity-50"
                title="Reenviar nota privada con historial al ticket de Redmine"
              >
                {actionLoading === `note-${notaModalId}` ? 'Sincronizando...' : 'Reintentar sync Redmine'}
              </button>
              <button
                onClick={() => setNotaModalId(null)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
