import type { FastifyInstance } from 'fastify';
import type { Agent } from '../../application/agent.js';
import type { ProfileStore } from '../../application/services/profile-store.js';
import type { ProfileProvider } from '../../application/services/profile-provider.js';
import { SessionManager } from '../../application/services/session-manager.js';
import { UserProfileEntity } from '../../domain/entities/user-profile.entity.js';
import { InputGuard } from '../../application/guardrails/input-guard.js';
import { OutputGuard } from '../../application/guardrails/output-guard.js';

import { InMemoryEventBus } from '../../domain/event-bus.js';

const inputGuard = new InputGuard();
const outputGuard = new OutputGuard();

export function registerConversationRoutes(
  app: FastifyInstance,
  agent: Agent,
  profileStore: ProfileStore,
  profileProvider: ProfileProvider,
  sessionManager: SessionManager,
  eventBus: InMemoryEventBus
) {
  app.post<{
    Body: { sessionId: string; userId: string; message: string };
  }>('/api/conversation', async (request, reply) => {
    const { sessionId, userId, message } = request.body as { sessionId: string; userId: string; message: string };

    if (!sessionId || !userId || !message) {
      return reply.status(400).send({ error: 'sessionId, userId, and message are required' });
    }

    const inputCheck = inputGuard.check(message, userId);
    if (!inputCheck.passed) {
      return reply.status(403).send({
        error: 'blocked',
        reason: inputCheck.reason,
        sanitized: inputCheck.sanitizedContent,
      });
    }

    const session = sessionManager.getOrCreate(sessionId, userId);

    let profile = await profileStore.load(userId);
    if (!profile) {
      profile = await profileProvider.getProfile(userId);
      if (profile) {
        await profileStore.save(profile); // 缓存到本地/Redis
      } else {
        profile = new UserProfileEntity(userId);
      }
    }

    const result = await agent.handleMessage(
      userId, sessionId, message, session.messages, profile,
    );

    const outputCheck = outputGuard.checkAndSanitize(result.reply);
    const finalReply = outputCheck.sanitizedContent ?? result.reply;

    const response: Record<string, unknown> = {
      sessionId,
      reply: finalReply,
      intent: result.intent,
      recommendation: result.recommendation,
      outputSanitized: !!outputCheck.sanitizedContent,
    };
    if (process.env.NODE_ENV !== 'production') {
      response.debug = result.debug;
    }
    return reply.send(response);
  });

  app.get<{
    Params: { sessionId: string };
  }>('/api/conversation/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    let session = sessionManager.get(sessionId);
    if (!session) {
      session = await sessionManager.load(sessionId) ?? undefined;
    }
    return reply.send({
      sessionId,
      messages: session?.messages ?? [],
    });
  });

  app.get<{
    Params: { sessionId: string };
  }>('/api/conversation/:sessionId/trace', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const events = await sessionManager.loadEventLog(sessionId);

    const turns: Array<{
      turnIndex: number;
      userMessage: string;
      assistantMessage: string;
      timestamp: string;
      trace: Record<string, unknown> | null;
      events: Array<{ type: string; timestamp: string; payload: Record<string, unknown> }>;
    }> = [];

    let currentTurn: typeof turns[number] | null = null;
    let turnIndex = 0;

    for (const event of events) {
      if (event.type === 'message:user') {
        currentTurn = {
          turnIndex: turnIndex++,
          userMessage: String(event.payload?.content ?? ''),
          assistantMessage: '',
          timestamp: event.timestamp,
          trace: null,
          events: [],
        };
        turns.push(currentTurn);
      }

      if (currentTurn) {
        currentTurn.events.push({
          type: event.type,
          timestamp: event.timestamp,
          payload: event.payload,
        });
      }

      if (event.type === 'message:assistant' && currentTurn) {
        currentTurn.assistantMessage = String(event.payload?.content ?? '');
      }

      if (event.type === 'turn:trace' && currentTurn) {
        currentTurn.trace = event.payload;
      }
    }

    return reply.send({ sessionId, totalTurns: turns.length, turns });
  });

  app.post<{
    Params: { sessionId: string };
    Body: { type: 'like' | 'dislike'; reason?: string; userId: string };
  }>('/api/conversation/:sessionId/feedback', async (request, reply) => {
    const { sessionId } = request.params;
    const { type, reason, userId } = request.body ?? {};

    if (!userId || !sessionId) {
      return reply.status(400).send({ error: 'sessionId and userId are required' });
    }
    if (!type || !['like', 'dislike'].includes(type)) {
      return reply.status(400).send({ error: 'type must be "like" or "dislike"' });
    }

    eventBus.publish({
      type: 'user:feedback',
      timestamp: new Date().toISOString(),
      sessionId,
      payload: { userId, feedbackType: type, reason: reason ?? null }
    });

    return reply.send({ success: true });
  });
}
