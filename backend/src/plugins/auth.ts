/**
 * Auth Plugin — Fastify decorator para verificación JWT
 *
 * Registra:
 *   - request.auth: AccessTokenPayload | null
 *   - request.requireAuth(): AccessTokenPayload (lanza 401 si no hay)
 *   - request.requireCompany(): AccessTokenPayload con company_id garantizado
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { verifyAccessToken, AuthServiceError } from '../services/auth/service.js';
import type { AccessTokenPayload } from '../identity-types.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AccessTokenPayload | null;
    requireAuth(): AccessTokenPayload;
    requireCompany(): AccessTokenPayload & { company_id: string; company_name: string };
  }
}

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('auth', null);

  fastify.decorateRequest('requireAuth', function (this: FastifyRequest): AccessTokenPayload {
    if (!this.auth) {
      throw new AuthServiceError('TOKEN_INVALID', 'Autenticación requerida', 401);
    }
    return this.auth;
  });

  fastify.decorateRequest('requireCompany', function (
    this: FastifyRequest,
  ): AccessTokenPayload & { company_id: string; company_name: string } {
    const auth = this.requireAuth();
    if (!auth.company_id || !auth.company_name) {
      throw new AuthServiceError('COMPANY_NOT_SELECTED', 'Debe seleccionar una empresa primero', 403);
    }
    return auth as AccessTokenPayload & { company_id: string; company_name: string };
  });

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;

    try {
      request.auth = verifyAccessToken(header.slice(7));
    } catch {
      request.auth = null;
    }
  });

  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthServiceError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }
    throw error;
  });
}

export default fp(authPlugin, {
  name: 'auth-plugin',
  fastify: '5.x',
});
