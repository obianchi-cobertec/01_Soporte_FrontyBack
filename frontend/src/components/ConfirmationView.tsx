import type { ClassifiedResponse } from '../types';

interface ConfirmationViewProps {
  data: ClassifiedResponse;
  onConfirm: () => void;
  onEdit: () => void;
  disabled?: boolean;
}

const DOMAIN_LABELS: Record<string, string> = {
  funcionamiento_general: 'Funcionamiento general',
  compras: 'Compras',
  ventas_facturacion: 'Ventas y facturación',
  almacen_stocks: 'Almacén y stocks',
  gmao: 'GMAO',
  movilsat: 'Movilsat',
  portal_ot: 'Portal OT',
  presupuestos_proyectos: 'Presupuestos y proyectos',
  financiero: 'Financiero',
  crm: 'CRM',
  ofertas_comerciales: 'Ofertas comerciales',
  planificador_inteligente: 'Planificador inteligente',
  app_fichajes: 'App fichajes',
  servidor_sistemas: 'Servidor / sistemas',
  tarifas_catalogos: 'Tarifas y catálogos',
  usuarios_accesos: 'Usuarios y accesos',
  informes_documentos: 'Informes y documentos',
  sesiones_conectividad: 'Sesiones y conectividad',
  solucionesia: 'Soluciones IA',
  dominio_no_claro: 'Pendiente de clasificar',
};

export function ConfirmationView({ data, onConfirm, onEdit, disabled = false }: ConfirmationViewProps) {
  const areaLabel = DOMAIN_LABELS[data.display.estimated_area] ?? data.display.estimated_area;

  return (
    <div className="confirmation-view">
      <h2>Hemos entendido tu caso</h2>

      <div className="confirmation-card">
        <div className="confirmation-field">
          <span className="field-label">Resumen</span>
          <p>{data.display.summary}</p>
        </div>

        <div className="confirmation-field">
          <span className="field-label">Área estimada</span>
          <p>{areaLabel}</p>
        </div>

        {data.display.impact && (
          <div className="confirmation-field">
            <span className="field-label">Prioridad</span>
            <p><span className="impact-badge high">{data.display.impact}</span></p>
          </div>
        )}

        {data.display.attachments_received.length > 0 && (
          <div className="confirmation-field">
            <span className="field-label">Archivos adjuntos</span>
            <ul>
              {data.display.attachments_received.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-hint)', marginTop: '1rem' }}>
        Si algo no es correcto, puedes editar tu descripción.
      </p>

      <div className="confirmation-actions">
        <button onClick={onConfirm} disabled={disabled} className="btn-primary">
          Crear incidencia
        </button>
        <button onClick={onEdit} disabled={disabled} className="btn-secondary">
          Editar
        </button>
      </div>
    </div>
  );
}
