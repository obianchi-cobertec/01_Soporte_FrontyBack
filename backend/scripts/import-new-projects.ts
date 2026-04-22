/**
 * import-new-projects.ts
 *
 * Importa empresas y usuarios de SAT Ecommerce, SAT Web, Sistemas y AcademIA.
 * Complementa import-redmine-clients.ts que importó Expertis/Movilsat.
 *
 * Uso:
 *   cd backend
 *   npx tsx scripts/import-new-projects.ts
 *
 * Opciones:
 *   DRY_RUN=true  → muestra sin escribir
 */

import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.env.DRY_RUN === 'true';

const DEFAULT_PASSWORD = 'Cobertec2024!';
const BCRYPT_ROUNDS = 12;

const COBERTEC_IDS = new Set([1,6,12,13,21,25,73,74,79,221,270,322,329,525,562,642,736,768,847,848]);

import membersRaw from './redmine_new_members.json' assert { type: 'json' };
import usersRaw from './redmine_new_users.json' assert { type: 'json' };

interface Member { project_id: number; user_id: number; user_name: string; }
interface User { id: number; login: string; firstname: string; lastname: string; mail: string; }

const members = membersRaw as Member[];
const users = usersRaw as User[];

const PROJECTS: Record<number, { name: string; identifier: string }> = {
  127: { name: 'SATAtlantica',            identifier: 'satbilineata' },
  87:  { name: 'SATbiciclick',            identifier: 'satbiciclick' },
  189: { name: 'SATburgosalson',          identifier: 'satburgosalson' },
  282: { name: 'SATcampomar',             identifier: 'satcampomar' },
  197: { name: 'SATgaudi',               identifier: 'satgaudi' },
  104: { name: 'SATparentesis',           identifier: 'satparentesis' },
  250: { name: 'SATUrquiza',             identifier: 'saturquiza' },
  162: { name: 'SAT web docutel / Tti',  identifier: 'sat-docutel-tti' },
  228: { name: 'ADMON_FINCAS_GUZMAN',    identifier: 'admon_fincas_guzman' },
  226: { name: 'AYTO_VILLALBILLA',       identifier: 'ayto_villalbilla' },
  168: { name: 'Correo Electronico',     identifier: 'correo-electronico' },
  329: { name: 'SISTEMAS GENERAL',       identifier: 'sistemas-general' },
  221: { name: 'TRANSPORTES_LOMAR',      identifier: 'transportes-lomar' },
  380: { name: 'AcademIA',              identifier: 'academia' },
};

const dataDir = resolve(__dirname, '../data');
const dbPath = process.env.IDENTITY_DB_PATH ?? resolve(dataDir, 'identity.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

async function main() {
  const userMap = new Map(users.map(u => [u.id, u]));

  const projUsers = new Map<number, Set<number>>();
  for (const m of members) {
    if (COBERTEC_IDS.has(m.user_id)) continue;
    if (!userMap.has(m.user_id)) continue;
    if (!projUsers.has(m.project_id)) projUsers.set(m.project_id, new Set());
    projUsers.get(m.project_id)!.add(m.user_id);
  }

  const activeProjects = Object.entries(PROJECTS)
    .filter(([id]) => projUsers.has(Number(id)));

  console.log(`[import-new] DRY_RUN: ${DRY_RUN}`);
  console.log(`[import-new] Proyectos: ${activeProjects.length}`);
  console.log(`[import-new] Usuarios: ${new Set(members.filter(m => !COBERTEC_IDS.has(m.user_id) && userMap.has(m.user_id)).map(m => m.user_id)).size}`);

  if (DRY_RUN) {
    for (const [id, proj] of activeProjects) {
      const uids = projUsers.get(Number(id)) ?? new Set();
      console.log(`  ${proj.name} — ${uids.size} usuarios`);
      for (const uid of uids) {
        const u = userMap.get(uid)!;
        console.log(`    - ${u.firstname} ${u.lastname} <${u.mail}>`);
      }
    }
    db.close();
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  const insertCompany  = db.prepare(`INSERT OR IGNORE INTO companies (id, name, redmine_project_id, active) VALUES (?, ?, ?, 1)`);
  const insertContact  = db.prepare(`INSERT OR IGNORE INTO contacts (id, name, email) VALUES (?, ?, ?)`);
  const insertUser     = db.prepare(`INSERT OR IGNORE INTO users (id, contact_id, password_hash, active, is_superadmin, redmine_login) VALUES (?, ?, ?, 1, 0, ?)`);
  const insertRelation = db.prepare(`INSERT OR IGNORE INTO user_companies (user_id, company_id, role) VALUES (?, ?, 'user')`);
  const checkCompany   = db.prepare(`SELECT id FROM companies WHERE redmine_project_id = ?`);
  const checkUser      = db.prepare(`SELECT id FROM users WHERE id = ?`);

  let companiesInserted = 0, usersInserted = 0, relationsInserted = 0;

  const importAll = db.transaction(() => {
    for (const [idStr, proj] of activeProjects) {
      const projIdInt = String(Number(idStr));
      const uids = projUsers.get(Number(idStr)) ?? new Set();

      const existing = checkCompany.get(proj.identifier) as any;
      if (!existing) {
        insertCompany.run(projIdInt, proj.name, proj.identifier);
        companiesInserted++;
      }
      const companyId = existing?.id ? String(Math.trunc(Number(existing.id))) : projIdInt;

      for (const uid of uids) {
        const u = userMap.get(uid)!;
        const uidStr = String(uid);
        const fullName = `${u.firstname} ${u.lastname}`.trim();

        if (!checkUser.get(uidStr)) {
          insertContact.run(uidStr, fullName, u.mail);
          insertUser.run(uidStr, uidStr, passwordHash, u.login);
          usersInserted++;
        }
        try { insertRelation.run(uidStr, companyId); relationsInserted++; } catch {}
      }
    }
  });

  importAll();

  console.log('─'.repeat(50));
  console.log(`[import-new] ✓ Empresas insertadas: ${companiesInserted}`);
  console.log(`[import-new] ✓ Usuarios insertados: ${usersInserted}`);
  console.log(`[import-new] ✓ Relaciones creadas:  ${relationsInserted}`);
  console.log(`\n[import-new] Contraseña: ${DEFAULT_PASSWORD}`);

  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
