import { describe, it, expect, vi } from 'vitest';
import { InMemoryEventBus, createEvent } from '../../src/domain/event-bus.js';
import type { AgentEvent } from '../../src/domain/types.js';

describe('InMemoryEventBus', () => {
  it('delivers events to matching subscribers', () => {
    const bus = new InMemoryEventBus();
    const handled: AgentEvent[] = [];

    bus.register({
      name: 'test-sub',
      subscribedEvents: ['message:user'],
      handle: (e) => { handled.push(e); },
    });

    bus.publish(createEvent('message:user', { text: 'hello' }));
    bus.publish(createEvent('message:assistant', { text: 'hi' }));

    expect(handled).toHaveLength(1);
    expect(handled[0].type).toBe('message:user');
  });

  it('delivers to multiple subscribers', () => {
    const bus = new InMemoryEventBus();
    let count = 0;

    bus.register({ name: 'sub-a', subscribedEvents: ['profile:updated'], handle: () => { count++; } });
    bus.register({ name: 'sub-b', subscribedEvents: ['profile:updated'], handle: () => { count++; } });

    bus.publish(createEvent('profile:updated', {}));
    expect(count).toBe(2);
  });

  it('isolates subscriber errors', () => {
    const bus = new InMemoryEventBus();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.register({
      name: 'bad-sub',
      subscribedEvents: ['system:error'],
      handle: () => { throw new Error('boom'); },
    });

    let goodCalled = false;
    bus.register({
      name: 'good-sub',
      subscribedEvents: ['system:error'],
      handle: () => { goodCalled = true; },
    });

    bus.publish(createEvent('system:error', {}));

    expect(goodCalled).toBe(true);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('unregisters subscribers by name', () => {
    const bus = new InMemoryEventBus();
    let called = false;

    bus.register({ name: 'temp', subscribedEvents: ['agent:start'], handle: () => { called = true; } });
    bus.unregister('temp');
    bus.publish(createEvent('agent:start', {}));

    expect(called).toBe(false);
  });

  it('lists registered subscriber names', () => {
    const bus = new InMemoryEventBus();
    bus.register({ name: 'alpha', subscribedEvents: ['agent:start'], handle: () => {} });
    bus.register({ name: 'beta', subscribedEvents: ['agent:stop'], handle: () => {} });

    expect(bus.listSubscribers()).toEqual(['alpha', 'beta']);
  });

  it('createEvent generates correct structure', () => {
    const event = createEvent('model:inference', { latencyMs: 42 }, 'sess-1');
    expect(event.type).toBe('model:inference');
    expect(event.sessionId).toBe('sess-1');
    expect(event.payload.latencyMs).toBe(42);
    expect(event.timestamp).toBeTruthy();
  });
});
