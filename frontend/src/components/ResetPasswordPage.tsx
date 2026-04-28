import { useState, type FormEvent } from 'react';
import { resetPasswordApi, AuthApiError } from '../services/auth-api';

interface Props {
  token: string;
  onDone: () => void;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function ResetPasswordPage({ token, onDone }: Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await resetPasswordApi({ token, new_password: newPassword, confirm_password: confirmPassword });
      setDone(true);
    } catch (err) {
      if (err instanceof AuthApiError) {
        setError(err.body.message);
      } else {
        setError('Error de conexión. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="success-icon" style={{ marginBottom: '1.25rem' }}>✓</div>
          <h2>Contraseña restablecida</h2>
          <p className="login-subtitle">
            Tu contraseña se ha cambiado correctamente. Ya puedes iniciar sesión con tu nueva contraseña.
          </p>
          <button className="btn btn-primary login-btn" onClick={onDone}>
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Nueva contraseña</h2>
        <p className="login-subtitle">
          Introduce tu nueva contraseña. Debe tener al menos 8 caracteres.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="reset-new-password">Nueva contraseña</label>
            <div className="password-wrapper">
              <input
                id="reset-new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                autoFocus
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                tabIndex={-1}
                aria-label={showNew ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowNew(v => !v)}
              >
                {showNew ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="reset-confirm-password">Confirmar contraseña</label>
            <div className="password-wrapper">
              <input
                id="reset-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Repite la contraseña"
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                tabIndex={-1}
                aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowConfirm(v => !v)}
              >
                {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading || !newPassword || !confirmPassword}
          >
            {loading ? 'Guardando...' : 'Establecer contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
