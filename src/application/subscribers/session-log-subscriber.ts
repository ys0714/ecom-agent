import fs from 'node:fs/promises';
import path from 'node:path';
import type { EventSubscriber } from '../../domain/event-bus.js';
import type { AgentEvent, AgentEventType } from '../../domain/types.js';

export class SessionLogSubscriber implements EventSubscriber {
  readonly name = 'SessionLogSubscriber';
  readonly priority = 'normal' as const;
  readonly subscribedEvents: AgentEventType[] = [
    'agent:start', 'agent:stop',
    'message:user', 'message:assistant',
    'turn:trace',
    'tool:call', 'tool:result',
    'profile:updated',
    'model:inference', 'model:fallback',
    'user:feedback',
    'guardrail:blocked',
    'system:error',
  ];

  private writeQueue = Promise.resolve();

  constructor(private sessionsDir: string) {}

  handle(event: AgentEvent): void {
    if (!event.sessionId) return;
    this.writeQueue = this.writeQueue
      .then(() => this.appendLog(event))
      .catch((err) => {
        console.error(`[SessionLogSubscriber] Failed to write event ${event.type} for session ${event.sessionId}:`, err);
      });
  }

  private async appendLog(event: AgentEvent): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    const filePath = path.join(this.sessionsDir, `${event.sessionId}.jsonl`);
    const line = JSON.stringify({
      type: event.type,
      timestamp: event.timestamp,
      payload: event.payload,
    }) + '\n';
    await fs.appendFile(filePath, line, 'utf-8');
  }
}
