import { describe, it, expect, vi, beforeAll } from 'vitest';
import { buildServer } from '../../src/presentation/server.js';
import { Agent } from '../../src/application/agent.js';
import { ProfileStore } from '../../src/application/services/profile-store.js';
import { SessionManager } from '../../src/application/services/session-manager.js';
import { ModelSlotManager } from '../../src/application/services/model-slot/model-slot-manager.js';
import { IntentRouter } from '../../src/application/workflow/intent-router.js';
import { ColdStartManager } from '../../src/application/services/profile-engine/cold-start-manager.js';
import { MockProductService } from '../../src/infra/adapters/product-service.js';
import { InMemoryEventBus } from '../../src/domain/event-bus.js';
import { InMemoryRedisClient } from '../../src/infra/adapters/redis.js';
import { UserProfileEntity } from '../../src/domain/entities/user-profile.entity.js';
import { buildProfileFromOrders } from '../../src/application/services/profile-engine/order-analyzer.js';
import { MockOrderService } from '../../src/infra/adapters/order-service.js';
import { config } from '../../src/infra/config.js';
import os from 'node:os';
import path from 'node:path';

describe('Last Mile Integration: end-to-end recommendation flow', () => {
  const tmpDir = path.join(os.tmpdir(), `e2e-${Date.now()}`);
  const redis = new InMemoryRedisClient();
  const profileStore = new ProfileStore(redis, path.join(tmpDir, 'profiles'));
  const sessionManager = new SessionManager(path.join(tmpDir, 'sessions'));
  const eventBus = new InMemoryEventBus();
  const productService = new MockProductService();

  const modelSlotManager = new ModelSlotManager(eventBus, () => ({
    chat: vi.fn().mockResolvedValue('根据您的身高体重，推荐 M 码。'),
  }));
  modelSlotManager.registerSlot('conversation', 'conversation',
    { name: 'mock', endpoint: '', modelId: 'mock', maxTokens: 100, temperature: 0.7, timeoutMs: 5000 },
    { batchSize: 1, enableFallback: false, cacheTTL: 0, maxRetries: 0, retryDelayMs: 0 },
  );

  const agent = new Agent({
    eventBus, profileStore, modelSlotManager,
    intentRouter: new IntentRouter(),
    coldStartManager: new ColdStartManager(),
    productService,
    slidingWindowSize: 10,
  });

  const app = buildServer(agent, profileStore, config, sessionManager);

  beforeAll(async () => {
    const orders = await new MockOrderService().getOrdersByUserId('u001');
    const profile = await buildProfileFromOrders('e2e-user', orders);
    await profileStore.save(profile);
  });

  it('returns spec recommendation when productId is in message', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/conversation',
      payload: { sessionId: 'e2e-s1', userId: 'e2e-user', message: '帮我看看商品p101哪个尺码合适' },
    });

    if (res.statusCode !== 200) {
      console.error(res.body);
    }

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reply).toBeTruthy();
    expect(body.intent).toBe('product_consult');
    expect(body.recommendation).not.toBeNull();
    expect(body.recommendation.matchMethod).toBe('coverage');
    expect(body.recommendation.selectedSpecs).toHaveProperty('size');
    expect(body.reply).toContain('推荐');
  });

  it('persists session to JSONL after conversation', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/conversation',
      payload: { sessionId: 'e2e-s2', userId: 'e2e-user', message: '你好' },
    });
    expect(res.statusCode).toBe(200);

    const session = sessionManager.get('e2e-s2');
    expect(session).toBeDefined();
    expect(session!.messages.length).toBeGreaterThan(0);
  });

  it('builds profile from order history and saves to store', async () => {
    const loaded = await profileStore.load('e2e-user');
    expect(loaded).not.toBeNull();
    expect(loaded!.getCompleteness()).toBeGreaterThan(0);
    const female = loaded!.getGenderProfile('female');
    expect(female).toBeDefined();
    expect(female!.weight).toBeTruthy();
  });

  it('cold start user gets probing question instead of recommendation', async () => {
    const coldProfile = new UserProfileEntity('cold-user');
    await profileStore.save(coldProfile);

    const res = await app.inject({
      method: 'POST', url: '/api/conversation',
      payload: { sessionId: 'e2e-cold', userId: 'cold-user', message: '推荐一件外套' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.reply).toContain('身高');
  });

  it('full roundtrip: order→profile→conversation→recommendation→session persisted', async () => {
    const orderService = new MockOrderService();
    const orders = await orderService.getOrdersByUserId('u001');
    const profile = await buildProfileFromOrders('roundtrip-user', orders);
    await profileStore.save(profile);

    const res1 = await app.inject({
      method: 'POST', url: '/api/conversation',
      payload: { sessionId: 'rt-s1', userId: 'roundtrip-user', message: '商品p101什么尺码好' },
    });
    const body1 = JSON.parse(res1.body);
    expect(body1.recommendation).not.toBeNull();
    expect(body1.recommendation.selectedSpecs.size).toBeTruthy();

    const res2 = await app.inject({
      method: 'POST', url: '/api/conversation',
      payload: { sessionId: 'rt-s1', userId: 'roundtrip-user', message: '那物流多久到' },
    });
    const body2 = JSON.parse(res2.body);
    expect(body2.intent).toBe('logistics');

    const session = sessionManager.get('rt-s1');
    expect(session!.messages.length).toBeGreaterThanOrEqual(4);
  });
});
