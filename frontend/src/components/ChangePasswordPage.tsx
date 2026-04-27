/**
 * ChangePasswordPage — Pantalla de cambio de contraseña
 *
 * - Obligatorio (must_change_password=true): no pide contraseña actual
 * - Voluntario: pide contraseña actual para verificar
 */

import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  voluntary?: boolean;
  onCancel?: () => void;
}

export function ChangePasswordPage({ voluntary = false, onCancel }: Props) {
  const { changePassword, isLoading, error } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (newPassword !== confirmPassword) {
      setLocalError('Las contraseñas no coinciden.');
      return;
    }

    if (newPassword.length < 8) {
      setLocalError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    try {
      // En cambio obligatorio no se verifica contraseña actual — se pasa vacío
      await changePassword(voluntary ? currentPassword : '', newPassword, confirmPassword);
      if (voluntary) setSuccess(true);
    } catch {
      // El error ya está en context
    }
  };

  if (success) {
    return (
      <div className="card">
        <div className="change-password-success">
          <div className="success-icon">✓</div>
          <h2>Contraseña actualizada</h2>
          <p>Tu contraseña se ha cambiado correctamente.</p>
          {onCancel && (
            <button className="btn btn-primary" onClick={onCancel}>
              Volver
            </button>
          )}
        </div>
      </div>
    );
  }

  const displayError = localError ?? error;

  return (
    <div className="card">
      <div className="change-password-container">
        {!voluntary && (
          <div className="change-password-notice">
            <span className="notice-icon">🔒</span>
            <p>Debes establecer una nueva contraseña para continuar.</p>
          </div>
        )}

        <h2>{voluntary ? 'Cambiar contraseña' : 'Nueva contraseña'}</h2>

        <form className="change-password-form" onSubmit={handleSubmit}>
          {voluntary && (
            <div className="form-field">
              <label htmlFor="current-password">Contraseña actual</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={isLoading}
              />
            </div>
          )}

          <div className="form-field">
            <label htmlFor="new-password">Nueva contraseña</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              disabled={isLoading}
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div className="form-field">
            <label htmlFor="confirm-password">Confirmar nueva contraseña</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              disabled={isLoading}
            />
          </div>

          {displayError && (
            <div className="form-error">{displayError}</div>
          )}

          <div className="form-actions">
            {voluntary && onCancel && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !newPassword || !confirmPassword || (voluntary && !currentPassword)}
            >
              {isLoading ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
