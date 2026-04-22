import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(resolve(__dirname, '../data/identity.db'));

const email = 'formacion@cobertec.es';

const contact = db.prepare('SELECT * FROM contacts WHERE email = ?').get(email) as any;
console.log('Contact:', contact);

if (contact) {
  const user = db.prepare('SELECT id, contact_id, active, is_superadmin, redmine_login FROM users WHERE contact_id = ?').get(contact.id) as any;
  console.log('User:', user);

  if (user) {
    const companies = db.prepare(`
      SELECT c.id, c.name, c.redmine_project_id, uc.role
      FROM companies c
      JOIN user_companies uc ON c.id = uc.company_id
      WHERE uc.user_id = ?
    `).all(user.id) as any[];
    console.log('Companies:', companies);
  }
}

db.close();
