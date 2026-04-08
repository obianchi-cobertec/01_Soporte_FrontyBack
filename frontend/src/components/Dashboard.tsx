import { useState, useEffect } from 'react';
import { fetchMetrics, fetchRecentTickets } from '../services/metrics';
import type { PilotMetrics, RecentTicket } from '../services/metrics';

const NATURE_LABELS: Record<string, string> = {
  incidencia_error: 'Error',
  consulta_funcional: 'Consulta',
  formacion_duda_uso: 'Formación',
  configuracion: 'Configuración',
  peticion_cambio_mejora: 'Mejora',
  usuario_acceso: 'Acceso',
  instalacion_entorno: 'Instalación',
  importacion_exportacion: 'Import/Export',
  rendimiento_bloqueo: 'Rendimiento',
  ambiguo: 'Ambiguo',
};

const DOMAIN_LABELS: Record<string, string> = {
  funcionamiento_general: 'General',
  compras: 'Compras',
  ventas_facturacion: 'Ventas',
  almacen_stocks: 'Almacén',
  gmao: 'GMAO',
  movilsat: 'Movilsat',
  portal_ot: 'Portal OT',
  presupuestos_proyectos: 'Proyectos',
  financiero: 'Financiero',
  crm: 'CRM',
  ofertas_comerciales: 'Ofertas',
  planificador_inteligente: 'Planificador',
  app_fichajes: 'Fichajes',
  servidor_sistemas: 'Servidor',
  tarifas_catalogos: 'Tarifas',
  dominio_no_claro: 'No claro',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'var(--color-success)',
  medium: 'var(--color-warning-text)',
  low: 'var(--color-error)',
};

export function Dashboard({ onBack }: { onBack: () => void }) {
  const [metrics, setMetrics] = useState<PilotMetrics | null>(null);
  const [tickets, setTickets] = useState<RecentTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchMetrics(), fetchRecentTickets()])
      .then(([m, t]) => {
        setMetrics(m);
        setTickets(t);
      })
      .catch(err => console.error('Error cargando métricas:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card">
        <div className="loading">
          <div className="spinner" />
          <p>Cargando métricas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Panel del piloto
        </h2>
        <button onClick={onBack} className="btn-secondary" style={{ marginTop: 0, padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
          Nueva incidencia
        </button>
      </div>

      {/* Metric cards */}
      {metrics && (
        <div className="metric-grid">
          <div className="metric-card">
            <span className="metric-label">Flujos iniciados</span>
            <span className="metric-value">{metrics.total_flows}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Completados</span>
            <span className="metric-value">{metrics.completed_flows}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Tasa completitud</span>
            <span className="metric-value">{metrics.completion_rate}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Tiempo medio IA</span>
            <span className="metric-value">
              {metrics.avg_classification_ms ? `${(metrics.avg_classification_ms / 1000).toFixed(1)}s` : '—'}
            </span>
          </div>
        </div>
      )}

      {/* Confidence distribution */}
      {metrics && metrics.confidence_distribution && Object.keys(metrics.confidence_distribution).length > 0 && (
        <div className="card" style={{ marginTop: '1rem', padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--color-text-secondary)' }}>
            Distribución de confianza
          </h3>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {Object.entries(metrics.confidence_distribution).map(([level, count]) => (
              <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: CONFIDENCE_COLORS[level] ?? 'var(--color-text-hint)'
                }} />
                <span style={{ fontSize: '0.85rem' }}>
                  {level}: <strong>{count as number}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent tickets */}
      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Tickets recientes
        </h3>
        {tickets.length === 0 ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-hint)' }}>
            Aún no hay tickets creados. Prueba el formulario para generar el primero.
          </div>
        ) : (
          <div className="ticket-list">
            {tickets.map(t => (
              <div key={t.session_id} className="ticket-row">
                <div className="ticket-row-main">
                  <span className="ticket-row-id">#{t.ticket_id}</span>
                  <span className="ticket-row-nature">{NATURE_LABELS[t.nature] ?? t.nature}</span>
                  <span className="ticket-row-domain">{DOMAIN_LABELS[t.domain] ?? t.domain}</span>
                </div>
                <div className="ticket-row-meta">
                  <span className="confidence-dot" style={{
                    background: CONFIDENCE_COLORS[t.confidence] ?? 'var(--color-text-hint)'
                  }} />
                  <span>{t.confidence}</span>
                  {t.duration_ms && <span>{(t.duration_ms / 1000).toFixed(1)}s</span>}
                  <span>{new Date(t.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
