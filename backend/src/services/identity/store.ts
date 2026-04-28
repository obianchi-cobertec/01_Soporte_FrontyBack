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
  UserRequest,
  UserRequestStatus,
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

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash  TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id),
        expires_at  TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);

      CREATE TABLE IF NOT EXISTS user_requests (
        id                     TEXT PRIMARY KEY,
        first_name             TEXT NOT NULL,
        last_name              TEXT NOT NULL,
        email                  TEXT NOT NULL COLLATE NOCASE,
        company_id             TEXT REFERENCES companies(id),
        company_name_requested TEXT NOT NULL DEFAULT '',
        phone                  TEXT NOT NULL DEFAULT '',
        status                 TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        rejection_reason       TEXT,
        redmine_user_id        INTEGER,
        created_at             TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ur_status ON user_requests(status);
      CREATE INDEX IF NOT EXISTS idx_ur_email ON user_requests(email);
    `);

    // Migraciones no destructivas
    const existingCols = (this.db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(c => c.name);

    if (!existingCols.includes('is_superadmin')) {
      this.db.exec(`ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0`);
    }
    if (!existingCols.includes('redmine_login')) {
      this.db.exec(`ALTER TABLE users ADD COLUMN redmine_login TEXT`);
    }
    if (!existingCols.includes('redmine_user_id')) {
      this.db.exec(`ALTER TABLE users ADD COLUMN redmine_user_id INTEGER`);
    }
    if (!existingCols.includes('must_change_password')) {
      this.db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`);
    }

    // Migración user_requests: añadir company_name_requested + hacer company_id nullable
    const urCols = (this.db.prepare('PRAGMA table_info(user_requests)').all() as { name: string }[]).map(c => c.name);
    if (urCols.length > 0 && !urCols.includes('company_name_requested')) {
      this.db.exec(`
        ALTER TABLE user_requests RENAME TO _user_requests_bak;

        CREATE TABLE user_requests (
          id                     TEXT PRIMARY KEY,
          first_name             TEXT NOT NULL,
          last_name              TEXT NOT NULL,
          email                  TEXT NOT NULL COLLATE NOCASE,
          company_id             TEXT REFERENCES companies(id),
          company_name_requested TEXT NOT NULL DEFAULT '',
          phone                  TEXT NOT NULL DEFAULT '',
          status                 TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
          rejection_reason       TEXT,
          redmine_user_id        INTEGER,
          created_at             TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO user_requests (id, first_name, last_name, email, company_id, company_name_requested, phone, status, rejection_reason, redmine_user_id, created_at, updated_at)
        SELECT id, first_name, last_name, email, company_id, '', COALESCE(phone,''), status, rejection_reason, redmine_user_id, created_at, updated_at
        FROM _user_requests_bak;

        DROP TABLE _user_requests_bak;

        CREATE INDEX IF NOT EXISTS idx_ur_status ON user_requests(status);
        CREATE INDEX IF NOT EXISTS idx_ur_email ON user_requests(email);
      `);
    }
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
    must_change_password?: boolean;
    redmine_login?: string | null;
    redmine_user_id?: number | null;
  }): User {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO users (id, contact_id, password_hash, active, is_superadmin, must_change_password, redmine_login, redmine_user_id, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.contact_id,
      data.password_hash,
      data.is_superadmin ? 1 : 0,
      data.must_change_password ? 1 : 0,
      data.redmine_login ?? null,
      data.redmine_user_id ?? null,
      now,
      now,
    );
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

  getUserByRedmineLogin(login: string): (User & { contact_name: string; contact_email: string }) | null {
    return this.db.prepare(`
      SELECT u.*, c.name as contact_name, c.email as contact_email
      FROM users u
      JOIN contacts c ON u.contact_id = c.id
      WHERE u.redmine_login = ? COLLATE NOCASE
    `).get(login) as (User & { contact_name: string; contact_email: string }) | null;
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

  getMustChangePassword(userId: string): boolean {
    const row = this.db.prepare(`SELECT must_change_password FROM users WHERE id = ?`).get(userId) as { must_change_password: number } | undefined;
    return row?.must_change_password === 1;
  }

  setMustChangePassword(userId: string, value: boolean): void {
    this.db.prepare(`
      UPDATE users SET must_change_password = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(value ? 1 : 0, userId);
  }

  setRedmineUserId(userId: string, redmineUserId: number): void {
    this.db.prepare(`
      UPDATE users SET redmine_user_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(redmineUserId, userId);
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

  listActiveCompanies(): Pick<Company, 'id' | 'name'>[] {
    return this.db.prepare(`
      SELECT id, name FROM companies WHERE active = 1 ORDER BY name
    `).all() as Pick<Company, 'id' | 'name'>[];
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

  // ─── User requests ────────────────────────────────────

  createUserRequest(data: {
    first_name: string;
    last_name: string;
    email: string;
    company_name_requested: string;
    phone: string;
  }): UserRequest {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO user_requests (id, first_name, last_name, email, company_id, company_name_requested, phone, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, 'pending', ?, ?)
    `).run(id, data.first_name, data.last_name, data.email, data.company_name_requested, data.phone, now, now);
    return this.getUserRequestById(id)!;
  }

  getUserRequestById(id: string): UserRequest | null {
    return this.db.prepare('SELECT * FROM user_requests WHERE id = ?').get(id) as UserRequest | null;
  }

  updateUserRequest(id: string, data: {
    first_name?: string;
    last_name?: string;
    email?: string;
    company_id?: string | null;
    company_name_requested?: string;
    phone?: string | null;
  }): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.first_name !== undefined) { fields.push('first_name = ?'); values.push(data.first_name); }
    if (data.last_name !== undefined) { fields.push('last_name = ?'); values.push(data.last_name); }
    if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
    if (data.company_id !== undefined) { fields.push('company_id = ?'); values.push(data.company_id); }
    if (data.company_name_requested !== undefined) { fields.push('company_name_requested = ?'); values.push(data.company_name_requested); }
    if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone); }

    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(
      `UPDATE user_requests SET ${fields.join(', ')} WHERE id = ? AND status = 'pending'`
    ).run(...values);
  }

  listUserRequests(status?: UserRequestStatus): (UserRequest & { company_name: string | null })[] {
    if (status) {
      return this.db.prepare(`
        SELECT ur.*, co.name as company_name
        FROM user_requests ur
        LEFT JOIN companies co ON ur.company_id = co.id
        WHERE ur.status = ?
        ORDER BY ur.created_at DESC
      `).all(status) as (UserRequest & { company_name: string | null })[];
    }
    return this.db.prepare(`
      SELECT ur.*, co.name as company_name
      FROM user_requests ur
      LEFT JOIN companies co ON ur.company_id = co.id
      ORDER BY ur.created_at DESC
    `).all() as (UserRequest & { company_name: string | null })[];
  }

  approveUserRequest(id: string, redmineUserId: number): void {
    this.db.prepare(`
      UPDATE user_requests
      SET status = 'approved', redmine_user_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(redmineUserId, id);
  }

  rejectUserRequest(id: string, reason: string): void {
    this.db.prepare(`
      UPDATE user_requests
      SET status = 'rejected', rejection_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(reason, id);
  }

  /**
   * Genera un login único para Redmine siguiendo el patrón:
   * nombre_empresa → nombrea_empresa → nombreap_empresa → nombre2_empresa → ...
   *
   * Busca colisiones en users.redmine_login (usuarios ya creados).
   */
  generateRedmineLogin(firstName: string, lastName: string, companySlug: string): string {
    const normalize = (s: string) =>
      s.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // elimina tildes
        .replace(/[^a-z0-9]/g, '');       // solo alfanumérico

    const fn = normalize(firstName);
    const ln = normalize(lastName);
    const co = normalize(companySlug).replace(/[^a-z0-9_]/g, '_');

    const candidates = [
      `${fn}_${co}`,
      `${fn}${ln.charAt(0)}_${co}`,
      `${fn}${ln.substring(0, 2)}_${co}`,
    ];

    for (const candidate of candidates) {
      const existing = this.db.prepare(
        `SELECT 1 FROM users WHERE redmine_login = ? COLLATE NOCASE`
      ).get(candidate);
      if (!existing) return candidate;
    }

    // Fallback numérico: nombre2_empresa, nombre3_empresa, ...
    let n = 2;
    while (true) {
      const candidate = `${fn}${n}_${co}`;
      const existing = this.db.prepare(
        `SELECT 1 FROM users WHERE redmine_login = ? COLLATE NOCASE`
      ).get(candidate);
      if (!existing) return candidate;
      n++;
    }
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
    this.db.prepare("DELETE FROM password_reset_tokens WHERE expires_at < datetime('now')").run();
  }

  // ─── Password reset tokens ────────────────────────────

  storePasswordResetToken(tokenHash: string, userId: string, expiresAt: string): void {
    this.db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
    this.db.prepare(`
      INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(tokenHash, userId, expiresAt);
  }

  getPasswordResetToken(tokenHash: string): { token_hash: string; user_id: string; expires_at: string } | null {
    return this.db.prepare(
      'SELECT * FROM password_reset_tokens WHERE token_hash = ?',
    ).get(tokenHash) as { token_hash: string; user_id: string; expires_at: string } | null;
  }

  deletePasswordResetToken(tokenHash: string): void {
    this.db.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash);
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
