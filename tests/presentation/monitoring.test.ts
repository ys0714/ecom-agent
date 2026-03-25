import { describe, it, expect, vi } from 'vitest';
import { buildServer } from '../../src/presentation/server.js';
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
import { Logger } from '../../src/infra/adapters/logger.js';
import os from 'node:os';
import path from 'node:path';

describe('Monitoring endpoints', () => {
  const tmpDir = path.join(os.tmpdir(), `mon-${Date.now()}`);
  const redis = new InMemoryRedisClient();
  const profileStore = new ProfileStore(redis, path.join(tmpDir, 'profiles'));
  const eventBus = new InMemoryEventBus();
  const metricsSubscriber = new MetricsSubscriber();
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

  const app = buildServer({ agent, profileStore, config, metricsSubscriber, redis });

  it('GET /health returns deep health check with checks object', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body.checks).toBeDefined();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeTruthy();
  });

  it('GET /health includes redis check when redis provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(body.checks).toHaveProperty('redis');
    expect(body.checks.redis.status).toBe('ok');
  });

  it('GET /api/metrics returns business metrics', async () => {
    eventBus.publish(createEvent('model:inference', { latencyMs: 100 }));
    eventBus.publish(createEvent('model:inference', { latencyMs: 200 }));
    eventBus.publish(createEvent('guardrail:blocked', { reason: 'test' }));

    const res = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.inference.totalCalls).toBe(2);
    expect(body.inference.avgLatencyMs).toBe(150);
    expect(body.guardrails.blockedCount).toBe(1);
    expect(body.system).toHaveProperty('memoryMB');
  });
});

describe('Logger', () => {
  it('outputs JSON structured logs', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new Logger('test', 'info');

    logger.info('hello world', { userId: 'u1' });

    expect(writeSpy).toHaveBeenCalledOnce();
    const output = writeSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('hello world');
    expect(parsed.module).toBe('test');
    expect(parsed.timestamp).toBeTruthy();

    writeSpy.mockRestore();
  });

  it('respects min log level', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new Logger('test', 'warn');

    logger.debug('should not appear');
    logger.info('should not appear');
    expect(writeSpy).not.toHaveBeenCalled();

    logger.warn('should appear');
    expect(writeSpy).toHaveBeenCalledOnce();

    writeSpy.mockRestore();
  });

  it('writes errors to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = new Logger('test', 'error');

    logger.error('bad thing');
    expect(stderrSpy).toHaveBeenCalledOnce();

    stderrSpy.mockRestore();
  });

  it('creates child loggers with module prefix', () => {
    const logger = new Logger('parent');
    const child = logger.child('child');
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    child.info('test');
    const parsed = JSON.parse((writeSpy.mock.calls[0][0] as string).trim());
    expect(parsed.module).toBe('parent.child');

    writeSpy.mockRestore();
  });
});

describe('ConfigWatchSubscriber with audit', () => {
  it('records config changes to audit log', async () => {
    const sub = new ConfigWatchSubscriber();
    await sub.applyChange('SLIDING_WINDOW_SIZE', 20, 10, 'admin_api');
    await sub.applyChange('MIN_RECOMMEND_CONFIDENCE', 0.7, 0.5, 'flywheel');

    const log = sub.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log[0].key).toBe('SLIDING_WINDOW_SIZE');
    expect(log[0].newValue).toBe(20);
    expect(log[0].oldValue).toBe(10);
    expect(log[0].source).toBe('admin_api');
  });

  it('getLastChange returns most recent change for a key', async () => {
    const sub = new ConfigWatchSubscriber();
    await sub.applyChange('K', 1, 0);
    await sub.applyChange('K', 2, 1);

    const last = sub.getLastChange('K');
    expect(last?.newValue).toBe(2);
  });

  it('persists audit to JSONL file', async () => {
    const tmpDir2 = path.join(os.tmpdir(), `audit-${Date.now()}`);
    const sub = new ConfigWatchSubscriber(tmpDir2);
    await sub.applyChange('TEST_KEY', 'new', 'old');

    const fs = await import('node:fs/promises');
    const content = await fs.readFile(path.join(tmpDir2, 'config-audit.jsonl'), 'utf-8');
    const entry = JSON.parse(content.trim());
    expect(entry.key).toBe('TEST_KEY');
  });

  it('dispatches to registered handlers', async () => {
    const sub = new ConfigWatchSubscriber();
    let received: unknown = null;
    sub.onConfigChange('MY_KEY', (_k, v) => { received = v; });

    await sub.applyChange('MY_KEY', 42);
    expect(received).toBe(42);
  });
});
