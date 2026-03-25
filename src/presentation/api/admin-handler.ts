import type { FastifyInstance } from 'fastify';

export function registerAdminRoutes(app: FastifyInstance) {
  app.get('/api/admin/status', async () => ({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  }));

  app.post('/api/admin/flywheel/trigger', async (_request, reply) => {
    return reply.send({ status: 'accepted', message: 'Flywheel trigger queued (not yet implemented)' });
  });
}
