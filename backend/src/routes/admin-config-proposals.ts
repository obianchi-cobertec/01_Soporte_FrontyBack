import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getIntakeStore } from '../services/intake-store/store.js';
import { getIdentityStore } from '../services/identity/store.js';
import { applyApprovedChange } from '../services/config-agent/applier.js';
import type { ConfigChangeType } from '../intake-store-types.js';

const DecisionBodySchema = z.object({
  reason: z.string().optional(),
});

function requireSupportLead(request: FastifyRequest, reply: FastifyReply): string | null {
  const auth = request.requireAuth();
  const store = getIdentityStore();
  const isAllowed = store.isSupportLead(auth.sub) || store.isSuperAdmin(auth.sub) || store.isAdmin(auth.sub);
  if (!isAllowed) {
    reply.status(403).send({ error: 'FORBIDDEN', message: 'Acceso denegado. Se requiere rol de administrador o responsable de soporte.' });
    return null;
  }
  return auth.sub;
}

export async function adminConfigProposalsRoutes(app: FastifyInstance): Promise<void> {

  app.get('/', async (request, reply) => {
    const userId = requireSupportLead(request, reply);
    if (!userId) return;
    const changeType = (request.query as Record<string, string>).change_type as ConfigChangeType | undefined;
    return reply.send(getIntakeStore().listConfigChangeLogs(changeType ? { change_type: changeType } : {}));
  });

  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = requireSupportLead(request, reply);
    if (!userId) return;
    const change = getIntakeStore().getConfigChangeLogById(request.params.id);
    if (!change) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Propuesta no encontrada.' });
    return reply.send(change);
  });

  app.post<{ Params: { id: string } }>('/:id/apply', async (request, reply) => {
    const userId = requireSupportLead(request, reply);
    if (!userId) return;
    const body = DecisionBodySchema.safeParse(request.body);
    try {
      await applyApprovedChange(request.params.id, userId, body.success ? body.data.reason : undefined);
      return reply.send({ ok: true, message: 'Cambio aplicado correctamente.' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al aplicar el cambio';
      return reply.status(400).send({ error: 'APPLY_FAILED', message: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/reject', async (request, reply) => {
    const userId = requireSupportLead(request, reply);
    if (!userId) return;
    const body = DecisionBodySchema.safeParse(request.body);
    getIntakeStore().updateConfigChangeDecision(request.params.id, {
      change_type: 'rejected' as ConfigChangeType,
      reviewed_by: userId,
      reason: body.success ? body.data.reason : undefined,
    });
    return reply.send({ ok: true, message: 'Propuesta rechazada.' });
  });
}
