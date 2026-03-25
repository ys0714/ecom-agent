import type { EventSubscriber } from '../../domain/event-bus.js';
import type { AgentEvent, AgentEventType } from '../../domain/types.js';

type ConfigChangeHandler = (key: string, value: unknown) => void;

export class ConfigWatchSubscriber implements EventSubscriber {
  readonly name = 'ConfigWatchSubscriber';
  readonly priority = 'normal' as const;
  readonly subscribedEvents: AgentEventType[] = [];

  private handlers = new Map<string, ConfigChangeHandler[]>();

  onConfigChange(key: string, handler: ConfigChangeHandler): void {
    const existing = this.handlers.get(key) ?? [];
    existing.push(handler);
    this.handlers.set(key, existing);
  }

  handle(_event: AgentEvent): void {
    // Future: parse config update events and dispatch to handlers
  }

  applyChange(key: string, value: unknown): void {
    const handlers = this.handlers.get(key) ?? [];
    for (const h of handlers) {
      try { h(key, value); } catch { /* isolate handler errors */ }
    }
  }
}
