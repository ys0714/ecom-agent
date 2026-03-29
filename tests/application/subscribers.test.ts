import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryEventBus, createEvent } from '../../src/domain/event-bus.js';
import { SessionLogSubscriber } from '../../src/application/subscribers/session-log-subscriber.js';
import { MetricsSubscriber } from '../../src/application/subscribers/metrics-subscriber.js';
import { AlertSubscriber } from '../../src/application/subscribers/alert-subscriber.js';
import { ConfigWatchSubscriber } from '../../src/application/subscribers/config-watch-subscriber.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

describe('EventBus with priority and error isolation', () => {
  it('retries critical event subscribers', () => {
    const bus = new InMemoryEventBus();
    let attempts = 0;

    bus.register({
      name: 'flaky',
      subscribedEvents: ['model:fallback'],
      priority: 'critical',
      handle: () => {
        attempts++;
        if (attempts <= 2) throw new Error('transient');
      },
    });

    bus.publish(createEvent('model:fallback', {}));
    expect(attempts).toBe(3);
  });

  it('sends failed critical events to dead letter queue', () => {
    const bus = new InMemoryEventBus();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.register({
      name: 'always-fail',
      subscribedEvents: ['system:error'],
      handle: () => { throw new Error('permanent'); },
    });

    bus.publish(createEvent('system:error', {}));
    const dlq = bus.getDeadLetterQueue();
    expect(dlq).toHaveLength(1);
    expect(dlq[0].subscriber).toBe('always-fail');
    consoleSpy.mockRestore();
  });

  it('does not retry low priority events', () => {
    const bus = new InMemoryEventBus();
    let attempts = 0;

    bus.register({
      name: 'low-sub',
      subscribedEvents: ['session:summary'],
      handle: () => { attempts++; throw new Error('fail'); },
    });

    bus.publish(createEvent('session:summary', {}));
    expect(attempts).toBe(1);
    expect(bus.getDeadLetterQueue()).toHaveLength(0);
  });

  it('calls onError handler when subscriber fails', () => {
    const bus = new InMemoryEventBus();
    const onError = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.register({
      name: 'with-error-handler',
      subscribedEvents: ['model:fallback'],
      handle: () => { throw new Error('boom'); },
      onError,
    });

    bus.publish(createEvent('model:fallback', {}));
    expect(onError).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('SessionLogSubscriber', () => {
  it('writes events to JSONL file', async () => {
    const tmpDir = path.join(os.tmpdir(), `session-log-${Date.now()}`);
    const sub = new SessionLogSubscriber(tmpDir);
    const bus = new InMemoryEventBus();
    bus.register(sub);

    bus.publish(createEvent('message:user', { content: 'hello' }, 'sess_1'));
    bus.publish(createEvent('message:assistant', { content: 'hi' }, 'sess_1'));

    await new Promise((r) => setTimeout(r, 100));

    const content = await fs.readFile(path.join(tmpDir, 'sess_1.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).type).toBe('message:user');
    expect(JSON.parse(lines[1]).type).toBe('message:assistant');
  });

  it('compacts turn:trace events to remove redundant data', async () => {
    const tmpDir = path.join(os.tmpdir(), `session-log-compact-${Date.now()}`);
    const sub = new SessionLogSubscriber(tmpDir);
    const bus = new InMemoryEventBus();
    bus.register(sub);

    const tracePayload = {
      userMessage: 'hello',
      assistantMessage: 'hi',
      intent: 'general',
      latencyMs: 150,
      messagesForDistillation: [
        { role: 'user', content: 'hello', timestamp: '2023-01-01T00:00:00Z' },
        { role: 'assistant', content: 'hi', timestamp: '2023-01-01T00:00:01Z' },
        { role: 'tool', content: '...', timestamp: '2023-01-01T00:00:02Z' }
      ]
    };

    bus.publish(createEvent('turn:trace', tracePayload, 'sess_2'));
    await new Promise((r) => setTimeout(r, 100));

    const content = await fs.readFile(path.join(tmpDir, 'sess_2.jsonl'), 'utf-8');
    const writtenEvent = JSON.parse(content.trim());
    
    expect(writtenEvent.type).toBe('turn:trace');
    expect(writtenEvent.payload.userMessage).toBeUndefined();
    expect(writtenEvent.payload.assistantMessage).toBeUndefined();
    expect(writtenEvent.payload.intent).toBe('general');
    expect(writtenEvent.payload.latencyMs).toBe(150);
    
    expect(writtenEvent.payload.messagesForDistillation).toBeUndefined();
    expect(writtenEvent.payload.distillationSummary).toBeDefined();
    expect(writtenEvent.payload.distillationSummary.messageCount).toBe(3);
    expect(writtenEvent.payload.distillationSummary.toolMessageCount).toBe(1);
    expect(writtenEvent.payload.distillationSummary.roleCount.user).toBe(1);
    expect(writtenEvent.payload.distillationSummary.roleCount.assistant).toBe(1);
    expect(writtenEvent.payload.distillationSummary.totalChars).toBe(10); // 'hello'.length + 'hi'.length + '...'.length
  });
});

describe('MetricsSubscriber', () => {
  it('tracks inference metrics', () => {
    const sub = new MetricsSubscriber();
    const bus = new InMemoryEventBus();
    bus.register(sub);

    bus.publish(createEvent('model:inference', { latencyMs: 100 }));
    bus.publish(createEvent('model:inference', { latencyMs: 200 }));
    bus.publish(createEvent('model:fallback', {}));
    bus.publish(createEvent('guardrail:blocked', { reason: 'test' }));

    const snap = sub.getSnapshot();
    expect(snap.inferenceCount).toBe(2);
    expect(snap.avgLatencyMs).toBe(150);
    expect(snap.fallbackCount).toBe(1);
    expect(snap.guardrailBlockCount).toBe(1);
  });

  it('resets metrics', () => {
    const sub = new MetricsSubscriber();
    sub.handle(createEvent('model:inference', { latencyMs: 100 }));
    sub.reset();
    expect(sub.getSnapshot().inferenceCount).toBe(0);
  });
});

describe('AlertSubscriber', () => {
  it('emits critical alert on consecutive fallbacks', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sub = new AlertSubscriber({ consecutiveFallbackThreshold: 2 });
    const bus = new InMemoryEventBus();
    bus.register(sub);

    bus.publish(createEvent('model:fallback', {}));
    expect(sub.getAlerts()).toHaveLength(0);

    bus.publish(createEvent('model:fallback', {}));
    expect(sub.getAlerts()).toHaveLength(1);
    expect(sub.getAlerts()[0].level).toBe('critical');
    consoleSpy.mockRestore();
  });

  it('emits warning on guardrail block', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sub = new AlertSubscriber();
    sub.handle(createEvent('guardrail:blocked', { reason: 'injection' }));
    expect(sub.getAlerts()).toHaveLength(1);
    expect(sub.getAlerts()[0].level).toBe('warning');
    consoleSpy.mockRestore();
  });
});

describe('ConfigWatchSubscriber', () => {
  it('dispatches config changes to handlers', () => {
    const sub = new ConfigWatchSubscriber();
    let received: unknown = null;
    sub.onConfigChange('slidingWindowSize', (_key, value) => { received = value; });

    sub.applyChange('slidingWindowSize', 20);
    expect(received).toBe(20);
  });
});
