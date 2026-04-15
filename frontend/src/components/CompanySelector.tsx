import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function CompanySelector() {
  const { authState, selectCompany, logout, isLoading, error } = useAuth();
  const [selecting, setSelecting] = useState<string | null>(null);

  const companies = authState.user?.companies ?? [];
  const userName = authState.user?.contact?.name ?? 'Usuario';

  const handleSelect = async (companyId: string) => {
    setSelecting(companyId);
    try {
      await selectCompany(companyId);
    } catch {
      setSelecting(null);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Selecciona empresa</h2>
        <p className="login-subtitle">
          Hola, {userName}. ¿Con qué empresa quieres acceder?
        </p>

        <div className="company-list">
          {companies.map((company) => (
            <button
              key={company.id}
              className="company-btn"
              onClick={() => handleSelect(company.id)}
              disabled={isLoading || selecting !== null}
            >
              {selecting === company.id ? 'Accediendo...' : company.name}
            </button>
          ))}
        </div>

        {error && (
          <div className="login-error">{error}</div>
        )}

        <button
          className="nav-link company-logout"
          onClick={logout}
          disabled={isLoading}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
