import { describe, it, expect, vi } from 'vitest';
import { ModelSlotManager } from '../../src/application/services/model-slot/model-slot-manager.js';
import { InferenceCache } from '../../src/application/services/model-slot/inference-cache.js';
import { ABRouter } from '../../src/application/services/model-slot/ab-router.js';
import { InMemoryEventBus } from '../../src/domain/event-bus.js';
import { InMemoryRedisClient } from '../../src/infra/adapters/redis.js';
import type { LLMClient } from '../../src/infra/adapters/llm.js';
import type { ModelProvider, Message, AgentEvent } from '../../src/domain/types.js';

function mockLLM(response: string): LLMClient {
  return { chat: vi.fn().mockResolvedValue(response) };
}

function mockProvider(name: string): ModelProvider {
  return { name, endpoint: 'http://test', modelId: name, maxTokens: 100, temperature: 0.7, timeoutMs: 5000 };
}

describe('ModelSlotManager', () => {
  it('registers slot and infers', async () => {
    const bus = new InMemoryEventBus();
    const events: AgentEvent[] = [];
    bus.register({ name: 'spy', subscribedEvents: ['model:inference'], handle: (e) => { events.push(e); } });

    const mgr = new ModelSlotManager(bus, () => mockLLM('test reply'));
    mgr.registerSlot('conv', 'conversation', mockProvider('8b'), {
      batchSize: 1, enableFallback: false, cacheTTL: 3600, maxRetries: 1, retryDelayMs: 100,
    });

    const msgs: Message[] = [{ role: 'user', content: 'hello', timestamp: '' }];
    const result = await mgr.infer('conv', msgs);

    expect(result).toBe('test reply');
    expect(events).toHaveLength(1);
    expect(events[0].payload.slotId).toBe('conv');
  });

  it('falls back when primary fails', async () => {
    const bus = new InMemoryEventBus();
    const fallbackEvents: AgentEvent[] = [];
    bus.register({ name: 'spy', subscribedEvents: ['model:fallback'], handle: (e) => { fallbackEvents.push(e); } });

    let callCount = 0;
    const mgr = new ModelSlotManager(bus, (cfg) => {
      if (cfg.name === 'primary') {
        return { chat: vi.fn().mockRejectedValue(new Error('down')) };
      }
      return mockLLM('fallback reply');
    });

    mgr.registerSlot('conv', 'conversation', mockProvider('primary'), {
      batchSize: 1, enableFallback: true, cacheTTL: 3600, maxRetries: 0, retryDelayMs: 0,
    }, mockProvider('fallback'));

    const result = await mgr.infer('conv', [{ role: 'user', content: 'hi', timestamp: '' }]);
    expect(result).toBe('fallback reply');
    expect(fallbackEvents).toHaveLength(1);
  });

  it('lists registered slots', () => {
    const mgr = new ModelSlotManager(new InMemoryEventBus(), () => mockLLM(''));
    mgr.registerSlot('a', 'conversation', mockProvider('m1'), {
      batchSize: 1, enableFallback: false, cacheTTL: 0, maxRetries: 0, retryDelayMs: 0,
    });
    expect(mgr.listSlots()).toHaveLength(1);
    expect(mgr.listSlots()[0].primaryModel).toBe('m1');
  });
});

describe('InferenceCache', () => {
  it('caches and retrieves recommendations', async () => {
    const cache = new InferenceCache(new InMemoryRedisClient());
    const rec = { propValueId: 'pv_1', selectedSpecs: { size: 'L' }, confidence: 0.9, matchMethod: 'coverage' as const };

    await cache.set('u1', 'p1', 1, rec);
    const cached = await cache.get('u1', 'p1', 1);
    expect(cached).toEqual(rec);
  });

  it('returns null for cache miss', async () => {
    const cache = new InferenceCache(new InMemoryRedisClient());
    expect(await cache.get('u1', 'p1', 1)).toBeNull();
  });

  it('invalidates cache entry', async () => {
    const cache = new InferenceCache(new InMemoryRedisClient());
    const rec = { propValueId: 'pv_1', selectedSpecs: {}, confidence: 0.5, matchMethod: 'coverage' as const };
    await cache.set('u1', 'p1', 1, rec);
    await cache.invalidate('u1', 'p1', 1);
    expect(await cache.get('u1', 'p1', 1)).toBeNull();
  });
});

describe('ABRouter', () => {
  it('routes users deterministically', () => {
    const router = new ABRouter();
    router.addExperiment({
      experimentId: 'exp1', treatmentRatio: 0.5,
      controlSlotId: 'control', treatmentSlotId: 'treatment',
    });

    const result1 = router.route('exp1', 'user_aaa');
    const result2 = router.route('exp1', 'user_aaa');
    expect(result1).toBe(result2);
  });

  it('distributes roughly according to ratio', () => {
    const router = new ABRouter();
    router.addExperiment({
      experimentId: 'exp2', treatmentRatio: 0.3,
      controlSlotId: 'C', treatmentSlotId: 'T',
    });

    let treatment = 0;
    for (let i = 0; i < 1000; i++) {
      if (router.route('exp2', `user_${i}`) === 'T') treatment++;
    }
    expect(treatment).toBeGreaterThan(150);
    expect(treatment).toBeLessThan(450);
  });
});
