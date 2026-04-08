import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { intakeRoutes } from './routes/intake.js';
import { metricsRoutes } from './routes/metrics.js';
import { initEventStore, closeEventStore } from './services/events/index.js';

// =============================================================================
// Servidor principal — Backend MVP Cobertec Intake
//
// Fastify + rutas de intake + rutas de métricas + event store
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const port = parseInt(process.env.PORT ?? '3001', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  // Asegurar directorio de datos
  const dataDir = resolve(__dirname, '../data');
  mkdirSync(dataDir, { recursive: true });

  // Inicializar event store
  initEventStore(resolve(dataDir, 'events.db'));
  console.log('[Server] Event store inicializado');

  // Crear servidor
    const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
   bodyLimit: parseInt(process.env.BODY_LIMIT_MB ?? '10', 10) * 1024 * 1024,
  });

  // CORS (para desarrollo frontend)
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST'],
  });

  // Registrar rutas
  await app.register(intakeRoutes);
  await app.register(metricsRoutes);

  // Health check
  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Server] Cerrando...');
    closeEventStore();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Arrancar
  try {
    await app.listen({ port, host });
    console.log(`[Server] Backend escuchando en http://${host}:${port}`);
    console.log(`[Server] Endpoints:`);
    console.log(`  POST /api/intake/submit`);
    console.log(`  POST /api/intake/confirm`);
    console.log(`  GET  /api/metrics`);
    console.log(`  GET  /api/metrics/session/:id`);
    console.log(`  GET  /api/health`);
  } catch (err) {
    console.error('[Server] Error al arrancar:', err);
    process.exit(1);
  }
}

main();
