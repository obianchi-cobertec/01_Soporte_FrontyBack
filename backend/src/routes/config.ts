// B2/B5 — Rutas de configuración (solo admin Cobertec)
// GET  /api/config/:file  → lee el JSON del disco
// PUT  /api/config/:file  → valida estructura básica + escribe

import type { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getIdentityStore } from '../services/identity/store.js';

const ALLOWED_FILES = ['taxonomy', 'redmine-mapping', 'assignment-rules'] as const;
type ConfigFile = (typeof ALLOWED_FILES)[number];

const CONFIG_DIR = path.resolve(process.cwd(), '..', 'config');

function isAllowed(name: string): name is ConfigFile {
  return ALLOWED_FILES.includes(name as ConfigFile);
}

export async function configRoutes(app: FastifyInstance) {
  // GET /api/config/:file
  app.get<{ Params: { file: string } }>('/config/:file', async (request, reply) => {
    request.requireAuth();
    const store = getIdentityStore();
    const isSuperAdmin = store.isSuperAdmin(request.auth!.sub);
    if (!isSuperAdmin) {
      if (!request.auth?.company_id) {
        return reply.status(403).send({ error: 'company_required' });
      }
      const role = store.getUserCompanyRole(request.auth!.sub, request.auth!.company_id!);
      if (role !== 'admin') {
        return reply.status(403).send({ error: 'admin_required' });
      }
    }

    const { file } = request.params;
    if (!isAllowed(file)) {
      return reply.status(400).send({ error: 'invalid_file' });
    }

    const filePath = path.join(CONFIG_DIR, `${file}.json`);
    console.log('[config GET] Reading:', filePath);
    const raw = await fs.readFile(filePath, 'utf-8');
    return reply.header('Content-Type', 'application/json').send(raw);
  });

  // GET /api/config/redmine-users — lista usuarios internos de Redmine (solo @cobertec.com)
  app.get('/config/redmine-users', async (request, reply) => {
    request.requireAuth();
    const store = getIdentityStore();
    const isSuperAdmin = store.isSuperAdmin(request.auth!.sub);
    if (!isSuperAdmin) {
      const role = store.getUserCompanyRole(request.auth!.sub, request.auth!.company_id ?? '');
      if (role !== 'admin') return reply.status(403).send({ error: 'admin_required' });
    }

    const baseUrl = process.env.REDMINE_URL;
    const apiKey = process.env.REDMINE_API_KEY;
    if (!baseUrl || !apiKey) {
      return reply.status(503).send({ error: 'redmine_not_configured' });
    }

    try {
      // Obtener usuarios del grupo Cobertec (group_id=275)
      const groupRes = await fetch(`${baseUrl}/users.json?group_id=275&limit=100`, {
        headers: { 'X-Redmine-API-Key': apiKey },
      }).then(r => r.json() as Promise<{ users?: Array<{ id: number; login: string; firstname: string; lastname: string; mail: string }> }>);

      const internal = (groupRes.users ?? [])
        .map(u => ({ id: u.id, login: u.login, name: `${u.firstname} ${u.lastname}`.trim() }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return reply.send(internal);
    } catch {
      return reply.status(502).send({ error: 'redmine_fetch_failed' });
    }
  });

  // PUT /api/config/:file
  app.put<{ Params: { file: string }; Body: unknown }>('/config/:file', async (request, reply) => {
    request.requireAuth();
    const store = getIdentityStore();
    const isSuperAdmin = store.isSuperAdmin(request.auth!.sub);
    if (!isSuperAdmin) {
      if (!request.auth?.company_id) {
        return reply.status(403).send({ error: 'company_required' });
      }
      const role = store.getUserCompanyRole(request.auth!.sub, request.auth!.company_id!);
      if (role !== 'admin') {
        return reply.status(403).send({ error: 'admin_required' });
      }
    }

    const { file } = request.params;
    if (!isAllowed(file)) {
      return reply.status(400).send({ error: 'invalid_file' });
    }

    const body = request.body;
    if (typeof body !== 'object' || body === null) {
      return reply.status(400).send({ error: 'invalid_body' });
    }

    if (file === 'taxonomy') {
      const b = body as Record<string, unknown>;
      if (!b.nature || !b.domain) {
        return reply.status(400).send({ error: 'taxonomy must have nature and domain keys' });
      }
    }
    if (file === 'assignment-rules') {
      const b = body as Record<string, unknown>;
      if (!Array.isArray(b.master_rules) || typeof b.rol_funcional !== 'object') {
        return reply.status(400).send({ error: 'assignment-rules must have master_rules[] and rol_funcional' });
      }
    }
    if (file === 'redmine-mapping') {
      const b = body as Record<string, unknown>;
      if (!b.need_catalogue || !b.domain_to_block) {
        return reply.status(400).send({ error: 'redmine-mapping must have need_catalogue and domain_to_block' });
      }
    }

    const filePath = path.join(CONFIG_DIR, `${file}.json`);
    console.log('[config GET] Reading:', filePath);
    const backupPath = `${filePath}.bak`;
    try {
      await fs.copyFile(filePath, backupPath);
    } catch {
      // Sin backup previo no es error
    }

    await fs.writeFile(filePath, JSON.stringify(body, null, 2), 'utf-8');
    return reply.send({ ok: true, file });
  });
}
