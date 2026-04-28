/**
 * AdminPanel — Panel de administración Cobertec
 *
 * Gestión de usuarios y empresas. Solo visible para admins.
 * Dos tabs: Usuarios | Empresas
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  AdminUser,
  AdminCompany,
  CreateUserData,
  UpdateUserData,
  CreateCompanyData,
  UpdateCompanyData,
} from '../services/admin-api';
import {
  fetchUsers,
  fetchCompanies,
  createUser,
  updateUser,
  deactivateUser,
  createCompany,
  updateCompany,
  linkUserCompany,
  unlinkUserCompany,
  fetchRedmineProjects,
  type RedmineProject,
} from '../services/admin-api';

type Tab = 'users' | 'companies';
type Modal = null | 'create-user' | 'edit-user' | 'create-company' | 'edit-company' | 'assign-company';

export function AdminPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<AdminCompany | null>(null);
  const [redmineProjects, setRedmineProjects] = useState<RedmineProject[]>([]);
  const [syncingRedmine, setSyncingRedmine] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, c] = await Promise.all([fetchUsers(), fetchCompanies()]);
      setUsers(u);
      setCompanies(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── User actions ───────────────────────────────────

  const handleCreateUser = async (data: CreateUserData) => {
    try {
      await createUser(data);
      setModal(null);
      await loadData();
    } catch (err) {
      throw err;
    }
  };

  const handleUpdateUser = async (userId: string, data: UpdateUserData) => {
    try {
      await updateUser(userId, data);
      setModal(null);
      setSelectedUser(null);
      await loadData();
    } catch (err) {
      throw err;
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    if (!confirm('¿Desactivar este usuario?')) return;
    try {
      await deactivateUser(userId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desactivando usuario');
    }
  };

  const handleActivateUser = async (userId: string) => {
    try {
      await updateUser(userId, { active: true });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error activando usuario');
    }
  };

  const handleLinkCompany = async (userId: string, companyId: string) => {
    try {
      await linkUserCompany(userId, companyId);
      setModal(null);
      setSelectedUser(null);
      await loadData();
    } catch (err) {
      throw err;
    }
  };

  const handleUnlinkCompany = async (userId: string, companyId: string) => {
    if (!confirm('¿Desasignar esta empresa del usuario?')) return;
    try {
      await unlinkUserCompany(userId, companyId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desasignando empresa');
    }
  };

  const handleSyncRedmine = async (refresh = true) => {
    setSyncingRedmine(true);
    try {
      const projects = await fetchRedmineProjects(refresh);
      setRedmineProjects(projects);
    } catch {
      setError('Error al sincronizar proyectos Redmine');
    } finally {
      setSyncingRedmine(false);
    }
  };

  // ─── Company actions ────────────────────────────────

  const handleCreateCompany = async (data: CreateCompanyData) => {
    try {
      await createCompany(data);
      setModal(null);
      await loadData();
    } catch (err) {
      throw err;
    }
  };

  const handleUpdateCompany = async (companyId: string, data: UpdateCompanyData) => {
    try {
      await updateCompany(companyId, data);
      setModal(null);
      setSelectedCompany(null);
      await loadData();
    } catch (err) {
      throw err;
    }
  };

  // ─── Render ─────────────────────────────────────────

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>Panel de Administración</h2>
        <button className="btn btn-secondary" onClick={onBack}>
          ← Volver
        </button>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >
          Usuarios ({users.length})
        </button>
        <button
          className={`admin-tab ${tab === 'companies' ? 'active' : ''}`}
          onClick={() => setTab('companies')}
        >
          Empresas ({companies.length})
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <div className="admin-loading">Cargando...</div>
      ) : tab === 'users' ? (
        <UsersTab
          users={users}
          onCreateClick={() => setModal('create-user')}
          onEditClick={(u) => { setSelectedUser(u); setModal('edit-user'); }}
          onDeactivate={handleDeactivateUser}
          onActivate={handleActivateUser}
          onAssignClick={(u) => { setSelectedUser(u); setModal('assign-company'); }}
          onUnlink={handleUnlinkCompany}
        />
      ) : (
        <CompaniesTab
          companies={companies}
          redmineProjects={redmineProjects}
          syncingRedmine={syncingRedmine}
          onSyncRedmine={() => handleSyncRedmine(true)}
          onCreateClick={() => setModal('create-company')}
          onEditClick={(c) => { setSelectedCompany(c); setModal('edit-company'); }}
        />
      )}

      {/* Modals */}
      {modal === 'create-user' && (
        <UserFormModal
          title="Nuevo Usuario"
          companies={companies}
          onSubmit={handleCreateUser}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'edit-user' && selectedUser && (
        <UserFormModal
          title="Editar Usuario"
          user={selectedUser}
          companies={companies}
          onSubmit={(data) => handleUpdateUser(selectedUser.user_id, data)}
          onClose={() => { setModal(null); setSelectedUser(null); }}
        />
      )}

      {modal === 'assign-company' && selectedUser && (
        <AssignCompanyModal
          user={selectedUser}
          companies={companies}
          onAssign={(companyId) => handleLinkCompany(selectedUser.user_id, companyId)}
          onClose={() => { setModal(null); setSelectedUser(null); }}
        />
      )}

      {modal === 'create-company' && (
        <CompanyFormModal
          title="Nueva Empresa"
          redmineProjects={redmineProjects}
          onSubmit={handleCreateCompany}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'edit-company' && selectedCompany && (
        <CompanyFormModal
          title="Editar Empresa"
          company={selectedCompany}
          redmineProjects={redmineProjects}
          onSubmit={(data) => handleUpdateCompany(selectedCompany.id, data)}
          onClose={() => { setModal(null); setSelectedCompany(null); }}
        />
      )}
    </div>
  );
}

