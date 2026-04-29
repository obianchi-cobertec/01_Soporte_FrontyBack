/**
 * User Request Routes — /api/requests/*
 *
 * Pública:
 *   GET  /requests/companies       — lista de empresas activas (para el selector del formulario)
 *   POST /requests                 — nueva solicitud de alta (sin autenticación)
 *
 * Admin:
 *   GET    /requests/admin         — listar solicitudes (filtrables por status)
 *   POST   /requests/admin/:id/approve — aprobar → crea usuario en Redmine + identity.db + envía email
 *   POST   /requests/admin/:id/reject  — rechazar → envía email de rechazo
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getIdentityStore } from '../services/identity/store.js';
import { hashPassword, AuthServiceError } from '../services/auth/service.js';
import { getMailer } from '../services/mailer/index.js';
import { UserRequestFormSchema, RejectRequestSchema } from '../identity-types.js';

// ─── Redmine API helper ──────────────────────────────────

const REDMINE_URL = process.env.REDMINE_URL ?? '';
const REDMINE_API_KEY = process.env.REDMINE_API_KEY ?? '';
const REDMINE_CLIENT_ROLE_ID = 6; // Cliente SAT

// ⚠️ PENDIENTE DE PRODUCCIÓN: cambiar a soporte@cobertec.com + j.quintanilla@cobertec.com
const ADMIN_NOTIFICATION_EMAILS = ['o.bianchi@cobertec.com'];

async function redmineFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${REDMINE_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Redmine-API-Key': REDMINE_API_KEY,
      ...(options.headers ?? {}),
    },
  });
}

interface RedmineUserPayload {
  login: string;
  firstname: string;
  lastname: string;
  mail: string;
  password: string;
  status: number;
}

async function createRedmineUser(payload: RedmineUserPayload): Promise<number> {
  const res = await redmineFetch('/users.json', {
    method: 'POST',
    body: JSON.stringify({ user: payload }),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    let detail = '';
    try {
      const parsed = JSON.parse(bodyText) as { errors?: string[] };
      if (parsed.errors?.length) detail = parsed.errors.join(', ');
    } catch { /* body no era JSON */ }
    throw new Error(detail || `Error al crear el usuario en Redmine (${res.status})`);
  }

  const data = await res.json() as { user: { id: number } };
  return data.user.id;
}

