/**
 * import-redmine-clients.ts
 *
 * Importa empresas y usuarios cliente desde Redmine a identity.db.
 * Solo importa proyectos del grupo "Expertis y Movilsat" (parent_id: 134).
 *
 * Uso:
 *   cd backend
 *   npx tsx scripts/import-redmine-clients.ts
 *
 * Opciones de entorno:
 *   DRY_RUN=true   → muestra lo que haría sin escribir nada
 *   RESET=true     → borra empresas/usuarios cliente antes de importar (¡cuidado!)
 */

import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.env.DRY_RUN === 'true';
const RESET = process.env.RESET === 'true';

// ─── Contraseña por defecto para todos los usuarios importados ───────────────
// El usuario deberá cambiarla en su primer login (futura funcionalidad)
const DEFAULT_PASSWORD = 'Cobertec2024!';
const BCRYPT_ROUNDS = 12;

// ─── Datos extraídos de Redmine ───────────────────────────────────────────────
// Generados por el proceso de extracción descrito en CLAUDE.md

import projectsRaw from './redmine_projects.json' assert { type: 'json' };
import membersRaw from './redmine_members.json' assert { type: 'json' };
import usersRaw from './redmine_users_detail.json' assert { type: 'json' };

interface RedmineProject {
  id: number;
  name: string;
  identifier: string;
  IDCliente: string;
}

interface RedmineMember {
  project_id: number;
  user_id: number;
  user_name: string;
}

interface RedmineUser {
  id: number;
  login: string;
  firstname: string;
  lastname: string;
  mail: string;
}

const projects = projectsRaw as RedmineProject[];
const members = membersRaw as RedmineMember[];
const users = usersRaw as RedmineUser[];

// IDs de staff de Cobertec — no importar como clientes
const COBERTEC_USER_IDS = new Set([1, 6, 12, 13, 21, 25, 73, 74, 79, 221, 270, 322, 329, 525, 562, 642, 736, 768]);

// ─── Setup DB ─────────────────────────────────────────────────────────────────

