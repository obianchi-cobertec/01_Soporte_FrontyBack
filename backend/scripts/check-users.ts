import { getIdentityStore } from '../src/services/identity/store.js';

const s = getIdentityStore();
const users = (s as any).db.prepare(`
  SELECT u.id, u.redmine_login, c.name, c.email 
  FROM users u 
  JOIN contacts c ON u.contact_id = c.id 
  WHERE u.redmine_login LIKE '%cbt%'
`).all();
console.table(users);
s.close();