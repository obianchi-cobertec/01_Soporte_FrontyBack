import { useState, type FormEvent } from 'react';
import { resetPasswordApi, AuthApiError } from '../services/auth-api';

interface Props {
  token: string;
  onDone: () => void;
}

export function ResetPasswordPage({ token, onDone }: Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
            <input
              id="reset-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-field">
            <label htmlFor="reset-confirm-password">Confirmar contraseña</label>
            <input
              id="reset-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Repite la contraseña"
              disabled={loading}
            />
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
