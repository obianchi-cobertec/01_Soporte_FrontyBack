/**
 * ConfigProposalsPanel — Panel de propuestas de configuración generadas por el agente IA
 *
 * Accesible solo para support_lead.
 * Muestra propuestas de cambio en taxonomy, redmine-mapping y assignment-rules
 * generadas automáticamente tras detectar patrones de reasignación repetidos.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchConfigProposals,
  applyConfigProposal,
  rejectConfigProposal,
} from '../services/admin-config-api';
import type { ConfigProposal, ConfigProposalDiff } from '../services/admin-config-api';

type Tab = 'proposed' | 'applied' | 'rejected';

const TAB_LABELS: Record<Tab, string> = {
  proposed: 'Pendientes',
  applied: 'Aplicadas',
  rejected: 'Rechazadas',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-red-100 text-red-800',
};

const FILE_LABELS: Record<string, string> = {
  'taxonomy.json': 'Taxonomía',
  'redmine-mapping.json': 'Mapeo Redmine',
  'assignment-rules.json': 'Reglas de asignación',
};

function parseDiff(diffStr: string): ConfigProposalDiff | null {
  try {
    return JSON.parse(diffStr) as ConfigProposalDiff;
  } catch {
    return null;
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(vacío)';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

interface DecisionModal {
  id: string;
  action: 'apply' | 'reject';
  reason: string;
}

export function ConfigProposalsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('proposed');
  const [proposals, setProposals] = useState<ConfigProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reasoningOpenId, setReasoningOpenId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [decisionModal, setDecisionModal] = useState<DecisionModal | null>(null);

  const loadProposals = useCallback(async (tab: Tab) => {
    setLoading(true);
    setError(null);
    setActionMessage(null);
    try {
      const data = await fetchConfigProposals({ change_type: tab });
      setProposals(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando propuestas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProposals(activeTab);
  }, [activeTab, loadProposals]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setExpandedId(null);
    setReasoningOpenId(null);
  };

  const handleDecisionConfirm = async () => {
    if (!decisionModal) return;
    setActionLoading(decisionModal.id);
    setActionMessage(null);
    try {
      const result = decisionModal.action === 'apply'
        ? await applyConfigProposal(decisionModal.id, decisionModal.reason || undefined)
        : await rejectConfigProposal(decisionModal.id, decisionModal.reason || undefined);
      setActionMessage(result.message);
      setDecisionModal(null);
      await loadProposals(activeTab);
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : 'Error al procesar la acción');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">Propuestas de configuración</h2>
        <button
          onClick={() => loadProposals(activeTab)}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
        >
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        El agente IA analiza los patrones de reasignación y propone cambios en la configuración.
        Revisa cada propuesta antes de aplicarla.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(Object.keys(TAB_LABELS) as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
              activeTab === tab
                ? 'bg-white border border-b-white border-gray-200 text-blue-700 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
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

      {/* Lista */}
      {loading ? (
        <div className="text-gray-500 text-center py-12">Cargando propuestas...</div>
      ) : proposals.length === 0 ? (
        <div className="text-gray-400 text-center py-12">
          No hay propuestas {TAB_LABELS[activeTab].toLowerCase()} en este momento.
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map(proposal => {
            const diff = parseDiff(proposal.diff);
            const isExpanded = expandedId === proposal.id;
            const isReasoningOpen = reasoningOpenId === proposal.id;
            const humanReasons: string[] = (() => {
              try {
                return proposal.human_reasons ? (JSON.parse(proposal.human_reasons) as string[]) : [];
              } catch {
                return [];
              }
            })();

            return (
              <div
                key={proposal.id}
                className="border border-gray-200 rounded-lg bg-white shadow-sm"
              >
                {/* Cabecera de la card */}
                <div
                  className="flex items-start justify-between p-4 cursor-pointer hover:bg-gray-50 rounded-lg"
                  onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {FILE_LABELS[proposal.config_file] ?? proposal.config_file}
                      </span>
                      {proposal.llm_confidence && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${CONFIDENCE_COLORS[proposal.llm_confidence] ?? 'bg-gray-100 text-gray-600'}`}>
                          Confianza: {CONFIDENCE_LABELS[proposal.llm_confidence] ?? proposal.llm_confidence}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatDate(proposal.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-800 leading-snug">
                      {proposal.llm_summary ?? 'Sin resumen disponible'}
                    </p>
                    {diff && (
                      <p className="text-xs text-gray-400 mt-1 font-mono">
                        {diff.jsonpath}
                      </p>
                    )}
                  </div>
                  <span className="text-gray-400 ml-3 text-lg select-none">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3">

                    {/* Diff visual */}
                    {diff && (
                      <div className="mb-4">
                        <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                          Cambio propuesto
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-red-600 font-medium mb-1">Antes</div>
                            <pre className="bg-red-50 border border-red-100 rounded p-2 text-xs overflow-auto max-h-32 whitespace-pre-wrap break-all">
                              {formatValue(diff.before)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-xs text-green-600 font-medium mb-1">Después</div>
                            <pre className="bg-green-50 border border-green-100 rounded p-2 text-xs overflow-auto max-h-32 whitespace-pre-wrap break-all">
                              {formatValue(diff.after)}
                            </pre>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Justificaciones humanas */}
                    {humanReasons.length > 0 && (
                      <div className="mb-4">
                        <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                          Razones del patrón detectado
                        </div>
                        <ul className="space-y-1">
                          {humanReasons.map((reason, i) => (
                            <li key={i} className="text-xs text-gray-600 flex gap-2">
                              <span className="text-gray-300">•</span>
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Razonamiento del LLM (colapsable) */}
                    {proposal.llm_reasoning && (
                      <div className="mb-4">
                        <button
                          onClick={() => setReasoningOpenId(isReasoningOpen ? null : proposal.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {isReasoningOpen ? '▲ Ocultar razonamiento del agente' : '▼ Ver razonamiento del agente'}
                        </button>
                        {isReasoningOpen && (
                          <div className="mt-2 bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {proposal.llm_reasoning}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Info de revisión (si ya fue procesada) */}
                    {proposal.change_type !== 'proposed' && (
                      <div className="mb-4 bg-gray-50 rounded p-3 text-xs text-gray-600">
                        <span className="font-medium">
                          {proposal.change_type === 'applied' ? 'Aplicada' : 'Rechazada'}
                        </span>
                        {proposal.reviewed_at && (
                          <span className="ml-2">el {formatDate(proposal.reviewed_at)}</span>
                        )}
                        {proposal.review_decision_reason && (
                          <div className="mt-1">Motivo: {proposal.review_decision_reason}</div>
                        )}
                      </div>
                    )}

                    {/* Acciones (solo para propuestas pendientes) */}
                    {proposal.change_type === 'proposed' && (
                      <div className="flex gap-3 mt-2">
                        <button
                          onClick={() => setDecisionModal({ id: proposal.id, action: 'apply', reason: '' })}
                          disabled={actionLoading === proposal.id}
                          className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
                        >
                          Aplicar cambio
                        </button>
                        <button
                          onClick={() => setDecisionModal({ id: proposal.id, action: 'reject', reason: '' })}
                          disabled={actionLoading === proposal.id}
                          className="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de decisión */}
      {decisionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              {decisionModal.action === 'apply' ? 'Aplicar cambio de configuración' : 'Rechazar propuesta'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {decisionModal.action === 'apply'
                ? 'Este cambio se escribirá en el archivo de configuración inmediatamente. Se creará un backup automático (.bak).'
                : 'La propuesta quedará marcada como rechazada y no se aplicará.'}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motivo (opcional)
              </label>
              <textarea
                value={decisionModal.reason}
                onChange={e => setDecisionModal(prev => prev ? { ...prev, reason: e.target.value } : null)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                rows={3}
                placeholder="Añade un comentario sobre esta decisión..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDecisionConfirm}
                disabled={!!actionLoading}
                className={`flex-1 text-white py-2 rounded text-sm disabled:opacity-50 ${
                  decisionModal.action === 'apply'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {actionLoading
                  ? 'Procesando...'
                  : decisionModal.action === 'apply'
                    ? 'Confirmar y aplicar'
                    : 'Confirmar rechazo'}
              </button>
              <button
                onClick={() => setDecisionModal(null)}
                disabled={!!actionLoading}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
