/**
 * Admin API client — CRUD de usuarios y empresas
 *
 * Solo accesible para usuarios con rol admin.
 * Usa authenticatedFetch (auto-refresh en 401).
 */

import { authenticatedFetch } from './auth-api.js';

// ─── Types ──────────────────────────────────────────────

export interface AdminUser {
  user_id: string;
  contact_id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  last_login: string | null;
  created_at: string;
  companies: { id: string; name: string; role: string }[];
}

export interface AdminCompany {
  id: string;
  name: string;
  redmine_project_id: string | null;
  active: boolean;
  created_at: string;
  user_count: number;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  company_ids?: string[];
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  phone?: string | null;
  active?: boolean;
  password?: string;
}

export interface CreateCompanyData {
  name: string;
  redmine_project_id?: string | null;
}

export interface UpdateCompanyData {
  name?: string;
  redmine_project_id?: string | null;
  active?: boolean;
}

// ─── Users ──────────────────────────────────────────────

export async function fetchUsers(): Promise<AdminUser[]> {
  const res = await authenticatedFetch<{ users: AdminUser[] }>('/admin/users');
  return res.users;
}

export async function createUser(data: CreateUserData): Promise<AdminUser> {
  return authenticatedFetch<AdminUser>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(userId: string, data: UpdateUserData): Promise<void> {
  await authenticatedFetch<{ ok: boolean }>(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deactivateUser(userId: string): Promise<void> {
  await authenticatedFetch<{ ok: boolean }>(`/admin/users/${userId}`, {
    method: 'DELETE',
  });
}

export async function linkUserCompany(
  userId: string,
  companyId: string,
  role: 'user' | 'admin' = 'user',
): Promise<void> {
  await authenticatedFetch<{ ok: boolean }>(`/admin/users/${userId}/companies`, {
    method: 'POST',
    body: JSON.stringify({ company_id: companyId, role }),
  });
}

export async function unlinkUserCompany(userId: string, companyId: string): Promise<void> {
  await authenticatedFetch<{ ok: boolean }>(`/admin/users/${userId}/companies/${companyId}`, {
    method: 'DELETE',
  });
}

// ─── Companies ──────────────────────────────────────────

export async function fetchCompanies(): Promise<AdminCompany[]> {
  const res = await authenticatedFetch<{ companies: AdminCompany[] }>('/admin/companies');
  return res.companies;
}

export async function createCompany(data: CreateCompanyData): Promise<AdminCompany> {
  return authenticatedFetch<AdminCompany>('/admin/companies', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCompany(companyId: string, data: UpdateCompanyData): Promise<void> {
  await authenticatedFetch<{ ok: boolean }>(`/admin/companies/${companyId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── Redmine projects ────────────────────────────────────

export interface RedmineProject {
  id: number;
  identifier: string;
  name: string;
}

export async function fetchRedmineProjects(refresh = false): Promise<RedmineProject[]> {
  const res = await authenticatedFetch<{ projects: RedmineProject[] }>(
    `/admin/redmine-projects${refresh ? '?refresh=true' : ''}`,
  );
  return res.projects;
}
