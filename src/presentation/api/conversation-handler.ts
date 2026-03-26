import type { FastifyInstance } from 'fastify';
import type { Agent } from '../../application/agent.js';
import type { ProfileStore } from '../../application/services/profile-store.js';
import type { ProfileProvider } from '../../application/services/profile-provider.js';
import { SessionManager } from '../../application/services/session-manager.js';
import { UserProfileEntity } from '../../domain/entities/user-profile.entity.js';
import { InputGuard } from '../../application/guardrails/input-guard.js';
import { OutputGuard } from '../../application/guardrails/output-guard.js';

const inputGuard = new InputGuard();
const outputGuard = new OutputGuard();

export function registerConversationRoutes(
  app: FastifyInstance,
  agent: Agent,
  profileStore: ProfileStore,
  profileProvider: ProfileProvider,
  sessionManager: SessionManager,
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

    await sessionManager.persist(sessionId);

    return reply.send({
      sessionId,
      reply: finalReply,
      intent: result.intent,
      recommendation: result.recommendation,
      outputSanitized: !!outputCheck.sanitizedContent,
      debug: result.debug,
    });
  });
}
