import fs from 'node:fs/promises';
import path from 'node:path';
import type { EventSubscriber } from '../../domain/event-bus.js';
import type { AgentEvent, AgentEventType, Message } from '../../domain/types.js';

export class DataDistillationSubscriber implements EventSubscriber {
  readonly name = 'DataDistillationSubscriber';
  readonly priority = 'low' as const;
  readonly subscribedEvents: AgentEventType[] = ['turn:trace'];

  private writeQueue = Promise.resolve();

  constructor(private outputDir: string) {}

  handle(event: AgentEvent): void {
    if (event.type !== 'turn:trace' || !event.payload.messagesForDistillation) return;

    this.writeQueue = this.writeQueue
      .then(() => this.appendLog(event))
      .catch((err) => {
        console.error(`[DataDistillationSubscriber] Failed to write distillation log for session ${event.sessionId}:`, err);
      });
  }

  private async appendLog(event: AgentEvent): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Distillation JSONL in OpenAI fine-tuning format
    // {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
    
    const messages = event.payload.messagesForDistillation as Message[];
    const assistantMessage = event.payload.assistantMessage as string;

    const distillationData = {
      messages: [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'assistant', content: assistantMessage }
      ],
      metadata: {
        sessionId: event.sessionId,
        intent: event.payload.intent,
        timestamp: event.timestamp
      }
    };

    const filePath = path.join(this.outputDir, 'distillation.jsonl');
    const line = JSON.stringify(distillationData) + '\n';
    
    await fs.appendFile(filePath, line, 'utf-8');
  }
}
