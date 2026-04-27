import { getIdentityStore } from '../src/services/identity/store.js';

const store = getIdentityStore();
const user = store.getUserByEmail('formacion@cobertec.es');
if (!user) { console.log('Usuario no encontrado'); process.exit(1); }

store.setMustChangePassword(user.id, true);
console.log(`✓ must_change_password = 1 para ${user.id}`);
store.close();