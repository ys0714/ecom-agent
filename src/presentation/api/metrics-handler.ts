import type { FastifyInstance } from 'fastify';
import type { MetricsSubscriber } from '../../application/subscribers/metrics-subscriber.js';
import type { SpecRecommendationEvaluator } from '../../application/services/data-flywheel/evaluator.js';

export function registerMetricsRoutes(
  app: FastifyInstance,
  metricsSubscriber: MetricsSubscriber,
  evaluator?: SpecRecommendationEvaluator,
) {
  app.get('/api/metrics', async () => {
    const snapshot = metricsSubscriber.getSnapshot();
    const evaluation = evaluator?.evaluate();

    return {
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      system: {
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        cpuUser: process.cpuUsage().user,
      },
      inference: {
        totalCalls: snapshot.inferenceCount,
        avgLatencyMs: snapshot.avgLatencyMs,
        fallbackCount: snapshot.fallbackCount,
        fallbackRate: snapshot.inferenceCount > 0
          ? Math.round((snapshot.fallbackCount / snapshot.inferenceCount) * 100) / 100
          : 0,
      },
      guardrails: {
        blockedCount: snapshot.guardrailBlockCount,
      },
      errors: {
        totalErrors: snapshot.errorCount,
      },
      ...(evaluation ? {
        recommendation: {
          totalRecommendations: evaluation.totalRecommendations,
          accuracyRate: evaluation.accuracyRate,
          acceptRate: evaluation.acceptRate,
          coverageHitRate: evaluation.coverageHitRate,
          fallbackRate: evaluation.fallbackRate,
        },
      } : {}),
    };
  });
}
