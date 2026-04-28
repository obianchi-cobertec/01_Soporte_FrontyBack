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

export function ChangePasswordPage({ voluntary = false, onCancel }: Props) {
  const { changePassword, isLoading, error } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
              <div className="password-wrapper">
                <input
                  id="current-password"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  tabIndex={-1}
                  aria-label={showCurrent ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowCurrent(v => !v)}
                >
                  {showCurrent ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
          )}

          <div className="form-field">
            <label htmlFor="new-password">Nueva contraseña</label>
            <div className="password-wrapper">
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={isLoading}
                placeholder="Mínimo 8 caracteres"
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
            <label htmlFor="confirm-password">Confirmar nueva contraseña</label>
            <div className="password-wrapper">
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={isLoading}
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
