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
    
    const compactedEvent = this.compactPayload(event);
    
    const line = JSON.stringify({
      type: compactedEvent.type,
      timestamp: compactedEvent.timestamp,
      payload: compactedEvent.payload,
    }) + '\n';
    await fs.appendFile(filePath, line, 'utf-8');
  }

  private compactPayload(event: AgentEvent): AgentEvent {
    if (event.type !== 'turn:trace' || !event.payload) {
      return event;
    }

    const payload = { ...event.payload };
    
    // 1. Remove redundant messages
    delete payload.userMessage;
    delete payload.assistantMessage;

    // 2. Compact messagesForDistillation into a lightweight summary
    if (Array.isArray(payload.messagesForDistillation)) {
      const messages = payload.messagesForDistillation;
      
      const roleCount: Record<string, number> = {};
      let toolMessageCount = 0;
      let totalChars = 0;
      
      for (const msg of messages) {
        const role = msg.role || 'unknown';
        roleCount[role] = (roleCount[role] || 0) + 1;
        if (role === 'tool') toolMessageCount++;
        totalChars += (typeof msg.content === 'string' ? msg.content.length : 0);
      }
      
      payload.distillationSummary = {
        messageCount: messages.length,
        roleCount,
        toolMessageCount,
        totalChars,
        firstTimestamp: messages[0]?.timestamp,
        lastTimestamp: messages[messages.length - 1]?.timestamp,
      };
      
      delete payload.messagesForDistillation;
    }

    return {
      ...event,
      payload
    };
  }
}
