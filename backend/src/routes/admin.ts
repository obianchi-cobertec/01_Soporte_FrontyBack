/**
 * Admin Routes — /api/admin/*
 *
 * CRUD de usuarios y empresas. Solo accesible para usuarios con rol 'admin'.
 *
 * Usuarios:
 *   GET    /admin/users                  — listar todos
 *   POST   /admin/users                  — crear usuario
 *   PATCH  /admin/users/:id              — editar usuario/contacto
 *   DELETE /admin/users/:id              — desactivar (soft delete)
 *   POST   /admin/users/:id/companies    — asignar empresa
 *   DELETE /admin/users/:id/companies/:companyId — desasignar
 *
 * Empresas:
 *   GET    /admin/companies              — listar todas
 *   POST   /admin/companies              — crear empresa
 *   PATCH  /admin/companies/:id          — editar empresa
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getIdentityStore } from '../services/identity/store.js';
import { hashPassword, AuthServiceError } from '../services/auth/service.js';

// ─── Validation schemas ─────────────────────────────────

const CreateUserSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  email: z.string().email('Email no válido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  phone: z.string().nullable().optional(),
  company_ids: z.array(z.string().uuid()).optional(),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

const CreateCompanySchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  redmine_project_id: z.string().nullable().optional(),
});

const UpdateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  redmine_project_id: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

const LinkCompanySchema = z.object({
  company_id: z.string().uuid('company_id no válido'),
  role: z.enum(['user', 'admin']).optional(),
});

// ─── Admin guard ────────────────────────────────────────

function requireAdmin(request: FastifyRequest): void {
  const auth = request.requireAuth();
  const store = getIdentityStore();
  if (!store.isAdmin(auth.sub)) {
    throw new AuthServiceError('COMPANY_NOT_AUTHORIZED', 'Acceso restringido a administradores', 403);
  }
}

// ─── Redmine projects cache ──────────────────────────────

const REDMINE_URL = process.env.REDMINE_URL ?? '';
const REDMINE_API_KEY = process.env.REDMINE_API_KEY ?? '';

let _redmineProjectsCache: { id: number; identifier: string; name: string }[] | null = null;
let _redmineProjectsCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Routes ─────────────────────────────────────────────

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── Users ──────────────────────────────────────────

  fastify.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
    requireAdmin(request);
    const store = getIdentityStore();
    const rows = store.listUsers();

    const users = rows.map((r) => ({
      user_id: r.user_id,
      contact_id: r.contact_id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      active: Boolean(r.active),
      last_login: r.last_login,
      created_at: r.created_at,
      companies: JSON.parse(r.companies),
    }));

    return reply.send({ users });
  });

  fastify.post('/users', async (request: FastifyRequest, reply: FastifyReply) => {
    requireAdmin(request);
    const parsed = CreateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const store = getIdentityStore();
    const { name, email, password, phone, company_ids } = parsed.data;

    // Check duplicate email
    const existing = store.getContactByEmail(email);
    if (existing) {
      return reply.status(409).send({
        error: 'EMAIL_EXISTS',
        message: 'Ya existe un usuario con ese email',
      });
    }

    const contact = store.createContact({ name, email, phone: phone ?? null });
    const passwordHash = await hashPassword(password);
    const user = store.createUser({ contact_id: contact.id, password_hash: passwordHash });

    if (company_ids && company_ids.length > 0) {
      for (const cid of company_ids) {
        store.linkUserCompany(user.id, cid);
      }
    }

    const companies = store.getCompaniesForUser(user.id);

    return reply.status(201).send({
      user_id: user.id,
      contact_id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      active: true,
      companies,
    });
  });

  fastify.patch('/users/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    requireAdmin(request);
    const parsed = UpdateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const store = getIdentityStore();
    const userId = request.params.id;
    const user = store.getUserById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Usuario no encontrado' });
    }

    const { name, email, phone, active, password } = parsed.data;

    // Check duplicate email if changing
    if (email) {
      const existing = store.getContactByEmail(email);
      if (existing && existing.id !== user.contact_id) {
        return reply.status(409).send({
          error: 'EMAIL_EXISTS',
          message: 'Ya existe un usuario con ese email',
        });
      }
    }

    store.updateContact(user.contact_id, { name, email, phone });

    if (active !== undefined) {
      store.updateUserActive(userId, active);
    }

    if (password) {
      const passwordHash = await hashPassword(password);
      store.updateUserPassword(userId, passwordHash);
    }

    return reply.send({ ok: true });
  });

  fastify.delete('/users/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    requireAdmin(request);
    const store = getIdentityStore();
    const userId = request.params.id;
    const user = store.getUserById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Usuario no encontrado' });
    }

    store.updateUserActive(userId, false);
    return reply.send({ ok: true, message: 'Usuario desactivado' });
  });

  // ─── User ↔ Company links ──────────────────────────

  fastify.post('/users/:id/companies', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    requireAdmin(request);
    const parsed = LinkCompanySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const store = getIdentityStore();
    const userId = request.params.id;

    const user = store.getUserById(userId);
    if (!user) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Usuario no encontrado' });
    }

    const company = store.getCompanyById(parsed.data.company_id);
    if (!company) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Empresa no encontrada' });
    }

    store.linkUserCompany(userId, parsed.data.company_id, parsed.data.role ?? 'user');
    return reply.status(201).send({ ok: true });
  });

  fastify.delete('/users/:id/companies/:companyId', async (
    request: FastifyRequest<{ Params: { id: string; companyId: string } }>,
    reply: FastifyReply,
  ) => {
    requireAdmin(request);
    const store = getIdentityStore();
    store.unlinkUserCompany(request.params.id, request.params.companyId);
    return reply.send({ ok: true });
  });

  // ─── Companies ──────────────────────────────────────

  fastify.get('/companies', async (request: FastifyRequest, reply: FastifyReply) => {
    requireAdmin(request);
    const store = getIdentityStore();
    const companies = store.listCompanies();

    return reply.send({
      companies: companies.map((c) => ({
        ...c,
        active: Boolean(c.active),
      })),
    });
  });

  fastify.post('/companies', async (request: FastifyRequest, reply: FastifyReply) => {
    requireAdmin(request);
    const parsed = CreateCompanySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const store = getIdentityStore();
    const company = store.createCompany({
      name: parsed.data.name,
      redmine_project_id: parsed.data.redmine_project_id ?? null,
    });

    return reply.status(201).send({
      id: company.id,
      name: company.name,
      redmine_project_id: company.redmine_project_id,
      active: true,
      user_count: 0,
    });
  });

  fastify.get('/redmine-projects', async (request: FastifyRequest, reply: FastifyReply) => {
    requireAdmin(request);

    const refresh = (request.query as Record<string, string>).refresh === 'true';
    const now = Date.now();

    if (!refresh && _redmineProjectsCache && (now - _redmineProjectsCacheTime) < CACHE_TTL_MS) {
      return reply.send({ projects: _redmineProjectsCache });
    }

    if (!REDMINE_URL || !REDMINE_API_KEY) {
      return reply.status(503).send({ error: 'REDMINE_NOT_CONFIGURED', message: 'Redmine no está configurado' });
    }

    const projects: { id: number; identifier: string; name: string }[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const res = await fetch(`${REDMINE_URL}/projects.json?limit=${limit}&offset=${offset}&include=`, {
        headers: { 'Content-Type': 'application/json', 'X-Redmine-API-Key': REDMINE_API_KEY },
      });

      if (!res.ok) {
        return reply.status(502).send({ error: 'REDMINE_ERROR', message: `Error al obtener proyectos (${res.status})` });
      }

      const data = await res.json() as {
        projects: { id: number; identifier: string; name: string; status: number }[];
        total_count: number;
      };

      projects.push(
        ...data.projects
          .filter((p) => p.status === 1)
          .map((p) => ({ id: p.id, identifier: p.identifier, name: p.name })),
      );

      if (offset + limit >= data.total_count) break;
      offset += limit;
    }

    _redmineProjectsCache = projects;
    _redmineProjectsCacheTime = Date.now();

    return reply.send({ projects });
  });

  fastify.patch('/companies/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    requireAdmin(request);
    const parsed = UpdateCompanySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const store = getIdentityStore();
    const company = store.getCompanyById(request.params.id);
    if (!company) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Empresa no encontrada' });
    }

    store.updateCompany(request.params.id, parsed.data);
    return reply.send({ ok: true });
  });
}