const dataDir = resolve(__dirname, '../data');
mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.IDENTITY_DB_PATH ?? resolve(dataDir, 'identity.db');
console.log(`[import] DB: ${dbPath}`);
console.log(`[import] DRY_RUN: ${DRY_RUN}`);
console.log(`[import] RESET: ${RESET}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Índice de usuarios por ID de Redmine
  const userMap = new Map(users.map(u => [u.id, u]));

  // Índice proyecto → usuarios cliente
  const projUsers = new Map<number, number[]>();
  for (const m of members) {
    if (COBERTEC_USER_IDS.has(m.user_id)) continue;
    if (!userMap.has(m.user_id)) continue;
    if (!projUsers.has(m.project_id)) projUsers.set(m.project_id, []);
    projUsers.get(m.project_id)!.push(m.user_id);
  }

  // Solo proyectos que tienen usuarios cliente
  const activeProjects = projects.filter(p => projUsers.has(p.id) && projUsers.get(p.id)!.length > 0);

  console.log(`\n[import] Proyectos a importar: ${activeProjects.length}`);
  console.log(`[import] Usuarios únicos: ${new Set(members.filter(m => !COBERTEC_USER_IDS.has(m.user_id) && userMap.has(m.user_id)).map(m => m.user_id)).size}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Primeros 5 proyectos:');
    for (const p of activeProjects.slice(0, 5)) {
      const uids = projUsers.get(p.id) ?? [];
      console.log(`  ${p.name} (${p.identifier}) — ${uids.length} usuarios`);
      for (const uid of uids.slice(0, 3)) {
        const u = userMap.get(uid)!;
        console.log(`    - ${u.firstname} ${u.lastname} <${u.mail}>`);
      }
    }
    console.log('\n[DRY RUN] Sin cambios en la base de datos.');
    db.close();
    return;
  }

  if (RESET) {
    console.log('\n[RESET] Borrando datos cliente importados...');
    db.prepare(`DELETE FROM user_companies WHERE user_id IN (SELECT id FROM users WHERE is_superadmin = 0)`).run();
    db.prepare(`DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE is_superadmin = 0)`).run();
    db.prepare(`DELETE FROM users WHERE is_superadmin = 0`).run();
    db.prepare(`DELETE FROM contacts WHERE id NOT IN (SELECT contact_id FROM users)`).run();
    db.prepare(`DELETE FROM companies WHERE redmine_project_id != 'cobertec-intake-test'`).run();
    console.log('[RESET] Datos cliente borrados');
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);
  console.log('\n[import] Contraseña hasheada. Iniciando importación...\n');

  let companiesInserted = 0;
  let companiesSkipped = 0;
  let usersInserted = 0;
  let usersSkipped = 0;
  let relationsInserted = 0;

  const insertCompany = db.prepare(`
    INSERT OR IGNORE INTO companies (id, name, redmine_project_id, active)
    VALUES (?, ?, ?, 1)
  `);

  const insertContact = db.prepare(`
    INSERT OR IGNORE INTO contacts (id, name, email, phone, whatsapp)
    VALUES (?, ?, ?, NULL, NULL)
  `);

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, contact_id, password_hash, active, is_superadmin, redmine_login)
    VALUES (?, ?, ?, 1, 0, ?)
  `);

  const insertRelation = db.prepare(`
    INSERT OR IGNORE INTO user_companies (user_id, company_id, role)
    VALUES (?, ?, 'user')
  `);

  const checkCompany = db.prepare(`SELECT id FROM companies WHERE redmine_project_id = ?`);
  const checkUser = db.prepare(`SELECT id FROM users WHERE id = ?`);

  // Usamos IDs de Redmine directamente para mantener trazabilidad
  // companies.id = redmine project id
  // users.id = redmine user id
  // contacts.id = redmine user id

  const importAll = db.transaction(() => {
    for (const project of activeProjects) {
      const uids = projUsers.get(project.id) ?? [];
      const projectIdInt = String(Math.trunc(Number(project.id)));

      // Insertar empresa
      const existing = checkCompany.get(project.identifier) as any;
      if (!existing) {
        insertCompany.run(projectIdInt, project.name, project.identifier);
        companiesInserted++;
      } else {
        companiesSkipped++;
      }

      const companyId = existing?.id ? String(Math.trunc(Number(existing.id))) : projectIdInt;

      // Insertar usuarios
      for (const uid of uids) {
        const u = userMap.get(uid)!;
        const uidInt = String(Math.trunc(Number(uid)));
        const fullName = `${u.firstname} ${u.lastname}`.trim();

        const existingUser = checkUser.get(uidInt);
        if (!existingUser) {
          insertContact.run(uidInt, fullName, u.mail);
          insertUser.run(uidInt, uidInt, passwordHash, u.login);
          usersInserted++;
        } else {
          usersSkipped++;
        }

        // Relación usuario-empresa
        try {
          insertRelation.run(uidInt, companyId);
          relationsInserted++;
        } catch {
          // Ya existe
        }
      }
    }
  });

  importAll();

  console.log('─'.repeat(50));
  console.log(`[import] ✓ Empresas insertadas:  ${companiesInserted}`);
  console.log(`[import] ○ Empresas ya existían: ${companiesSkipped}`);
  console.log(`[import] ✓ Usuarios insertados:  ${usersInserted}`);
  console.log(`[import] ○ Usuarios ya existían: ${usersSkipped}`);
  console.log(`[import] ✓ Relaciones creadas:   ${relationsInserted}`);
  console.log('─'.repeat(50));
  console.log(`\n[import] Contraseña por defecto: ${DEFAULT_PASSWORD}`);
  console.log('[import] ⚠ Comunica a los usuarios que deben cambiar su contraseña.');

  db.close();
}

main().catch(e => {
  console.error('[import] Error:', e);
  process.exit(1);
});
