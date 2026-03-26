import type { FastifyInstance } from 'fastify';
import type { ConfigWatchSubscriber } from '../../application/subscribers/config-watch-subscriber.js';
import type { AutoPromptSubscriber } from '../../application/subscribers/auto-prompt-subscriber.js';

export function registerAdminRoutes(app: FastifyInstance, configWatch?: ConfigWatchSubscriber, autoPrompt?: AutoPromptSubscriber) {
  app.get('/api/admin/status', async () => ({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  }));

  app.post('/api/admin/flywheel/trigger', async (_request, reply) => {
    if (!autoPrompt) {
      return reply.status(503).send({ error: 'AutoPrompt pipeline is not configured' });
    }
    
    // Fire and forget so we don't block
    autoPrompt.runFlywheel().catch(err => {
      app.log.error(err, 'Failed to run flywheel pipeline manually');
    });
    
    return reply.send({ status: 'accepted', message: 'Flywheel trigger executing' });
  });

  if (configWatch) {
    app.get('/api/admin/config/audit', async () => ({
      entries: configWatch.getAuditLog(),
      total: configWatch.getAuditLog().length,
    }));

    app.post<{ Body: { key: string } }>('/api/admin/config/rollback', async (request, reply) => {
      const { key } = request.body as { key: string };
      if (!key) return reply.status(400).send({ error: 'key is required' });

      const lastChange = configWatch.getLastChange(key);
      if (!lastChange) return reply.status(404).send({ error: `No history found for key: ${key}` });

      await configWatch.applyChange(key, lastChange.oldValue, lastChange.newValue, 'rollback');

      return reply.send({
        status: 'rolled_back',
        key,
        restoredValue: lastChange.oldValue,
        previousValue: lastChange.newValue,
      });
    });
  }
}
