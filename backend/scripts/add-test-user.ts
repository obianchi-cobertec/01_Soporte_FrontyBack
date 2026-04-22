/**
 * Añade usuario_prueba (Redmine id: 848) a identity.db
 * vinculado a la empresa HERGOPAS_sat (Redmine project id: 379)
 *
 * Uso: npx tsx scripts/add-test-user.ts
 */

import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(resolve(__dirname, '../data/identity.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const USER_ID    = '848';
const COMPANY_ID = '379';
const LOGIN      = 'usuario_prueba';
const NAME       = 'Usuario Prueba';
const EMAIL      = 'formacion@cobertec.es';
const PASSWORD   = 'Cobertec2024!';

async function main() {
  const company = db.prepare('SELECT id, name FROM companies WHERE id = ?').get(COMPANY_ID) as any;
  if (!company) {
    console.error(`✗ Empresa ${COMPANY_ID} no encontrada. Ejecuta el import primero.`);
    process.exit(1);
  }
  console.log(`✓ Empresa encontrada: ${company.name}`);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  db.prepare(`INSERT OR IGNORE INTO contacts (id, name, email) VALUES (?, ?, ?)`).run(USER_ID, NAME, EMAIL);
  db.prepare(`INSERT OR IGNORE INTO users (id, contact_id, password_hash, active, is_superadmin, redmine_login) VALUES (?, ?, ?, 1, 0, ?)`).run(USER_ID, USER_ID, passwordHash, LOGIN);
  db.prepare(`INSERT OR IGNORE INTO user_companies (user_id, company_id, role) VALUES (?, ?, 'user')`).run(USER_ID, COMPANY_ID);

  const user = db.prepare('SELECT id, redmine_login FROM users WHERE id = ?').get(USER_ID) as any;
  console.log(`✓ Usuario:`, user);
  console.log(`✓ Vinculado a: ${company.name} (${COMPANY_ID})`);
  console.log(`\nCredenciales: ${EMAIL} / ${PASSWORD}`);

  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
