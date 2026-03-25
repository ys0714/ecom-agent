import type { FastifyInstance } from 'fastify';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import type { MetricsSubscriber } from '../../application/subscribers/metrics-subscriber.js';

const register = new Registry();
collectDefaultMetrics({ register });

export const promMetrics = {
  inferenceTotal: new Counter({ name: 'ecom_inference_total', help: 'Total inference calls', labelNames: ['model', 'fallback'], registers: [register] }),
  inferenceLatency: new Histogram({ name: 'ecom_inference_latency_ms', help: 'Inference latency in ms', buckets: [50, 100, 200, 500, 1000, 2000, 5000], registers: [register] }),
  guardrailBlocked: new Counter({ name: 'ecom_guardrail_blocked_total', help: 'Guardrail blocks', labelNames: ['layer'], registers: [register] }),
  errorsTotal: new Counter({ name: 'ecom_errors_total', help: 'Total errors', registers: [register] }),
  recommendationTotal: new Counter({ name: 'ecom_recommendation_total', help: 'Total recommendations', labelNames: ['method', 'outcome'], registers: [register] }),
  profileCompleteness: new Gauge({ name: 'ecom_profile_completeness', help: 'Average profile completeness', registers: [register] }),
  activeSessions: new Gauge({ name: 'ecom_active_sessions', help: 'Active sessions count', registers: [register] }),
};

export function registerMetricsRoutes(app: FastifyInstance, metricsSubscriber?: MetricsSubscriber) {
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });

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

export { register as prometheusRegistry };
