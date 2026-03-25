import Fastify from 'fastify';
import type { Agent } from '../application/agent.js';
import type { ProfileStore } from '../application/services/profile-store.js';
import type { AppConfig } from '../infra/config.js';
import { registerConversationRoutes } from './api/conversation-handler.js';
import { registerProfileRoutes } from './api/profile-handler.js';
import { registerAdminRoutes } from './api/admin-handler.js';

export function buildServer(agent: Agent, profileStore: ProfileStore, config: AppConfig) {
  const app = Fastify({ logger: config.server.nodeEnv !== 'test' });

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  registerConversationRoutes(app, agent, profileStore);
  registerProfileRoutes(app, profileStore);
  registerAdminRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.status(500).send({ error: 'Internal Server Error', message: error instanceof Error ? error.message : String(error) });
  });

  return app;
}
