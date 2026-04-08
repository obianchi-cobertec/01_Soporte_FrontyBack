interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorDisplay({ message, onRetry }: ErrorDisplayProps) {
  return (
    <div className="error-display">
      <div className="error-icon">!</div>
      <h3>Ha ocurrido un problema</h3>
      <p>{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary">
          Intentar de nuevo
        </button>
      )}
    </div>
  );
}
