import type { AgentEvent, AgentEventType, EventPriority } from './types.js';

export interface EventSubscriber {
  name: string;
  subscribedEvents: AgentEventType[];
  priority?: EventPriority;
  handle(event: AgentEvent): void | Promise<void>;
  onError?(error: Error, event: AgentEvent): void;
}

const EVENT_PRIORITY_MAP: Partial<Record<AgentEventType, EventPriority>> = {
  'model:fallback': 'critical',
  'guardrail:blocked': 'critical',
  'system:error': 'critical',
  'model:health_check': 'low',
  'session:summary': 'low',
  'badcase:prompt_optimized': 'low',
};

const RETRY_BY_PRIORITY: Record<EventPriority, number> = {
  critical: 3,
  normal: 1,
  low: 0,
};

function getEventPriority(type: AgentEventType): EventPriority {
  return EVENT_PRIORITY_MAP[type] ?? 'normal';
}

export class InMemoryEventBus {
  private subscribers: EventSubscriber[] = [];
  private deadLetterQueue: Array<{ event: AgentEvent; subscriber: string; error: string }> = [];

  register(subscriber: EventSubscriber): void {
    this.subscribers.push(subscriber);
  }

  unregister(name: string): void {
    this.subscribers = this.subscribers.filter((s) => s.name !== name);
  }

  publish(event: AgentEvent): void {
    const priority = getEventPriority(event.type);

    for (const sub of this.subscribers) {
      if (!sub.subscribedEvents.includes(event.type)) continue;

      const maxRetries = RETRY_BY_PRIORITY[priority];
      this.executeWithRetry(sub, event, maxRetries, priority);
    }
  }

  private executeWithRetry(sub: EventSubscriber, event: AgentEvent, retriesLeft: number, priority: EventPriority): void {
    try {
      const result = sub.handle(event);
      if (result instanceof Promise) {
        result.catch((err) => {
          this.handleSubscriberError(sub, event, err instanceof Error ? err : new Error(String(err)), retriesLeft, priority);
        });
      }
    } catch (err) {
      this.handleSubscriberError(sub, event, err instanceof Error ? err : new Error(String(err)), retriesLeft, priority);
    }
  }

  private handleSubscriberError(sub: EventSubscriber, event: AgentEvent, error: Error, retriesLeft: number, priority: EventPriority): void {
    if (sub.onError) {
      try { sub.onError(error, event); } catch { /* ignore error handler errors */ }
    }

    if (retriesLeft > 0) {
      this.executeWithRetry(sub, event, retriesLeft - 1, priority);
      return;
    }

    if (priority === 'critical') {
      this.deadLetterQueue.push({ event, subscriber: sub.name, error: error.message });
    }

    if (priority !== 'low') {
      console.error(`[EventBus] ${sub.name} failed on ${event.type} (priority=${priority}):`, error.message);
    }
  }

  getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }

  clearDeadLetterQueue(): void {
    this.deadLetterQueue.length = 0;
  }

  listSubscribers(): string[] {
    return this.subscribers.map((s) => s.name);
  }
}

export function createEvent(type: AgentEventType, payload: Record<string, unknown> = {}, sessionId?: string): AgentEvent {
  return { type, timestamp: new Date().toISOString(), sessionId, payload };
}
