/**
 * Migración: obtener redmine_user_id para todos los usuarios importados
 *
 * Ejecutar desde backend/:
 *   npx tsx scripts/migrate-redmine-ids.ts
 *
 * Requisitos en .env:
 *   REDMINE_URL=https://incidencias.cobertec.com/sgi
 *   REDMINE_API_KEY=50fb6d7818e1134b47615e236982f2823342b9fc
 *   IDENTITY_DB_PATH=data/identity.db
 */

import Database from 'better-sqlite3';
import path from 'path';

const REDMINE_URL = process.env.REDMINE_URL ?? 'https://incidencias.cobertec.com/sgi';
const REDMINE_API_KEY = process.env.REDMINE_API_KEY ?? '50fb6d7818e1134b47615e236982f2823342b9fc';
const DB_PATH = process.env.IDENTITY_DB_PATH ?? 'data/identity.db';
const DELAY_MS = 200; // delay entre llamadas para no saturar Redmine

const db = new Database(path.resolve(DB_PATH));

// ── 1. Añadir columnas si no existen (SQLite compatible) ─────────────────────

const existingCols = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map(c => c.name);

if (!existingCols.includes('redmine_user_id')) {
  db.exec(`ALTER TABLE users ADD COLUMN redmine_user_id INTEGER;`);
  console.log('✓ Columna redmine_user_id añadida');
} else {
  console.log('✓ Columna redmine_user_id ya existe');
}

if (!existingCols.includes('must_change_password')) {
  db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1;`);
  console.log('✓ Columna must_change_password añadida');
} else {
  console.log('✓ Columna must_change_password ya existe');
}

// ── 2. Marcar todos los usuarios importados como must_change_password ────────

const markAll = db.prepare(`
  UPDATE users SET must_change_password = 1 WHERE redmine_login IS NOT NULL
`);
const marked = markAll.run();
console.log(`✓ must_change_password = 1 en ${marked.changes} usuarios`);

// ── 3. Fetch redmine_user_id para cada usuario ───────────────────────────────

const users = db.prepare(`
  SELECT id, redmine_login FROM users
  WHERE redmine_login IS NOT NULL AND redmine_user_id IS NULL
`).all() as { id: string; redmine_login: string }[];

console.log(`\nBuscando redmine_user_id para ${users.length} usuarios...\n`);

const updateStmt = db.prepare(`
  UPDATE users SET redmine_user_id = ? WHERE id = ?
`);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let found = 0;
let notFound = 0;
let errors = 0;
const notFoundLogins: string[] = [];

for (const user of users) {
  try {
    const url = `${REDMINE_URL}/users.json?name=${encodeURIComponent(user.redmine_login)}&limit=25`;
    const res = await fetch(url, {
      headers: { 'X-Redmine-API-Key': REDMINE_API_KEY }
    });

    if (!res.ok) {
      console.error(`  ✗ HTTP ${res.status} para ${user.redmine_login}`);
      errors++;
      await sleep(DELAY_MS);
      continue;
    }

    const data = await res.json() as { users: { id: number; login: string }[] };

    // Buscar match exacto por login
    const match = data.users.find(u => u.login === user.redmine_login);

    if (match) {
      updateStmt.run(match.id, user.id);
      found++;
      if (found % 50 === 0) console.log(`  ... ${found} encontrados`);
    } else {
      notFound++;
      notFoundLogins.push(user.redmine_login);
    }

    await sleep(DELAY_MS);
  } catch (err) {
    console.error(`  ✗ Error para ${user.redmine_login}:`, err);
    errors++;
    await sleep(DELAY_MS);
  }
}

// ── 4. Resumen ───────────────────────────────────────────────────────────────

console.log(`
─────────────────────────────────────
Migración completada:
  ✓ Encontrados:   ${found}
  ✗ No encontrados: ${notFound}
  ✗ Errores:        ${errors}
─────────────────────────────────────
`);

if (notFoundLogins.length > 0) {
  console.log('Logins sin match en Redmine:');
  notFoundLogins.forEach(l => console.log(`  - ${l}`));
}

db.close();
