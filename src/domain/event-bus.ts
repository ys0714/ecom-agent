import type { AgentEvent, AgentEventType } from './types.js';

export interface EventSubscriber {
  name: string;
  subscribedEvents: AgentEventType[];
  handle(event: AgentEvent): void | Promise<void>;
}

export class InMemoryEventBus {
  private subscribers: EventSubscriber[] = [];

  register(subscriber: EventSubscriber): void {
    this.subscribers.push(subscriber);
  }

  unregister(name: string): void {
    this.subscribers = this.subscribers.filter((s) => s.name !== name);
  }

  publish(event: AgentEvent): void {
    for (const sub of this.subscribers) {
      if (sub.subscribedEvents.includes(event.type)) {
        try {
          const result = sub.handle(event);
          if (result instanceof Promise) {
            result.catch((err) => {
              console.error(`[EventBus] subscriber "${sub.name}" failed on ${event.type}:`, err);
            });
          }
        } catch (err) {
          console.error(`[EventBus] subscriber "${sub.name}" threw on ${event.type}:`, err);
        }
      }
    }
  }

  listSubscribers(): string[] {
    return this.subscribers.map((s) => s.name);
  }
}

export function createEvent(type: AgentEventType, payload: Record<string, unknown> = {}, sessionId?: string): AgentEvent {
  return { type, timestamp: new Date().toISOString(), sessionId, payload };
}
