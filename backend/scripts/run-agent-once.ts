/**
 * run-agent-once.ts — Dispara el agente de configuración manualmente
 *
 * Uso: npx tsx scripts/run-agent-once.ts
 *
 * Útil para pruebas manuales después de ejecutar seed-test-pattern.ts.
 * En producción el agente se ejecuta automáticamente vía cron a las 03:00 UTC.
 */

import 'dotenv/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.INTAKE_DB_PATH = resolve(__dirname, '../data/intake.db');

import { runAgent } from '../src/services/config-agent/agent.js';

runAgent()
  .then(() => {
    console.log('[run-agent-once] Agente ejecutado correctamente.');
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('[run-agent-once] Error:', err);
    process.exit(1);
  });