// ─── Users Tab ──────────────────────────────────────────

function UsersTab({
  users,
  onCreateClick,
  onEditClick,
  onDeactivate,
  onActivate,
  onAssignClick,
  onUnlink,
}: {
  users: AdminUser[];
  onCreateClick: () => void;
  onEditClick: (u: AdminUser) => void;
  onDeactivate: (id: string) => void;
  onActivate: (id: string) => void;
  onAssignClick: (u: AdminUser) => void;
  onUnlink: (userId: string, companyId: string) => void;
}) {
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <button className="btn btn-primary" onClick={onCreateClick}>
          + Nuevo usuario
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Empresas</th>
            <th>Estado</th>
            <th>Último acceso</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id} className={!u.active ? 'row-inactive' : ''}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>
                {u.companies.length === 0 ? (
                  <span className="text-muted">Sin empresa</span>
                ) : (
                  <div className="company-tags">
                    {u.companies.map((c) => (
                      <span key={c.id} className={`company-tag ${c.role === 'admin' ? 'tag-admin' : ''}`}>
                        {c.name}
                        {c.role === 'admin' && ' (admin)'}
                        <button
                          className="tag-remove"
                          onClick={() => onUnlink(u.user_id, c.id)}
                          title="Desasignar"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td>
                <span className={`status-badge ${u.active ? 'badge-active' : 'badge-inactive'}`}>
                  {u.active ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="text-muted">
                {u.last_login
                  ? new Date(u.last_login).toLocaleDateString('es-ES')
                  : 'Nunca'}
              </td>
              <td>
                <div className="action-buttons">
                  <button className="btn-small" onClick={() => onEditClick(u)}>Editar</button>
                  <button className="btn-small" onClick={() => onAssignClick(u)}>+ Empresa</button>
                  {u.active ? (
                    <button className="btn-small btn-danger" onClick={() => onDeactivate(u.user_id)}>Desactivar</button>
                  ) : (
                    <button className="btn-small btn-success" onClick={() => onActivate(u.user_id)}>Activar</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Companies Tab ──────────────────────────────────────

function CompaniesTab({
  companies,
  redmineProjects,
  syncingRedmine,
  onSyncRedmine,
  onCreateClick,
  onEditClick,
}: {
  companies: AdminCompany[];
  redmineProjects: RedmineProject[];
  syncingRedmine: boolean;
  onSyncRedmine: () => void;
  onCreateClick: () => void;
  onEditClick: (c: AdminCompany) => void;
}) {
  return (
    <div className="admin-section">
      <div className="admin-section-header" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={onCreateClick}>
          + Nueva empresa
        </button>
        <button
          className="btn btn-secondary"
          onClick={onSyncRedmine}
          disabled={syncingRedmine}
          title="Carga los proyectos de Redmine para asignarlos en el formulario de empresa"
        >
          {syncingRedmine ? 'Sincronizando...' : '⟳ Sincronizar proyectos Redmine'}
        </button>
        {redmineProjects.length > 0 && (
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
            {redmineProjects.length} proyectos cargados
          </span>
        )}
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Proyecto Redmine</th>
            <th>Usuarios</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c.id} className={!c.active ? 'row-inactive' : ''}>
              <td>{c.name}</td>
              <td className="text-muted">{c.redmine_project_id ?? '—'}</td>
              <td>{c.user_count}</td>
              <td>
                <span className={`status-badge ${c.active ? 'badge-active' : 'badge-inactive'}`}>
                  {c.active ? 'Activa' : 'Inactiva'}
                </span>
              </td>
              <td>
                <button className="btn-small" onClick={() => onEditClick(c)}>Editar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── User Form Modal ────────────────────────────────────

function UserFormModal({
  title,
  user,
  companies,
  onSubmit,
  onClose,
}: {
  title: string;
  user?: AdminUser;
  companies: AdminCompany[];
  onSubmit: (data: CreateUserData & UpdateUserData) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [password, setPassword] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(
    user?.companies.map((c) => c.id) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = !!user;

  const handleSubmit = async () => {
    setFormError(null);
    if (!name.trim()) { setFormError('Nombre requerido'); return; }
    if (!email.trim()) { setFormError('Email requerido'); return; }
    if (!isEdit && !password) { setFormError('Contraseña requerida'); return; }
    if (!isEdit && password.length < 6) { setFormError('Mínimo 6 caracteres'); return; }

    setSaving(true);
    try {
      const data: CreateUserData & UpdateUserData = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
      };
      if (password) data.password = password;
      if (!isEdit) data.company_ids = selectedCompanies;
      await onSubmit(data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <div className="form-field">
          <label>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="form-field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="form-field">
          <label>Teléfono</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Opcional" />
        </div>

        <div className="form-field">
          <label>{isEdit ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEdit ? '••••••••' : 'Mínimo 6 caracteres'}
          />
        </div>

        {!isEdit && (
          <div className="form-field">
            <label>Empresas</label>
            <div className="checkbox-list">
              {companies.filter((c) => c.active).map((c) => (
                <label key={c.id} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={selectedCompanies.includes(c.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCompanies([...selectedCompanies, c.id]);
                      } else {
                        setSelectedCompanies(selectedCompanies.filter((id) => id !== c.id));
                      }
                    }}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {formError && <div className="login-error">{formError}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Assign Company Modal ───────────────────────────────

function AssignCompanyModal({
  user,
  companies,
  onAssign,
  onClose,
}: {
  user: AdminUser;
  companies: AdminCompany[];
  onAssign: (companyId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const assignedIds = new Set(user.companies.map((c) => c.id));
  const available = companies.filter((c) => c.active && !assignedIds.has(c.id));

  const handleAssign = async (companyId: string) => {
    setSaving(true);
    try {
      await onAssign(companyId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Asignar empresa a {user.name}</h3>

        {available.length === 0 ? (
          <p className="text-muted">El usuario ya está en todas las empresas activas.</p>
        ) : (
          <div className="assign-list">
            {available.map((c) => (
              <div key={c.id} className="assign-item">
                <span>{c.name}</span>
                <button
                  className="btn-small btn-primary"
                  onClick={() => handleAssign(c.id)}
                  disabled={saving}
                >
                  Asignar
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Company Form Modal ─────────────────────────────────

function CompanyFormModal({
  title,
  company,
  redmineProjects,
  onSubmit,
  onClose,
}: {
  title: string;
  company?: AdminCompany;
  redmineProjects: RedmineProject[];
  onSubmit: (data: CreateCompanyData & UpdateCompanyData) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(company?.name ?? '');
  const [redmineId, setRedmineId] = useState(company?.redmine_project_id ?? '');
  const [active, setActive] = useState(company?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = !!company;

  const handleSubmit = async () => {
    setFormError(null);
    if (!name.trim()) { setFormError('Nombre requerido'); return; }

    setSaving(true);
    try {
      const data: CreateCompanyData & UpdateCompanyData = {
        name: name.trim(),
        redmine_project_id: redmineId.trim() || null,
      };
      if (isEdit) data.active = active;
      await onSubmit(data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <div className="form-field">
          <label>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="form-field">
          <label>Proyecto Redmine</label>
          {redmineProjects.length > 0 ? (
            <select
              value={redmineId}
              onChange={(e) => setRedmineId(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">Sin vincular</option>
              {redmineProjects.map((p) => (
                <option key={p.identifier} value={p.identifier}>
                  {p.name} ({p.identifier})
                </option>
              ))}
            </select>
          ) : (
            <input
              value={redmineId}
              onChange={(e) => setRedmineId(e.target.value)}
              placeholder="Identificador del proyecto (ej: cobertec-sat). Pulsa 'Sincronizar' para usar selector."
            />
          )}
        </div>

        {isEdit && (
          <div className="form-field">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Empresa activa
            </label>
          </div>
        )}

        {formError && <div className="login-error">{formError}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
