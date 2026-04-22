import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { intakeRoutes } from './routes/intake.js';
import { metricsRoutes } from './routes/metrics.js';
import { authRoutes } from './routes/auth.js';
import { identityRoutes } from './routes/identity.js';
import { configRoutes } from './routes/config.js';
import { adminRoutes } from './routes/admin.js';
import authPlugin from './plugins/auth.js';
import { initEventStore, closeEventStore } from './services/events/index.js';
import { getIdentityStore } from './services/identity/store.js';

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

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
    bodyLimit: parseInt(process.env.BODY_LIMIT_MB ?? '10', 10) * 1024 * 1024,
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  await app.register(cookie);
  await app.register(authPlugin);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(identityRoutes, { prefix: '/api/identity' });
  await app.register(configRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(intakeRoutes);
  await app.register(metricsRoutes);

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  const shutdown = async () => {
    console.log('[Server] Cerrando...');
    closeEventStore();
    getIdentityStore().close();
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
  } catch (err) {
    console.error('[Server] Error al arrancar:', err);
    process.exit(1);
  }
}

main();
