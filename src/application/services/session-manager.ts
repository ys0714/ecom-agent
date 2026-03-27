import fs from 'node:fs/promises';
import path from 'node:path';
import type { Message, AgentEvent } from '../../domain/types.js';

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

  async load(sessionId: string): Promise<SessionData | null> {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
      const content = await fs.readFile(filePath, 'utf-8');
      const messages: Message[] = content.trim().split('\n')
        .filter(Boolean)
        .map((line) => {
          const parsed = JSON.parse(line);
          
          // Format 1: Event Log format (Event Sourcing from SessionLogSubscriber)
          if (parsed.type === 'message:user' || parsed.type === 'message:assistant') {
            return { 
              role: parsed.type.split(':')[1], 
              content: parsed.payload?.content || '', 
              timestamp: parsed.timestamp 
            };
          }
          
          // Format 2: Legacy persist format (from older code versions)
          if (parsed.role === 'user' || parsed.role === 'assistant' || parsed.role === 'system') {
            return { role: parsed.role, content: parsed.content, timestamp: parsed.timestamp, name: parsed.name, toolCallId: parsed.toolCallId };
          }
          
          return null;
        }).filter((m): m is Message => m !== null);

      const seen = new Set<string>();
      const deduped = messages.filter((m) => {
        const key = `${m.role}:${m.content}:${m.timestamp ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const session: SessionData = {
        sessionId,
        userId: '', // Cannot infer from history reliably, but sufficient for chat history reconstruction
        messages: deduped,
        startedAt: deduped[0]?.timestamp ?? new Date().toISOString(),
        lastActiveAt: deduped[deduped.length - 1]?.timestamp ?? new Date().toISOString(),
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

  async loadEventLog(sessionId: string): Promise<AgentEvent[]> {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
      const content = await fs.readFile(filePath, 'utf-8');
      return content.trim().split('\n')
        .filter(Boolean)
        .map((line) => {
          try { return JSON.parse(line) as AgentEvent; }
          catch { return null; }
        })
        .filter((e): e is AgentEvent => e !== null && !!e.type);
    } catch {
      return [];
    }
  }

  listActive(): SessionData[] {
    return [...this.activeSessions.values()];
  }
}
