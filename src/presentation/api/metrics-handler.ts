import type { FastifyInstance } from 'fastify';
import type { MetricsSubscriber } from '../../application/subscribers/metrics-subscriber.js';

export function registerMetricsRoutes(app: FastifyInstance, metricsSubscriber?: MetricsSubscriber) {
  app.get('/api/metrics', async () => {
    const snapshot = metricsSubscriber?.getSnapshot();
    return {
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      system: {
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      inference: snapshot ? {
        totalCalls: snapshot.inferenceCount,
        avgLatencyMs: snapshot.avgLatencyMs,
        fallbackCount: snapshot.fallbackCount,
      } : null,
      guardrails: snapshot ? { blockedCount: snapshot.guardrailBlockCount } : null,
      errors: snapshot ? { totalErrors: snapshot.errorCount } : null,
    };
  });
}
