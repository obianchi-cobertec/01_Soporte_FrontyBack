/**
 * seed-test-pattern.ts — SOLO PARA DESARROLLO
 *
 * Inserta datos de prueba en intake.db para validar el flujo completo
 * de detección de patrones y generación de propuestas de configuración.
 *
 * Crea:
 *   - 5 pending_reviews ficticios
 *   - 5 entradas en review_audit_log con action='reassigned',
 *     todas con domain='compras', from_role='tecnico_erp', to_role='tecnico_compras'
 *
 * NO ejecutar en producción.
 */

import 'dotenv/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.INTAKE_DB_PATH = resolve(__dirname, '../data/intake.db');

import { getIntakeStore } from '../src/services/intake-store/store.js';

const store = getIntakeStore();

const DOMAIN = 'compras';
const FROM_ROLE = 'tecnico_erp';
const TO_ROLE = 'tecnico_compras';

const REASONS = [
  'Esto es del módulo de compras, no ERP genérico',
  'Compras siempre lo lleva el técnico de compras, no el ERP',
  'El problema es con pedidos de compra, debe ir a compras',
  'El técnico ERP no tiene acceso al módulo de compras de este cliente',
  'Históricamente los tickets de compras van al equipo especializado',
];

// Generar fecha pasada
function backDate(daysAgo: number, hoursAgo: number = 0): string {
  const d = new Date(Date.now() - (daysAgo * 86400 + hoursAgo * 3600) * 1000);
  return d.toISOString();
}

console.log('[seed] Creando pending_reviews y audit_log ficticios...');

const createdAuditIds: string[] = [];

for (let i = 0; i < 5; i++) {
  const jti = randomUUID();

  // Crear pending_review ficticio (la FK en audit_log lo requiere)
  const pr = store.createPendingReview({
    session_id: randomUUID(),
    redmine_ticket_id: 9000 + i,
    redmine_ticket_url: `https://redmine.cobertec.com/issues/${9000 + i}`,
    redmine_project_id: 1,
    user_id: randomUUID(),
    company_id: 'empresa-test-seed',
    company_name: 'Empresa de Prueba SA',
    intake_description: 'No puedo crear un pedido de compra. El proveedor no aparece en el desplegable.',
    original_classification: JSON.stringify({
      domain: DOMAIN,
      from_role: FROM_ROLE,
      to_role: TO_ROLE,
    }),
    current_assignee_role: FROM_ROLE,
    current_assignee_redmine_user_id: 735,
    current_assignee_email: 'tecnico.erp@cobertec.com',
    current_assignee_name: 'Técnico ERP (Seed)',
    expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
    current_token_jti: jti,
  });

  // Crear audit log de reasignación
  const log = store.logAuditEvent({
    pending_review_id: pr.id,
    redmine_ticket_id: 9000 + i,
    action: 'reassigned',
    actor_type: 'user',
    actor_redmine_user_id: 525,
    actor_name: 'Hildegart Nieto (Seed)',
    from_role: FROM_ROLE,
    from_redmine_user_id: 735,
    to_role: TO_ROLE,
    to_redmine_user_id: 525,
    reason: REASONS[i],
    domain: DOMAIN,
    nature: 'consulta_funcional',
    company_id: 'empresa-test-seed',
  });

  // Sobrescribir created_at con fecha pasada para simular historial
  // (optional: no es estrictamente necesario para que el agente funcione,
  //  pero permite ver el patrón en el historial con fechas realistas)

  createdAuditIds.push(log.id);
  console.log(`[seed] ${i + 1}/5 — pending_review ${pr.id.slice(0, 8)}... audit_log ${log.id.slice(0, 8)}... — "${REASONS[i].slice(0, 40)}..."`);
}

console.log('\n[seed] IDs de audit_log creados:');
createdAuditIds.forEach(id => console.log(`  - ${id}`));

console.log('\n[seed] Listo. Ahora ejecuta:');
console.log('  cd backend && npx tsx scripts/run-agent-once.ts');
console.log('O espera al cron de las 03:00 UTC para generar la propuesta automáticamente.');
console.log('\nTras ejecutar el agente, abre el panel "Propuestas IA" en el frontend');
console.log('para ver la propuesta generada y probar Aplicar / Rechazar.');

store.close();
