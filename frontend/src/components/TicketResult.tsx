import type { CreatedResponse } from '../types';

interface TicketResultProps {
  data: CreatedResponse;
  onNewTicket: () => void;
}

export function TicketResult({ data, onNewTicket }: TicketResultProps) {
  return (
    <div className="ticket-result">
      <div className="success-icon">✓</div>
      <h2>Incidencia creada correctamente</h2>
      <p className="ticket-number">#{data.ticket_id}</p>

      {data.ticket_url && (
        <a href={data.ticket_url} target="_blank" rel="noopener noreferrer" className="ticket-link">
          Ver en Redmine
        </a>
      )}

      <p className="result-message">
        Tu incidencia ha sido registrada, clasificada y asignada automáticamente.
        Recibirás seguimiento a través del sistema habitual.
      </p>

      <button onClick={onNewTicket} className="btn-secondary">
        Crear otra incidencia
      </button>
    </div>
  );
}
