interface CancelConfirmProps {
  onConfirm: () => void;
  onDismiss: () => void;
}

export function CancelConfirm({ onConfirm, onDismiss }: CancelConfirmProps) {
  return (
    <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-surface)' }}>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--color-text)' }}>
        ¿Seguro que quieres cancelar la incidencia?
      </p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" className="btn-primary" onClick={onConfirm}>
          Sí, cancelar
        </button>
        <button type="button" className="btn-secondary" onClick={onDismiss}>
          No, continuar
        </button>
      </div>
    </div>
  );
}
