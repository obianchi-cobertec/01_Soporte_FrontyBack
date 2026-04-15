/**
 * Identity Routes — /api/identity/*
 *
 * GET /identity/me — datos del usuario autenticado + empresa seleccionada + empresas disponibles
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getIdentityStore } from '../services/identity/store.js';
import type { MeResponse } from '../identity-types.js';

export async function identityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.requireAuth();
    const store = getIdentityStore();

    const user = store.getUserById(auth.sub);
    if (!user) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'Usuario no encontrado' });
    }

    const contact = store.getContactById(user.contact_id);
    if (!contact) {
      return reply.status(404).send({ error: 'CONTACT_NOT_FOUND', message: 'Contacto no encontrado' });
    }

    const companies = store.getCompaniesForUser(user.id);

    const currentCompany = auth.company_id
      ? companies.find((c) => c.id === auth.company_id) ?? null
      : null;

    const response: MeResponse = {
      user_id: user.id,
      is_superadmin: store.isSuperAdmin(user.id),
      contact: {
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
      },
      company: currentCompany,
      companies,
    };

    return reply.status(200).send(response);
  });
}
