import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { intakeRoutes } from './routes/intake.js';
import { metricsRoutes } from './routes/metrics.js';
import { authRoutes } from './routes/auth.js';
import { identityRoutes } from './routes/identity.js';
import { configRoutes } from './routes/config.js';
import { adminRoutes } from './routes/admin.js';
import { requestRoutes } from './routes/requests.js';
import { reviewRoutes } from './routes/review.js';
import { adminReviewsRoutes } from './routes/admin-reviews.js';
import { adminConfigProposalsRoutes } from './routes/admin-config-proposals.js';
import authPlugin from './plugins/auth.js';
import { initEventStore, closeEventStore } from './services/events/index.js';
import { getIdentityStore } from './services/identity/store.js';
import { getIntakeStore } from './services/intake-store/store.js';
import { runExpiryCheck, runOutOfSyncCheck } from './services/intake-store/cron.js';
import { runAgent } from './services/config-agent/agent.js';
import { AuthServiceError } from './services/auth/service.js';
import { getRedmineMapping } from './config/loader.js';
import { validateRedmineMapping } from './services/redmine/identity-validator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const port = parseInt(process.env.PORT ?? '3001', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  const dataDir = resolve(__dirname, '../data');
  mkdirSync(dataDir, { recursive: true });

  initEventStore(resolve(dataDir, 'events.db'));
  console.log('[Server] Event store inicializado');

  process.env.IDENTITY_DB_PATH = resolve(dataDir, 'identity.db');
  getIdentityStore();
  console.log('[Server] Identity store inicializado');
  getIdentityStore().pruneExpiredTokens();

  process.env.INTAKE_DB_PATH = resolve(dataDir, 'intake.db');
  getIntakeStore();
  console.log('[Server] Intake store inicializado');

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
    bodyLimit: parseInt(process.env.BODY_LIMIT_MB ?? '25', 10) * 1024 * 1024,
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  await app.register(rateLimit, {
    global: false, // opt-in por ruta
    errorResponseBuilder: (_request, context) => ({
      error: 'TOO_MANY_REQUESTS',
      message: `Demasiados intentos. Espera ${Math.ceil(context.ttl / 1000)} segundos antes de volver a intentarlo.`,
    }),
  });

  await app.register(cookie);
  await app.register(authPlugin);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(identityRoutes, { prefix: '/api/identity' });
  await app.register(configRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(requestRoutes, { prefix: '/api/requests' });
  await app.register(reviewRoutes, { prefix: '/api/review' });
  await app.register(adminReviewsRoutes, { prefix: '/api/admin/reviews' });
  await app.register(adminConfigProposalsRoutes, { prefix: '/api/admin/config-proposals' });
  await app.register(intakeRoutes);
  await app.register(metricsRoutes);

  // Error handler global — debe registrarse después de los plugins para sobreescribir
  // el handler del auth plugin (que usa fastify-plugin / misma scope).
  app.setErrorHandler((error: Error & { code?: string }, _request, reply) => {
    // Cuerpo demasiado grande (Fastify FST_ERR_CTP_BODY_TOO_LARGE)
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'El conjunto de adjuntos supera el tamaño máximo permitido (25 MB). Reduce el tamaño o elimina alguno antes de enviar.',
        },
      });
    }
    // Errores de autenticación/autorización (mismo comportamiento que auth plugin)
    if (error instanceof AuthServiceError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }
    // Resto de errores: delegar al manejador por defecto de Fastify
    reply.send(error);
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  const shutdown = async () => {
    console.log('[Server] Cerrando...');
    closeEventStore();
    getIdentityStore().close();
    getIntakeStore().close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await app.listen({ port, host });
    console.log(`[Server] Backend escuchando en http://${host}:${port}`);
    console.log(`[Server] Endpoints:`);
    console.log(`  POST /api/auth/token`);
    console.log(`  POST /api/auth/select`);
    console.log(`  POST /api/auth/logout`);
    console.log(`  POST /api/auth/forgot-password`);
    console.log(`  POST /api/auth/reset-password`);
    console.log(`  GET  /api/identity/me`);
    console.log(`  POST /api/intake/submit`);
    console.log(`  POST /api/intake/confirm`);
    console.log(`  GET  /api/metrics`);
    console.log(`  GET  /api/metrics/session/:id`);
    console.log(`  GET  /api/admin/users`);
    console.log(`  POST /api/admin/users`);
    console.log(`  GET  /api/admin/companies`);
    console.log(`  POST /api/admin/companies`);
    console.log(`  GET  /api/health`);

    // Cron: verificación de reviews expiradas (cada hora)
    setInterval(() => {
      runExpiryCheck().catch(e => console.error('[Cron] runExpiryCheck error:', e));
    }, 60 * 60 * 1000);
    runExpiryCheck().catch(e => console.error('[Cron] runExpiryCheck inicial error:', e));

    // Cron: verificación out_of_sync (cada 6 horas)
    setInterval(() => {
      runOutOfSyncCheck().catch(e => console.error('[Cron] runOutOfSyncCheck error:', e));
    }, 6 * 60 * 60 * 1000);

    // Cron: agente LLM de configuración (diario a las 03:00 UTC)
    const scheduleAgentCron = () => {
      const agentHour = parseInt(process.env.CONFIG_AGENT_CRON_HOUR ?? '3', 10);
      const now = new Date();
      const nextRun = new Date();
      nextRun.setUTCHours(agentHour, 0, 0, 0);
      if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
      const msUntilNextRun = nextRun.getTime() - now.getTime();
      setTimeout(() => {
        runAgent().catch((e: unknown) => console.error('[Cron] runAgent error:', e));
        setInterval(() => {
          runAgent().catch((e: unknown) => console.error('[Cron] runAgent error:', e));
        }, 24 * 60 * 60 * 1000);
      }, msUntilNextRun);
      console.log(`[ConfigAgent] Próxima ejecución: ${nextRun.toISOString()}`);
    };
    scheduleAgentCron();

    // Validar IDs de role_to_user_id contra cobertec-users.json
    const { valid, orphanIds } = validateRedmineMapping(getRedmineMapping());
    if (valid) {
      console.log('[config] Validación de IDs Redmine: OK (todos los IDs en role_to_user_id existen en cobertec-users.json)');
    } else {
      console.warn(
        `[config] ${orphanIds.length} ID(s) en role_to_user_id no existen en cobertec-users.json:`,
        orphanIds
      );
    }
  } catch (err) {
    console.error('[Server] Error al arrancar:', err);
    process.exit(1);
  }
}

main();
