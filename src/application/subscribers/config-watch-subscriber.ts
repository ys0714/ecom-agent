import fs from 'node:fs/promises';
import path from 'node:path';
import type { EventSubscriber } from '../../domain/event-bus.js';
import type { AgentEvent, AgentEventType } from '../../domain/types.js';

type ConfigChangeHandler = (key: string, value: unknown) => void;

export interface ConfigAuditEntry {
  timestamp: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  source: string;
}

export class ConfigWatchSubscriber implements EventSubscriber {
  readonly name = 'ConfigWatchSubscriber';
  readonly priority = 'normal' as const;
  readonly subscribedEvents: AgentEventType[] = [];

  private handlers = new Map<string, ConfigChangeHandler[]>();
  private auditLog: ConfigAuditEntry[] = [];
  private auditFilePath?: string;

  constructor(dataDir?: string) {
    if (dataDir) {
      this.auditFilePath = path.join(dataDir, 'config-audit.jsonl');
    }
  }

  onConfigChange(key: string, handler: ConfigChangeHandler): void {
    const existing = this.handlers.get(key) ?? [];
    existing.push(handler);
    this.handlers.set(key, existing);
  }

  handle(_event: AgentEvent): void {}

  async applyChange(key: string, newValue: unknown, oldValue?: unknown, source: string = 'admin_api'): Promise<void> {
    const entry: ConfigAuditEntry = {
      timestamp: new Date().toISOString(),
      key,
      oldValue: oldValue ?? null,
      newValue,
      source,
    };
    this.auditLog.push(entry);

    if (this.auditFilePath) {
      try {
        await fs.mkdir(path.dirname(this.auditFilePath), { recursive: true });
        await fs.appendFile(this.auditFilePath, JSON.stringify(entry) + '\n', 'utf-8');
      } catch { /* best-effort audit logging */ }
    }

    const handlers = this.handlers.get(key) ?? [];
    for (const h of handlers) {
      try { h(key, newValue); } catch { /* isolate handler errors */ }
    }
  }

  getAuditLog(): ConfigAuditEntry[] {
    return [...this.auditLog];
  }

  getLastChange(key: string): ConfigAuditEntry | undefined {
    return [...this.auditLog].reverse().find((e) => e.key === key);
  }
}