async function addRedmineMembership(projectId: string, redmineUserId: number): Promise<void> {
  const res = await redmineFetch(`/projects/${projectId}/memberships.json`, {
    method: 'POST',
    body: JSON.stringify({
      membership: {
        user_id: redmineUserId,
        role_ids: [REDMINE_CLIENT_ROLE_ID],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // No lanzamos: la membresía fallida no debe bloquear el alta
    console.error(`Redmine addMembership warning (${res.status}): ${body}`);
  }
}

// ─── Generador de contraseña temporal ───────────────────

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 8; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

// ─── Admin guard ─────────────────────────────────────────

function requireAdmin(request: FastifyRequest): void {
  const auth = request.requireAuth();
  const store = getIdentityStore();
  if (!store.isAdmin(auth.sub)) {
    throw new AuthServiceError('COMPANY_NOT_AUTHORIZED', 'Acceso restringido a administradores', 403);
  }
}

// ─── Routes ──────────────────────────────────────────────

export async function requestRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── Pública: lista de empresas para el selector ──────

  fastify.get('/companies', async (_request: FastifyRequest, reply: FastifyReply) => {
    const store = getIdentityStore();
    const companies = store.listActiveCompanies();
    return reply.send({ companies });
  });

  // ─── Pública: nueva solicitud de alta ─────────────────

  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = UserRequestFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const store = getIdentityStore();
    const { first_name, last_name, email, company_name, phone } = parsed.data;

    // Verificar que no existe ya un usuario con ese email
    const existingContact = store.getContactByEmail(email);
    if (existingContact) {
      return reply.status(409).send({
        error: 'EMAIL_EXISTS',
        message: 'Ya existe una cuenta con ese email. Si olvidaste tu contraseña, usa la opción de recuperación.',
      });
    }

    const userRequest = store.createUserRequest({
      first_name,
      last_name,
      email,
      company_name_requested: company_name,
      phone,
    });

    // Notificar a los admins
    const mailer = getMailer();
    await mailer.sendAdminNewRequestNotification({
      to: ADMIN_NOTIFICATION_EMAILS,
      request: {
        id: userRequest.id,
        first_name,
        last_name,
        email,
        company_name: company_name,
        phone: phone ?? null,
        created_at: userRequest.created_at,
      },
    }).catch((err: unknown) => {
      console.error('[requests] Error sending admin notification:', err);
    });

    return reply.status(201).send({ ok: true, request_id: userRequest.id });
  });

  // ─── Admin: listar solicitudes ────────────────────────

  fastify.get('/admin', async (request: FastifyRequest, reply: FastifyReply) => {
    requireAdmin(request);

    const query = (request.query as Record<string, string>);
    const statusFilter = query.status as 'pending' | 'approved' | 'rejected' | undefined;

    const store = getIdentityStore();
    const requests = store.listUserRequests(statusFilter);

    return reply.send({ requests });
  });

  // ─── Admin: editar solicitud pendiente ───────────────

  fastify.patch('/admin/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    requireAdmin(request);

    const parsed = UserRequestFormSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const store = getIdentityStore();
    const userRequest = store.getUserRequestById(request.params.id);

    if (!userRequest) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Solicitud no encontrada' });
    }
    if (userRequest.status !== 'pending') {
      return reply.status(409).send({ error: 'ALREADY_PROCESSED', message: 'Solo se pueden editar solicitudes pendientes' });
    }

    if (parsed.data.company_id) {
      const company = store.getCompanyById(parsed.data.company_id);
      if (!company || !company.active) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Empresa no encontrada' });
      }
    }

    store.updateUserRequest(request.params.id, {
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      company_id: parsed.data.company_id,
      company_name_requested: parsed.data.company_name,
      phone: parsed.data.phone,
    });
    return reply.send({ ok: true });
  });

  // ─── Admin: aprobar solicitud ─────────────────────────

  fastify.post('/admin/:id/approve', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    requireAdmin(request);

    const store = getIdentityStore();
    const userRequest = store.getUserRequestById(request.params.id);

    if (!userRequest) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Solicitud no encontrada' });
    }
    if (userRequest.status !== 'pending') {
      return reply.status(409).send({ error: 'ALREADY_PROCESSED', message: 'La solicitud ya fue procesada' });
    }

    if (!userRequest.company_id) {
      return reply.status(409).send({ error: 'COMPANY_NOT_ASSIGNED', message: 'Debes asignar una empresa antes de aprobar. Edita la solicitud primero.' });
    }
    const company = store.getCompanyById(userRequest.company_id);
    if (!company) {
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Empresa no encontrada' });
    }

    // Generar login único para Redmine
    const companySlug = company.name;
    const redmineLogin = store.generateRedmineLogin(
      userRequest.first_name,
      userRequest.last_name,
      companySlug,
    );

    const tempPassword = generateTempPassword();

    // 1. Crear usuario en Redmine (si está configurado)
    let redmineUserId: number | null = null;
    if (REDMINE_URL && REDMINE_API_KEY) {
      try {
        redmineUserId = await createRedmineUser({
          login: redmineLogin,
          firstname: userRequest.first_name,
          lastname: userRequest.last_name,
          mail: userRequest.email,
          password: tempPassword,
          status: 1,
        });

        // 2. Añadir membresía al proyecto de la empresa (si tiene redmine_project_id)
        if (company.redmine_project_id) {
          await addRedmineMembership(company.redmine_project_id, redmineUserId);
        }
      } catch (err) {
        console.error('[requests/approve] Redmine error:', err);
        const detail = err instanceof Error ? err.message : 'Error desconocido';
        return reply.status(502).send({
          error: 'REDMINE_ERROR',
          message: `Error al crear el usuario en Redmine: ${detail}. La solicitud no fue procesada.`,
        });
      }
    }

    // 3. Crear contacto + usuario en identity.db
    const contact = store.createContact({
      name: `${userRequest.first_name} ${userRequest.last_name}`,
      email: userRequest.email,
      phone: userRequest.phone,
    });

    const passwordHash = await hashPassword(tempPassword);
    const user = store.createUser({
      contact_id: contact.id,
      password_hash: passwordHash,
      must_change_password: true,
      redmine_login: redmineLogin,
      redmine_user_id: redmineUserId ?? undefined,
    });

    store.linkUserCompany(user.id, company.id, 'user');

    // 4. Marcar solicitud como aprobada
    store.approveUserRequest(userRequest.id, redmineUserId ?? 0);

    // 5. Enviar email de bienvenida al usuario
    const mailer = getMailer();
    await mailer.sendWelcomeEmail({
      to: userRequest.email,
      first_name: userRequest.first_name,
      login: redmineLogin,
      temp_password: tempPassword,
      company_name: company.name,
    }).catch((err: unknown) => {
      console.error('[requests/approve] Error sending welcome email:', err);
    });

    return reply.send({
      ok: true,
      user_id: user.id,
      redmine_login: redmineLogin,
      redmine_user_id: redmineUserId,
    });
  });

  // ─── Admin: rechazar solicitud ────────────────────────

  fastify.post('/admin/:id/reject', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    requireAdmin(request);

    const parsed = RejectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const store = getIdentityStore();
    const userRequest = store.getUserRequestById(request.params.id);

    if (!userRequest) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Solicitud no encontrada' });
    }
    if (userRequest.status !== 'pending') {
      return reply.status(409).send({ error: 'ALREADY_PROCESSED', message: 'La solicitud ya fue procesada' });
    }

    store.rejectUserRequest(userRequest.id, parsed.data.reason);

    // Enviar email de rechazo
    const mailer = getMailer();
    const company = userRequest.company_id ? store.getCompanyById(userRequest.company_id) : null;
    await mailer.sendRejectionEmail({
      to: userRequest.email,
      first_name: userRequest.first_name,
      reason: parsed.data.reason,
      company_name: company?.name ?? userRequest.company_name_requested,
    }).catch((err: unknown) => {
      console.error('[requests/reject] Error sending rejection email:', err);
    });

    return reply.send({ ok: true });
  });
}
