import type { FastifyInstance } from 'fastify';
import type { Agent } from '../../application/agent.js';
import type { ProfileStore } from '../../application/services/profile-store.js';
import { UserProfileEntity } from '../../domain/entities/user-profile.entity.js';
import { InputGuard } from '../../application/guardrails/input-guard.js';
import { OutputGuard } from '../../application/guardrails/output-guard.js';
import type { Message } from '../../domain/types.js';

const inputGuard = new InputGuard();
const outputGuard = new OutputGuard();

const sessions = new Map<string, { messages: Message[]; userId: string }>();

export function registerConversationRoutes(app: FastifyInstance, agent: Agent, profileStore: ProfileStore) {
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

    let session = sessions.get(sessionId);
    if (!session) {
      session = { messages: [], userId };
      sessions.set(sessionId, session);
    }

    let profile = await profileStore.load(userId);
    if (!profile) {
      profile = new UserProfileEntity(userId);
    }

    const result = await agent.handleMessage(
      userId, sessionId, message, session.messages, profile,
    );

    const outputCheck = outputGuard.checkAndSanitize(result.reply);
    const finalReply = outputCheck.sanitizedContent ?? result.reply;

    return reply.send({
      sessionId,
      reply: finalReply,
      intent: result.intent,
      recommendation: result.recommendation,
      outputSanitized: !!outputCheck.sanitizedContent,
    });
  });
}
