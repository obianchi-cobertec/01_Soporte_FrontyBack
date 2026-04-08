import type { FastifyInstance } from 'fastify';
import { getPilotMetrics, getEventsBySession, getEventsByType } from '../services/events/index.js';

export async function metricsRoutes(app: FastifyInstance): Promise<void> {

  app.get('/api/metrics', async (_request, reply) => {
    try {
      const metrics = getPilotMetrics();
      return reply.status(200).send(metrics);
    } catch (error) {
      return reply.status(500).send({
        error: 'No se pudieron obtener las métricas',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  app.get('/api/metrics/recent', async (_request, reply) => {
    try {
      const ticketEvents = getEventsByType('ticket_created', 50);
      const classificationEvents = getEventsByType('classification_completed', 50);

      const recent = ticketEvents.map(te => {
        const classEvent = classificationEvents.find(
          ce => ce.session_id === te.session_id
        );
        return {
          session_id: te.session_id,
          ticket_id: te.data.ticket_id,
          created_at: te.timestamp,
          nature: classEvent?.data.nature ?? 'unknown',
          domain: classEvent?.data.domain ?? 'unknown',
          confidence: classEvent?.data.confidence ?? 'unknown',
          review_status: classEvent?.data.review_status ?? 'unknown',
          duration_ms: classEvent?.data.duration_ms ?? null,
        };
      });

      return reply.status(200).send({ tickets: recent });
    } catch (error) {
      return reply.status(500).send({
        error: 'No se pudieron obtener los tickets recientes',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  app.get('/api/metrics/session/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    try {
      const events = getEventsBySession(sessionId);
      return reply.status(200).send({ session_id: sessionId, events });
    } catch (error) {
      return reply.status(500).send({
        error: 'No se pudieron obtener los eventos',
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });
}
