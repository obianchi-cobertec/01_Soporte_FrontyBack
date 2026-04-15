/**
 * Seed script — Crea datos de prueba para desarrollo
 *
 * Uso:  npx tsx scripts/seed-identity.ts
 */

import { getIdentityStore } from '../src/services/identity/store.js';
import { hashPassword } from '../src/services/auth/service.js';

async function seed(): Promise<void> {
  const store = getIdentityStore();

  console.log('🌱 Seeding identity database...\n');

  // ─── Empresas ─────────────────────────────────────────

  const company1 = store.createCompany({
    name: 'Distribuciones García S.L.',
    redmine_project_id: null,
  });
  console.log(`  Empresa: ${company1.name} (${company1.id})`);

  const company2 = store.createCompany({
    name: 'Talleres López S.A.',
    redmine_project_id: null,
  });
  console.log(`  Empresa: ${company2.name} (${company2.id})`);

  // ─── Superadmin Cobertec ──────────────────────────────

  const pwAdmin = await hashPassword('@Cober2023');

  const contactAdmin = store.createContact({
    name: 'Cobertec Admin',
    email: 'suscripciones@cobertec.es',
    phone: null,
  });
  store.createUser({
    contact_id: contactAdmin.id,
    password_hash: pwAdmin,
    is_superadmin: true,
  });
  console.log(`  Superadmin: ${contactAdmin.email} (acceso total, sin empresa asignada)`);

  // ─── Usuarios estándar ────────────────────────────────

  const pw = await hashPassword('test1234');

  const contact1 = store.createContact({
    name: 'María García',
    email: 'maria@distribuciones-garcia.es',
    phone: '+34 600 111 222',
  });
  const user1 = store.createUser({ contact_id: contact1.id, password_hash: pw });
  store.linkUserCompany(user1.id, company1.id, 'user');
  console.log(`  Usuario: ${contact1.email} → user de ${company1.name}`);

  const contact2 = store.createContact({
    name: 'Pedro López',
    email: 'pedro@talleres-lopez.es',
    phone: '+34 600 333 444',
  });
  const user2 = store.createUser({ contact_id: contact2.id, password_hash: pw });
  store.linkUserCompany(user2.id, company2.id, 'user');
  console.log(`  Usuario: ${contact2.email} → user de ${company2.name}`);

  const contact3 = store.createContact({
    name: 'Ana Martínez',
    email: 'ana@distribuciones-garcia.es',
  });
  const user3 = store.createUser({ contact_id: contact3.id, password_hash: pw });
  store.linkUserCompany(user3.id, company1.id, 'user');
  console.log(`  Usuario: ${contact3.email} → user de ${company1.name}`);

  console.log('\n✅ Seed completo.');
  console.log('   Superadmin: coberadmin@cobertec.es / @Cober2023');
  console.log('   Usuarios estándar: test1234');
  store.close();
}

seed().catch((err) => {
  console.error('❌ Error en seed:', err);
  process.exit(1);
});
