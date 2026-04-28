/**
 * Importar usuarios internos de Cobertec desde Redmine a identity.db
 *
 * Pagina GET /users.json, filtra por email @cobertec.com y:
 *   - Si el usuario NO existe en identity.db → crea contacto + user con
 *     is_superadmin=1, must_change_password=1, contraseña Cobertec2024!,
 *     redmine_login y redmine_user_id.
 *   - Si el usuario YA existe → actualiza redmine_login, redmine_user_id e
 *     is_superadmin=1 sin tocar la contraseña.
 *
 * Ejecutar desde backend/:
 *   npx tsx scripts/import-cobertec-users.ts
 *
 * Variables de entorno requeridas (.env):
 *   REDMINE_URL=https://incidencias.cobertec.com/sgi
 *   REDMINE_API_KEY=<api_key>
 *   IDENTITY_DB_PATH=data/identity.db   (opcional, ese es el default)
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { config } from 'dotenv';

config(); // carga .env desde el directorio actual

// ── Configuración ─────────────────────────────────────────────────────────────

const REDMINE_URL = process.env.REDMINE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const DB_PATH = process.env.IDENTITY_DB_PATH ?? 'data/identity.db';
const DEFAULT_PASSWORD = 'Cobertec2024!';
const BCRYPT_ROUNDS = 12;
const PAGE_LIMIT = 100;            // Redmine soporta hasta 100 por página
const COBERTEC_DOMAIN = '@cobertec.com';

if (!REDMINE_URL || !REDMINE_API_KEY) {
  console.error('✗ Error: REDMINE_URL y REDMINE_API_KEY son obligatorios en .env');
  process.exit(1);
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface RedmineUser {
  id: number;
  login: string;
  firstname: string;
  lastname: string;
  mail: string;
}

interface RedmineUsersResponse {
  users: RedmineUser[];
  total_count: number;
  offset: number;
  limit: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchRedmineUsersPage(offset: number): Promise<RedmineUsersResponse> {
  const url = `${REDMINE_URL}/users.json?limit=${PAGE_LIMIT}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { 'X-Redmine-API-Key': REDMINE_API_KEY! },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al consultar Redmine users (offset=${offset})`);
  }

  return res.json() as Promise<RedmineUsersResponse>;
}

async function fetchAllCobertecUsers(): Promise<RedmineUser[]> {
  const cobertecUsers: RedmineUser[] = [];
  let offset = 0;
  let totalCount = Infinity;

  console.log('Descargando usuarios de Redmine...');

  while (offset < totalCount) {
    const page = await fetchRedmineUsersPage(offset);
    totalCount = page.total_count;

    const filtered = page.users.filter(u =>
      u.mail?.toLowerCase().endsWith(COBERTEC_DOMAIN)
    );
    cobertecUsers.push(...filtered);

    const fetched = offset + page.users.length;
    process.stdout.write(`\r  Procesados ${fetched}/${totalCount} usuarios (${cobertecUsers.length} Cobertec encontrados)`);

    offset += page.users.length;

    // Si la página vino vacía o incompleta, salir para evitar loop infinito
    if (page.users.length === 0) break;
  }

  console.log(); // nueva línea tras el \r
  return cobertecUsers;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const db = new Database(path.resolve(DB_PATH));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Asegurar que las columnas necesarias existen (migraciones no destructivas)
const existingCols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map(c => c.name);

if (!existingCols.includes('redmine_login')) {
  db.exec('ALTER TABLE users ADD COLUMN redmine_login TEXT');
  console.log('✓ Columna redmine_login añadida');
}
if (!existingCols.includes('redmine_user_id')) {
  db.exec('ALTER TABLE users ADD COLUMN redmine_user_id INTEGER');
  console.log('✓ Columna redmine_user_id añadida');
}
if (!existingCols.includes('must_change_password')) {
  db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  console.log('✓ Columna must_change_password añadida');
}
if (!existingCols.includes('is_superadmin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0');
  console.log('✓ Columna is_superadmin añadida');
}

// Sentencias preparadas
const findContactByEmail = db.prepare('SELECT id, name FROM contacts WHERE email = ? COLLATE NOCASE');
const findUserByContactId = db.prepare('SELECT id FROM users WHERE contact_id = ?');
const insertContact = db.prepare(`
  INSERT INTO contacts (id, name, email, created_at, updated_at)
  VALUES (?, ?, ?, datetime('now'), datetime('now'))
`);
const insertUser = db.prepare(`
  INSERT INTO users
    (id, contact_id, password_hash, active, is_superadmin, must_change_password,
     redmine_login, redmine_user_id, created_at, updated_at)
  VALUES (?, ?, ?, 1, 1, 1, ?, ?, datetime('now'), datetime('now'))
`);
const updateUserRedmine = db.prepare(`
  UPDATE users
  SET redmine_login = ?,
      redmine_user_id = ?,
      is_superadmin = 1,
      updated_at = datetime('now')
  WHERE id = ?
`);

// ── Ejecución ─────────────────────────────────────────────────────────────────

let cobertecUsers: RedmineUser[];
try {
  cobertecUsers = await fetchAllCobertecUsers();
} catch (err) {
  console.error('✗ Error al descargar usuarios de Redmine:', err);
  db.close();
  process.exit(1);
}

console.log(`\n${cobertecUsers.length} usuarios @cobertec.com encontrados en Redmine\n`);

if (cobertecUsers.length === 0) {
  console.log('Nada que importar.');
  db.close();
  process.exit(0);
}

// Pre-hashear la contraseña por defecto (una sola vez)
console.log('Generando hash de contraseña por defecto...');
const defaultPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

let imported = 0;
let updated = 0;
let errors = 0;
const errorDetails: string[] = [];

const importAll = db.transaction(() => {
  for (const ru of cobertecUsers) {
    try {
      const fullName = `${ru.firstname} ${ru.lastname}`.trim() || ru.login;
      const email = ru.mail.toLowerCase();

      const existingContact = findContactByEmail.get(email) as { id: string; name: string } | undefined;

      if (!existingContact) {
        // ── Crear contacto + usuario nuevo ────────────────────────────────
        const contactId = randomUUID();
        const userId = randomUUID();

        insertContact.run(contactId, fullName, email);
        insertUser.run(userId, contactId, defaultPasswordHash, ru.login, ru.id);

        imported++;
      } else {
        // ── Actualizar usuario existente ──────────────────────────────────
        const existingUser = findUserByContactId.get(existingContact.id) as { id: string } | undefined;
        if (!existingUser) {
          // Contacto sin usuario asociado — crear el usuario
          const userId = randomUUID();
          insertUser.run(userId, existingContact.id, defaultPasswordHash, ru.login, ru.id);
          imported++;
        } else {
          updateUserRedmine.run(ru.login, ru.id, existingUser.id);
          updated++;
        }
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push(`  ${ru.mail} (login: ${ru.login}): ${msg}`);
    }
  }
});

try {
  importAll();
} catch (err) {
  console.error('✗ Error fatal durante la transacción:', err);
  db.close();
  process.exit(1);
}

db.close();

// ── Resumen ───────────────────────────────────────────────────────────────────

console.log(`
─────────────────────────────────────────────────────
Importación completada:
  ✓ Importados (nuevos):  ${imported}
  ✓ Actualizados:         ${updated}
  ✗ Errores:              ${errors}
─────────────────────────────────────────────────────
Total procesados: ${imported + updated + errors} / ${cobertecUsers.length}
`);

if (errorDetails.length > 0) {
  console.log('Detalle de errores:');
  errorDetails.forEach(e => console.log(e));
}
