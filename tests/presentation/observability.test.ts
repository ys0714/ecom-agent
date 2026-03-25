import { describe, it, expect, vi } from 'vitest';
import { buildServer, type ServerDeps } from '../../src/presentation/server.js';
import { Agent } from '../../src/application/agent.js';
import { ProfileStore } from '../../src/application/services/profile-store.js';
import { ModelSlotManager } from '../../src/application/services/model-slot/model-slot-manager.js';
import { IntentRouter } from '../../src/application/workflow/intent-router.js';
import { ColdStartManager } from '../../src/application/services/profile-engine/cold-start-manager.js';
import { MetricsSubscriber } from '../../src/application/subscribers/metrics-subscriber.js';
import { ConfigWatchSubscriber } from '../../src/application/subscribers/config-watch-subscriber.js';
import { InMemoryEventBus, createEvent } from '../../src/domain/event-bus.js';
import { InMemoryRedisClient } from '../../src/infra/adapters/redis.js';
import { config } from '../../src/infra/config.js';
import os from 'node:os';
import path from 'node:path';

function buildTestServer() {
  const tmpDir = path.join(os.tmpdir(), `obs-${Date.now()}`);
  const redis = new InMemoryRedisClient();
  const profileStore = new ProfileStore(redis, path.join(tmpDir, 'profiles'));
  const eventBus = new InMemoryEventBus();
  const metricsSubscriber = new MetricsSubscriber();
  const configWatch = new ConfigWatchSubscriber(tmpDir);
  eventBus.register(metricsSubscriber);

  const modelSlotManager = new ModelSlotManager(eventBus, () => ({
    chat: vi.fn().mockResolvedValue('ok'),
  }));
  modelSlotManager.registerSlot('conversation', 'conversation',
    { name: 'mock', endpoint: '', modelId: 'mock', maxTokens: 10, temperature: 0.7, timeoutMs: 5000 },
    { batchSize: 1, enableFallback: false, cacheTTL: 0, maxRetries: 0, retryDelayMs: 0 },
  );

  const agent = new Agent({
    eventBus, profileStore, modelSlotManager,
    intentRouter: new IntentRouter(),
    coldStartManager: new ColdStartManager(),
  });

  const app = buildServer({ agent, profileStore, config, metricsSubscriber, configWatch, redis });
  return { app, eventBus, metricsSubscriber, configWatch };
}

describe('Prometheus /metrics endpoint', () => {
  it('returns Prometheus text format', async () => {
    const { app } = buildTestServer();
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('# HELP');
    expect(res.body).toContain('# TYPE');
    expect(res.body).toContain('ecom_inference_total');
    expect(res.body).toContain('ecom_guardrail_blocked_total');
    expect(res.body).toContain('ecom_inference_latency_ms');
  });

  it('/api/metrics returns JSON format (backward compat)', async () => {
    const { app } = buildTestServer();
    const res = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.timestamp).toBeTruthy();
    expect(body.system).toHaveProperty('memoryMB');
  });
});

describe('Config rollback API', () => {
  it('GET /api/admin/config/audit returns audit log', async () => {
    const { app, configWatch } = buildTestServer();
    await configWatch.applyChange('TEST_KEY', 'new', 'old', 'test');

    const res = await app.inject({ method: 'GET', url: '/api/admin/config/audit' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.entries[0].key).toBe('TEST_KEY');
  });

  it('POST /api/admin/config/rollback restores previous value', async () => {
    const { app, configWatch } = buildTestServer();
    await configWatch.applyChange('WINDOW_SIZE', 20, 10, 'admin');

    const res = await app.inject({
      method: 'POST', url: '/api/admin/config/rollback',
      payload: { key: 'WINDOW_SIZE' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('rolled_back');
    expect(body.restoredValue).toBe(10);
    expect(body.previousValue).toBe(20);
  });

  it('rollback returns 404 for unknown key', async () => {
    const { app } = buildTestServer();
    const res = await app.inject({
      method: 'POST', url: '/api/admin/config/rollback',
      payload: { key: 'NONEXISTENT' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rollback returns 400 when key missing', async () => {
    const { app } = buildTestServer();
    const res = await app.inject({
      method: 'POST', url: '/api/admin/config/rollback',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
