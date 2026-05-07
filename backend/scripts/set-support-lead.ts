/**
 * set-support-lead.ts
 *
 * Marca un usuario como is_support_lead=1 por email.
 * Uso: npx tsx scripts/set-support-lead.ts email@cobertec.com
 */

import 'dotenv/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.IDENTITY_DB_PATH = resolve(__dirname, '../data/identity.db');

import { getIdentityStore } from '../src/services/identity/store.js';

const email = process.argv[2];

if (!email) {
  console.error('Uso: npx tsx scripts/set-support-lead.ts email@cobertec.com');
  process.exit(1);
}

const store = getIdentityStore();

const userRow = store.getUserByEmail(email);
if (!userRow) {
  console.error(`Usuario no encontrado: ${email}`);
  store.close();
  process.exit(1);
}

store.setSupportLead(userRow.id, true);
console.log(`✓ Usuario "${email}" (${userRow.contact_name}) marcado como support lead.`);

// Verificar
const lead = store.getSupportLead();
if (lead) {
  console.log(`Support lead activo: ${lead.name} <${lead.email}>`);
}

store.close();
