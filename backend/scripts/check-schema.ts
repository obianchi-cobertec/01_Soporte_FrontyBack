import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(resolve(__dirname, '../data/identity.db'));

const tables = ['contacts', 'users', 'companies', 'user_companies'];
for (const table of tables) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  console.log(`\n── ${table} ──`);
  for (const col of info as any[]) {
    console.log(`  ${col.name}: ${col.type} ${col.pk ? '(PK)' : ''}`);
  }
}

// Check actual stored type
const row = db.prepare('SELECT typeof(id) as id_type, id FROM contacts LIMIT 1').get() as any;
console.log('\nTipo real del id en contacts:', row);

db.close();
