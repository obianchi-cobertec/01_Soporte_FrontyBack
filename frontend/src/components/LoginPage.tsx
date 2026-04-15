import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim()) {
      setLocalError('Introduce tu email');
      return;
    }
    if (!password) {
      setLocalError('Introduce tu contraseña');
      return;
    }

    try {
      await login(email.trim(), password);
    } catch {
      // El error ya se gestiona en AuthContext (error state)
    }
  };

  const displayError = localError || error;

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Acceso a Soporte</h2>
        <p className="login-subtitle">Introduce tus credenciales para continuar</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.es"
              autoComplete="email"
              autoFocus
              disabled={isLoading}
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>

          {displayError && (
            <div className="login-error">{displayError}</div>
          )}

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={isLoading}
          >
            {isLoading ? 'Accediendo...' : 'Entrar'}
          </button>
        </form>

        <p className="login-help">
          ¿No tienes cuenta? Contacta con Cobertec.
        </p>
      </div>
    </div>
  );
}
