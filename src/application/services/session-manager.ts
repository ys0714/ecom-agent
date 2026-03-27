import fs from 'node:fs/promises';
import path from 'node:path';
import type { Message } from '../../domain/types.js';

export interface SessionData {
  sessionId: string;
  userId: string;
  messages: Message[];
  startedAt: string;
  lastActiveAt: string;
}

export class SessionManager {
  private activeSessions = new Map<string, SessionData>();

  constructor(private sessionsDir: string) {}

  create(sessionId: string, userId: string): SessionData {
    const session: SessionData = {
      sessionId, userId, messages: [],
      startedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    this.activeSessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): SessionData | undefined {
    return this.activeSessions.get(sessionId);
  }

  getOrCreate(sessionId: string, userId: string): SessionData {
    return this.activeSessions.get(sessionId) ?? this.create(sessionId, userId);
  }

  addMessage(sessionId: string, message: Message): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.lastActiveAt = new Date().toISOString();
    }
  }

  async persist(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    await fs.mkdir(this.sessionsDir, { recursive: true });
    const filePath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    const lines = session.messages
      .map((m) => JSON.stringify({ ...m, sessionId }))
      .join('\n') + '\n';
    await fs.writeFile(filePath, lines, 'utf-8');
  }

  async load(sessionId: string): Promise<SessionData | null> {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
      const content = await fs.readFile(filePath, 'utf-8');
      const messages: Message[] = content.trim().split('\n')
        .filter(Boolean)
        .map((line) => {
          const parsed = JSON.parse(line);
          // Only map valid messages (ignore raw string logs or legacy malformed lines)
          if (parsed.role === 'user' || parsed.role === 'assistant' || parsed.role === 'system') {
            return { role: parsed.role, content: parsed.content, timestamp: parsed.timestamp, name: parsed.name, toolCallId: parsed.toolCallId };
          }
          return null;
        }).filter((m): m is Message => m !== null);

      const session: SessionData = {
        sessionId,
        userId: '', // Cannot infer from history reliably, but sufficient for chat history reconstruction
        messages,
        startedAt: messages[0]?.timestamp ?? new Date().toISOString(),
        lastActiveAt: messages[messages.length - 1]?.timestamp ?? new Date().toISOString(),
      };
      this.activeSessions.set(sessionId, session);
      return session;
    } catch {
      return null;
    }
  }

  remove(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  listActive(): SessionData[] {
    return [...this.activeSessions.values()];
  }
}
