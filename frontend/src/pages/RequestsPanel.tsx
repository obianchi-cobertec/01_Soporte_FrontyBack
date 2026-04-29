/**
 * RequestsPanel — Panel admin para gestionar solicitudes de alta
 * Solo accesible para admins/superadmins desde App.tsx.
 */

import { useState, useEffect, useCallback } from 'react';
import { authenticatedFetch } from '../services/auth-api';

// ─── Types ───────────────────────────────────────────────

type RequestStatus = 'pending' | 'approved' | 'rejected';

interface UserRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_id: string | null;
  company_name_requested: string;
  company_name: string | null;  // empresa asignada (JOIN)
  phone: string;
  status: RequestStatus;
  rejection_reason: string | null;
  redmine_user_id: number | null;
  created_at: string;
}

interface Company {
  id: string;
  name: string;
}

type FilterStatus = 'all' | RequestStatus;
type ActionState = 'idle' | 'loading' | 'success' | 'error';

interface EditForm {
  first_name: string;
  last_name: string;
  email: string;
  company_name: string;
  company_id: string;
  phone: string;
}

// ─── Component ───────────────────────────────────────────

export function RequestsPanel() {
  const [requests, setRequests] = useState<UserRequest[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [loading, setLoading] = useState(true);

  // Modal de rechazo
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Modal de edición
  const [editModalRequest, setEditModalRequest] = useState<UserRequest | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ first_name: '', last_name: '', email: '', company_name: '', company_id: '', phone: '' });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Estado por solicitud (aprobar/rechazar en curso)
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  // Cargar empresas al montar (para el selector del modal de edición)
  useEffect(() => {
    authenticatedFetch<{ companies: Company[] }>('/admin/companies')
      .then((data) => setCompanies(data.companies ?? []))
      .catch(() => setCompanies([]));
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === 'all' ? '' : `?status=${filter}`;
      const data = await authenticatedFetch<{ requests: UserRequest[] }>(`/requests/admin${params}`);
      setRequests(data.requests);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  async function handleApprove(id: string) {
    setActionStates((s) => ({ ...s, [id]: 'loading' }));
    setActionErrors((e) => { const n = { ...e }; delete n[id]; return n; });

    try {
      await authenticatedFetch(`/requests/admin/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      setActionStates((s) => ({ ...s, [id]: 'success' }));
      setTimeout(() => fetchRequests(), 800);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al aprobar. Inténtalo de nuevo.';
      setActionStates((s) => ({ ...s, [id]: 'error' }));
      setActionErrors((e) => ({ ...e, [id]: message }));
    }
  }

  async function handleReject() {
    if (!rejectModalId || !rejectReason.trim()) return;
    const id = rejectModalId;

    setActionStates((s) => ({ ...s, [id]: 'loading' }));
    setRejectModalId(null);

    try {
      await authenticatedFetch(`/requests/admin/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      setActionStates((s) => ({ ...s, [id]: 'success' }));
      setRejectReason('');
      setTimeout(() => fetchRequests(), 800);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al rechazar.';
      setActionStates((s) => ({ ...s, [id]: 'error' }));
      setActionErrors((e) => ({ ...e, [id]: message }));
    }
  }

  function openEditModal(req: UserRequest) {
    setEditModalRequest(req);
    setEditForm({
      first_name: req.first_name,
      last_name: req.last_name,
      email: req.email,
      company_name: req.company_name_requested,
      company_id: req.company_id ?? '',
      phone: req.phone,
    });
    setEditError('');
  }

  async function handleEditSave() {
    if (!editModalRequest) return;
    setEditLoading(true);
    setEditError('');

    try {
      await authenticatedFetch(`/requests/admin/${editModalRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          email: editForm.email.trim(),
          company_id: editForm.company_id || null,
          phone: editForm.phone.trim(),
        }),
      });
      setEditModalRequest(null);
      fetchRequests();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Error al guardar los cambios.');
    } finally {
      setEditLoading(false);
    }
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitudes de alta</h1>
          {pendingCount > 0 && filter === 'pending' && (
            <p className="text-sm text-orange-600 mt-1">
              {pendingCount} {pendingCount === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}
            </p>
          )}
        </div>
        <button
          onClick={fetchRequests}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              filter === s
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {s === 'pending' ? 'Pendientes' : s === 'approved' ? 'Aprobadas' : s === 'rejected' ? 'Rechazadas' : 'Todas'}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No hay solicitudes {filter !== 'all' ? `con estado "${filter === 'pending' ? 'pendiente' : filter === 'approved' ? 'aprobada' : 'rechazada'}"` : ''}.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              actionState={actionStates[req.id] ?? 'idle'}
              actionError={actionErrors[req.id]}
              onApprove={() => handleApprove(req.id)}
              onReject={() => { setRejectModalId(req.id); setRejectReason(''); }}
              onEdit={() => openEditModal(req)}
            />
          ))}
        </div>
      )}

      {/* Modal de rechazo */}
      {rejectModalId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Rechazar solicitud</h3>
            <p className="text-sm text-gray-500 mb-4">
              Se enviará un email al solicitante con el motivo del rechazo.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motivo del rechazo..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRejectModalId(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim()}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edición */}
      {editModalRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Editar solicitud</h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={editForm.first_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Apellido</label>
                  <input
                    type="text"
                    value={editForm.last_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Empresa (texto solicitado por el cliente)
                </label>
                <input
                  type="text"
                  value={editForm.company_name}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-500 cursor-default"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Empresa asignada <span className="text-gray-400 font-normal">(requerida para aprobar)</span>
                </label>
                <select
                  value={editForm.company_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, company_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Sin asignar</option>
                  {companies.filter((c) => (c as Company & { active?: boolean }).active !== false).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+34 600 000 000"
                />
              </div>
            </div>

            {editError && (
              <div className="mt-3 text-xs text-red-600 bg-red-50 rounded px-3 py-2">
                {editError}
              </div>
            )}

            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => setEditModalRequest(null)}
                disabled={editLoading}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditSave}
                disabled={editLoading || !editForm.first_name.trim() || !editForm.last_name.trim() || !editForm.email.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editLoading ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RequestCard ─────────────────────────────────────────

interface RequestCardProps {
  request: UserRequest;
  actionState: ActionState;
  actionError?: string;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}

function RequestCard({ request, actionState, actionError, onApprove, onReject, onEdit }: RequestCardProps) {
  const date = new Date(request.created_at).toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const statusBadge = {
    pending: <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700 font-medium">Pendiente</span>,
    approved: <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">Aprobada</span>,
    rejected: <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 font-medium">Rechazada</span>,
  }[request.status];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900">
              {request.first_name} {request.last_name}
            </span>
            {statusBadge}
          </div>
          <div className="text-sm text-gray-500 space-y-0.5">
            <div>{request.email}</div>
            <div className="flex gap-4">
              <span>
                {request.company_name_requested}
                {request.company_name && request.company_name !== request.company_name_requested && (
                  <span className="text-green-600 ml-1">→ {request.company_name}</span>
                )}
                {!request.company_id && request.status === 'pending' && (
                  <span className="text-orange-500 ml-1 text-xs">(sin asignar)</span>
                )}
              </span>
              {request.phone && <span>{request.phone}</span>}
            </div>
            <div className="text-xs text-gray-400">{date}</div>
          </div>
          {request.rejection_reason && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
              Motivo: {request.rejection_reason}
            </div>
          )}
          {request.redmine_user_id && (
            <div className="mt-1 text-xs text-green-600">
              Redmine ID: {request.redmine_user_id}
            </div>
          )}
        </div>

        {request.status === 'pending' && (
          <div className="flex gap-2 shrink-0">
            {actionState === 'loading' ? (
              <span className="text-sm text-gray-400">Procesando...</span>
            ) : actionState === 'success' ? (
              <span className="text-sm text-green-600">✓ Procesado</span>
            ) : (
              <>
                <button
                  onClick={onEdit}
                  className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={onApprove}
                  disabled={!request.company_id}
                  title={!request.company_id ? 'Edita la solicitud y asigna una empresa primero' : undefined}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Aprobar
                </button>
                <button
                  onClick={onReject}
                  className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50 transition-colors"
                >
                  Rechazar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {actionError && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
          {actionError}
        </div>
      )}
    </div>
  );
}
