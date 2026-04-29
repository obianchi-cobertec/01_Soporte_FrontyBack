/**
 * Auth Routes — /api/auth/*
 *
 * POST /auth/token    — OAuth 2.0 token endpoint
 * POST /auth/select   — company_id → access_token con company embebida
 * POST /auth/logout   — invalida refresh token
 * PUT  /auth/password — cambia contraseña (requiere auth)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  TokenRequestSchema,
  SelectCompanyRequestSchema,
  ChangePasswordRequestSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
} from '../identity-types.js';
import {
  login,
  selectCompany,
  refresh,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  AuthServiceError,
} from '../services/auth/service.js';

const REFRESH_COOKIE_NAME = 'cobertec_refresh';
const IS_PROD = process.env.NODE_ENV === 'production';

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60,
  });
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
    path: '/api/auth',
  });
}

function getRefreshCookie(request: FastifyRequest): string | undefined {
  return request.cookies?.[REFRESH_COOKIE_NAME];
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── OAuth 2.0 Token endpoint ───────────────────────────
  fastify.post('/token', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        errorResponseBuilder: (_req: FastifyRequest, ctx: { ttl: number; statusCode: number }) => {
          const msg = `Demasiados intentos. Espera ${Math.ceil(ctx.ttl / 1000)} segundos antes de volver a intentarlo.`;
          const err = Object.assign(new Error(msg), { statusCode: 429, error: 'TOO_MANY_REQUESTS' });
          return err;
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = TokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const data = parsed.data;

    if (data.grant_type === 'password') {
      const { tokenResponse, refreshToken } = await login(data.email, data.password);
      setRefreshCookie(reply, refreshToken);
      return reply.status(200).send(tokenResponse);
    }

    if (data.grant_type === 'refresh_token') {
      const cookie = getRefreshCookie(request);
      if (!cookie) {
        throw new AuthServiceError('NO_REFRESH_TOKEN', 'No se encontró refresh token', 401);
      }
      const { refreshResponse, newRefreshToken } = refresh(cookie);
      setRefreshCookie(reply, newRefreshToken);
      return reply.status(200).send(refreshResponse);
    }
  });

  // ─── Select company ──────────────────────────────────────
  fastify.post('/select', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.requireAuth();

    const parsed = SelectCompanyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const result = selectCompany(auth, parsed.data.company_id);
    return reply.status(200).send(result);
  });

  // ─── Change password ─────────────────────────────────────
  fastify.put('/password', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.requireAuth();

    const parsed = ChangePasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    await changePassword(auth.sub, parsed.data.current_password, parsed.data.new_password);
    return reply.status(200).send({ ok: true });
  });

  // ─── Forgot password ─────────────────────────────────────
  fastify.post('/forgot-password', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '10 minutes',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ForgotPasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    // Siempre responde 200 — no revelamos si el email existe
    await forgotPassword(parsed.data.email);
    return reply.status(200).send({ ok: true });
  });

  // ─── Reset password ──────────────────────────────────────
  fastify.post('/reset-password', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '10 minutes',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ResetPasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }
    await resetPassword(parsed.data.token, parsed.data.new_password);
    return reply.status(200).send({ ok: true });
  });

  // ─── Logout ─────────────────────────────────────────────
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getRefreshCookie(request);
    logout(token);
    clearRefreshCookie(reply);
    return reply.status(204).send();
  });
}
