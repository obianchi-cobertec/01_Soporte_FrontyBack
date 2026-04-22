/**
 * Identity Store — SQLite persistence
 *
 * Gestión de Contact, User, Company y UserCompany.
 * Mismo patrón que EventStore: SQLite embebido con better-sqlite3.
 * La base se crea en data/identity.db (configurable por env).
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type {
  Contact,
  User,
  Company,
  UserCompany,
  CompanyDTO,
} from '../../identity-types.js';

const DB_PATH = process.env.IDENTITY_DB_PATH ?? 'data/identity.db';

// ─── Admin DTOs ─────────────────────────────────────────

export interface AdminUserRow {
  user_id: string;
  contact_id: string;
  name: string;
  email: string;
  phone: string | null;
  active: number;
  last_login: string | null;
  created_at: string;
  companies: string; // JSON array of { id, name, role }
}

export interface AdminCompanyRow {
  id: string;
  name: string;
  redmine_project_id: string | null;
  active: number;
  created_at: string;
  user_count: number;
}

export class IdentityStore {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  // ─── Schema ─────────────────────────────────────────────

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
        phone       TEXT,
        whatsapp    TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id              TEXT PRIMARY KEY,
        contact_id      TEXT NOT NULL UNIQUE REFERENCES contacts(id),
        password_hash   TEXT NOT NULL,
        active          INTEGER NOT NULL DEFAULT 1,
        is_superadmin   INTEGER NOT NULL DEFAULT 0,
        last_login      TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS companies (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        redmine_project_id  TEXT,
        active              INTEGER NOT NULL DEFAULT 1,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS user_companies (
        user_id     TEXT NOT NULL REFERENCES users(id),
        company_id  TEXT NOT NULL REFERENCES companies(id),
        role        TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, company_id)
      );

      CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
      CREATE INDEX IF NOT EXISTS idx_users_contact ON users(contact_id);
      CREATE INDEX IF NOT EXISTS idx_uc_user ON user_companies(user_id);
      CREATE INDEX IF NOT EXISTS idx_uc_company ON user_companies(company_id);

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_hash  TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id),
        expires_at  TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);
    `);

    // Migraciones no destructivas
    try {
      this.db.exec(`ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0`);
    } catch { /* ya existe */ }
    try {
      this.db.exec(`ALTER TABLE users ADD COLUMN redmine_login TEXT`);
    } catch { /* ya existe */ }
  }

  // ─── Contact ────────────────────────────────────────────

  createContact(data: {
    name: string;
    email: string;
    phone?: string | null;
    whatsapp?: string | null;
  }): Contact {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO contacts (id, name, email, phone, whatsapp, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.email, data.phone ?? null, data.whatsapp ?? null, now, now);
    return this.getContactById(id)!;
  }

  getContactById(id: string): Contact | null {
    return this.db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Contact | null;
  }

  getContactByEmail(email: string): Contact | null {
    return this.db.prepare('SELECT * FROM contacts WHERE email = ? COLLATE NOCASE').get(email) as Contact | null;
  }

  updateContact(id: string, data: {
    name?: string;
    email?: string;
    phone?: string | null;
  }): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
    if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone); }

    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE contacts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  // ─── User ──────────────────────────────────────────────

  createUser(data: {
    contact_id: string;
    password_hash: string;
    is_superadmin?: boolean;
  }): User {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO users (id, contact_id, password_hash, active, is_superadmin, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?)
    `).run(id, data.contact_id, data.password_hash, data.is_superadmin ? 1 : 0, now, now);
    return this.getUserById(id)!;
  }

  getUserById(id: string): User | null {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | null;
  }

  getUserByContactId(contactId: string): User | null {
    return this.db.prepare('SELECT * FROM users WHERE contact_id = ?').get(contactId) as User | null;
  }

  getUserByEmail(email: string): (User & { contact_name: string; contact_email: string }) | null {
    return this.db.prepare(`
      SELECT u.*, c.name as contact_name, c.email as contact_email
      FROM users u
      JOIN contacts c ON u.contact_id = c.id
      WHERE c.email = ? COLLATE NOCASE
    `).get(email) as (User & { contact_name: string; contact_email: string }) | null;
  }

  getRedmineLogin(userId: string): string | null {
    const row = this.db.prepare(`SELECT redmine_login FROM users WHERE id = ?`).get(userId) as { redmine_login: string | null } | undefined;
    return row?.redmine_login ?? null;
  }

  updateLastLogin(userId: string): void {
    this.db.prepare(`
      UPDATE users SET last_login = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(userId);
  }

  updateUserActive(userId: string, active: boolean): void {
    this.db.prepare(`
      UPDATE users SET active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(active ? 1 : 0, userId);
  }

  updateUserPassword(userId: string, passwordHash: string): void {
    this.db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(passwordHash, userId);
  }

  isSuperAdmin(userId: string): boolean {
    const row = this.db.prepare(`
      SELECT is_superadmin FROM users WHERE id = ?
    `).get(userId) as { is_superadmin: number } | undefined;
    return row?.is_superadmin === 1;
  }

  // ─── Company ───────────────────────────────────────────

  createCompany(data: {
    name: string;
    redmine_project_id?: string | null;
  }): Company {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO companies (id, name, redmine_project_id, active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(id, data.name, data.redmine_project_id ?? null, now, now);
    return this.getCompanyById(id)!;
  }

  getCompanyById(id: string): Company | null {
    return this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company | null;
  }

  updateCompany(id: string, data: {
    name?: string;
    redmine_project_id?: string | null;
    active?: boolean;
  }): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.redmine_project_id !== undefined) { fields.push('redmine_project_id = ?'); values.push(data.redmine_project_id); }
    if (data.active !== undefined) { fields.push('active = ?'); values.push(data.active ? 1 : 0); }

    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  // ─── UserCompany ──────────────────────────────────────

  linkUserCompany(userId: string, companyId: string, role: 'user' | 'admin' = 'user'): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO user_companies (user_id, company_id, role, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(userId, companyId, role);
  }

  unlinkUserCompany(userId: string, companyId: string): void {
    this.db.prepare(`
      DELETE FROM user_companies WHERE user_id = ? AND company_id = ?
    `).run(userId, companyId);
  }

  getCompaniesForUser(userId: string): CompanyDTO[] {
    // El superadmin ve todas las empresas activas
    if (this.isSuperAdmin(userId)) {
      return this.db.prepare(`
        SELECT id, name FROM companies WHERE active = 1 ORDER BY name
      `).all() as CompanyDTO[];
    }
    return this.db.prepare(`
      SELECT c.id, c.name
      FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = ? AND c.active = 1
      ORDER BY c.name
    `).all(userId) as CompanyDTO[];
  }

  isUserInCompany(userId: string, companyId: string): boolean {
    if (this.isSuperAdmin(userId)) return true;
    const row = this.db.prepare(`
      SELECT 1 FROM user_companies
      WHERE user_id = ? AND company_id = ?
    `).get(userId, companyId);
    return row != null;
  }

  getUserCompanyRole(userId: string, companyId: string): string | null {
    if (this.isSuperAdmin(userId)) return 'admin';
    const row = this.db.prepare(`
      SELECT role FROM user_companies
      WHERE user_id = ? AND company_id = ?
    `).get(userId, companyId) as { role: string } | undefined;
    return row?.role ?? null;
  }

  isAdmin(userId: string): boolean {
    if (this.isSuperAdmin(userId)) return true;
    const row = this.db.prepare(`
      SELECT 1 FROM user_companies
      WHERE user_id = ? AND role = 'admin'
      LIMIT 1
    `).get(userId);
    return row != null;
  }

  // ─── Admin queries ────────────────────────────────────

  listUsers(): AdminUserRow[] {
    const rows = this.db.prepare(`
      SELECT
        u.id as user_id,
        u.contact_id,
        c.name,
        c.email,
        c.phone,
        u.active,
        u.last_login,
        u.created_at
      FROM users u
      JOIN contacts c ON u.contact_id = c.id
      ORDER BY c.name
    `).all() as Omit<AdminUserRow, 'companies'>[];

    return rows.map((row) => {
      const companies = this.db.prepare(`
        SELECT co.id, co.name, uc.role
        FROM user_companies uc
        JOIN companies co ON uc.company_id = co.id
        WHERE uc.user_id = ?
      `).all(row.user_id) as { id: string; name: string; role: string }[];

      return { ...row, companies: JSON.stringify(companies) };
    });
  }

  listCompanies(): AdminCompanyRow[] {
    return this.db.prepare(`
      SELECT
        co.id,
        co.name,
        co.redmine_project_id,
        co.active,
        co.created_at,
        COUNT(uc.user_id) as user_count
      FROM companies co
      LEFT JOIN user_companies uc ON co.id = uc.company_id
      GROUP BY co.id
      ORDER BY co.name
    `).all() as AdminCompanyRow[];
  }

  // ─── Refresh tokens ───────────────────────────────────

  storeRefreshToken(tokenHash: string, userId: string, expiresAt: string): void {
    this.db.prepare(`
      INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(tokenHash, userId, expiresAt);
  }

  getRefreshToken(tokenHash: string): { token_hash: string; user_id: string; expires_at: string } | null {
    return this.db.prepare(
      'SELECT * FROM refresh_tokens WHERE token_hash = ?'
    ).get(tokenHash) as { token_hash: string; user_id: string; expires_at: string } | null;
  }

  deleteRefreshToken(tokenHash: string): void {
    this.db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(tokenHash);
  }

  deleteRefreshTokensForUser(userId: string): void {
    this.db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
  }

  pruneExpiredTokens(): void {
    this.db.prepare("DELETE FROM refresh_tokens WHERE expires_at < datetime('now')").run();
  }

  // ─── Lifecycle ────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}

// ─── Singleton ──────────────────────────────────────────

let instance: IdentityStore | null = null;

export function getIdentityStore(): IdentityStore {
  if (!instance) {
    instance = new IdentityStore();
  }
  return instance;
}
