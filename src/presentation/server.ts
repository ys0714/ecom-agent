import Fastify from 'fastify';
import fs from 'node:fs/promises';
import type { Agent } from '../application/agent.js';
import type { ProfileStore } from '../application/services/profile-store.js';
import { SessionManager } from '../application/services/session-manager.js';
import type { MetricsSubscriber } from '../application/subscribers/metrics-subscriber.js';
import type { ConfigWatchSubscriber } from '../application/subscribers/config-watch-subscriber.js';
import type { RedisClient } from '../infra/adapters/redis.js';
import type { LLMClient } from '../infra/adapters/llm.js';
import type { AppConfig } from '../infra/config.js';
import { registerConversationRoutes } from './api/conversation-handler.js';
import { registerProfileRoutes } from './api/profile-handler.js';
import { registerAdminRoutes } from './api/admin-handler.js';
import { registerMetricsRoutes } from './api/metrics-handler.js';

export interface ServerDeps {
  agent: Agent;
  profileStore: ProfileStore;
  config: AppConfig;
  sessionManager?: SessionManager;
  metricsSubscriber?: MetricsSubscriber;
  configWatch?: ConfigWatchSubscriber;
  redis?: RedisClient;
  llm?: LLMClient;
}

export function buildServer(deps: ServerDeps): ReturnType<typeof Fastify>;
export function buildServer(agent: Agent, profileStore: ProfileStore, config: AppConfig, sessionManager?: SessionManager): ReturnType<typeof Fastify>;
export function buildServer(
  agentOrDeps: Agent | ServerDeps,
  profileStore?: ProfileStore,
  config?: AppConfig,
  sessionManager?: SessionManager,
) {
  let deps: ServerDeps;
  if ('agent' in agentOrDeps && 'config' in agentOrDeps) {
    deps = agentOrDeps as ServerDeps;
  } else {
    deps = { agent: agentOrDeps as Agent, profileStore: profileStore!, config: config!, sessionManager };
  }

  const app = Fastify({ logger: deps.config.server.nodeEnv !== 'test' });
  const sessMgr = deps.sessionManager ?? new SessionManager(deps.config.paths.sessions);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') { reply.status(204).send(); }
  });

  app.get('/health', async () => {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    if (deps.redis) {
      const start = Date.now();
      try {
        await deps.redis.set('health:ping', 'pong', 10);
        checks.redis = { status: 'ok', latencyMs: Date.now() - start };
      } catch {
        checks.redis = { status: 'error', latencyMs: Date.now() - start };
      }
    }

    if (deps.llm) {
      const start = Date.now();
      try {
        await deps.llm.chat([{ role: 'user', content: 'ping', timestamp: '' }], { maxTokens: 1 });
        checks.llm = { status: 'ok', latencyMs: Date.now() - start };
      } catch {
        checks.llm = { status: 'error', latencyMs: Date.now() - start };
      }
    }

    try {
      const tmpFile = `${deps.config.paths.dataDir}/.health_check`;
      await fs.mkdir(deps.config.paths.dataDir, { recursive: true });
      await fs.writeFile(tmpFile, 'ok');
      await fs.unlink(tmpFile);
      checks.disk = { status: 'ok' };
    } catch {
      checks.disk = { status: 'error' };
    }

    const allOk = Object.values(checks).every((c) => c.status === 'ok');
    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      checks,
    };
  });

  registerConversationRoutes(app, deps.agent, deps.profileStore, sessMgr);
  registerProfileRoutes(app, deps.profileStore);
  registerAdminRoutes(app, deps.configWatch);
  registerMetricsRoutes(app, deps.metricsSubscriber);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.status(500).send({ error: 'Internal Server Error', message: error instanceof Error ? error.message : String(error) });
  });

  return app;
}
