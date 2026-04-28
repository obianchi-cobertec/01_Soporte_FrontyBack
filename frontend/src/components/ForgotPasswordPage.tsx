import { useState, type FormEvent } from 'react';
import { forgotPasswordApi } from '../services/auth-api';

interface Props {
  onBack: () => void;
}

export function ForgotPasswordPage({ onBack }: Props) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Introduce tu email');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await forgotPasswordApi({ email: email.trim() });
      setSent(true);
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="success-icon" style={{ marginBottom: '1.25rem' }}>✓</div>
          <h2>Revisa tu email</h2>
          <p className="login-subtitle">
            Si el email está registrado, recibirás un enlace para restablecer tu contraseña en breve.
          </p>
          <p className="login-subtitle forgot-hint">
            El enlace caduca en 1 hora. Revisa también la carpeta de spam.
          </p>
          <button className="btn btn-primary login-btn" onClick={onBack}>
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Recuperar contraseña</h2>
        <p className="login-subtitle">
          Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.es"
              autoComplete="email"
              autoFocus
              disabled={loading}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading || !email.trim()}
          >
            {loading ? 'Enviando...' : 'Enviar enlace'}
          </button>
        </form>

        <p className="login-help">
          <button className="btn-link" onClick={onBack} disabled={loading}>
            Volver al inicio de sesión
          </button>
        </p>
      </div>
    </div>
  );
}
