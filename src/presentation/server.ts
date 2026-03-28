import Fastify from 'fastify';
import fs from 'node:fs/promises';
import type { Agent } from '../application/agent.js';
import type { ProfileStore } from '../application/services/profile-store.js';
import type { ProfileProvider } from '../application/services/profile-provider.js';
import { SessionManager } from '../application/services/session-manager.js';
import type { MetricsSubscriber } from '../application/subscribers/metrics-subscriber.js';
import type { ConfigWatchSubscriber } from '../application/subscribers/config-watch-subscriber.js';
import type { AutoPromptSubscriber } from '../application/subscribers/auto-prompt-subscriber.js';
import type { RedisClient } from '../infra/adapters/redis.js';
import type { LLMClient } from '../infra/adapters/llm.js';
import type { AppConfig } from '../infra/config.js';
import { registerConversationRoutes } from './api/conversation-handler.js';
import { registerProfileRoutes } from './api/profile-handler.js';
import { registerAdminRoutes } from './api/admin-handler.js';
import { registerMetricsRoutes } from './api/metrics-handler.js';
import { InMemoryEventBus } from '../domain/event-bus.js';
import type { SessionProfileStore } from '../application/services/session-profile-store.js';

export interface ServerDeps {
  agent: Agent;
  profileStore: ProfileStore;
  sessionProfileStore: SessionProfileStore;
  profileProvider: ProfileProvider;
  config: AppConfig;
  sessionManager?: SessionManager;
  metricsSubscriber?: MetricsSubscriber;
  configWatch?: ConfigWatchSubscriber;
  autoPrompt?: AutoPromptSubscriber;
  redis?: RedisClient;
  llm?: LLMClient;
  eventBus?: import('../domain/event-bus.js').InMemoryEventBus;
}

export function buildServer(deps: ServerDeps): ReturnType<typeof Fastify>;
export function buildServer(
  agent: Agent, 
  profileStore: ProfileStore, 
  profileProvider: ProfileProvider, 
  config: AppConfig, 
  sessionManager?: SessionManager, 
  eventBus?: import('../domain/event-bus.js').InMemoryEventBus,
  sessionProfileStore?: SessionProfileStore
): ReturnType<typeof Fastify>;
export function buildServer(
  agentOrDeps: Agent | ServerDeps,
  profileStore?: ProfileStore,
  profileProvider?: ProfileProvider,
  config?: AppConfig,
  sessionManager?: SessionManager,
  eventBus?: import('../domain/event-bus.js').InMemoryEventBus,
  sessionProfileStore?: SessionProfileStore
) {
  let deps: ServerDeps;
  if ('agent' in agentOrDeps && 'config' in agentOrDeps) {
    deps = agentOrDeps as ServerDeps;
  } else {
    deps = { 
      agent: agentOrDeps as Agent, 
      profileStore: profileStore!, 
      sessionProfileStore: sessionProfileStore!,
      profileProvider: profileProvider!, 
      config: config!, 
      sessionManager, 
      eventBus 
    };
  }

  const app = Fastify({ logger: deps.config.server.nodeEnv !== 'test' });
  const sessMgr = deps.sessionManager ?? new SessionManager(deps.config.paths.sessions);
  const bus = deps.eventBus ?? new InMemoryEventBus();

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
      checks.llm = { status: 'ok' };
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

  registerConversationRoutes(app, deps.agent, deps.profileStore, deps.profileProvider, sessMgr, bus, deps.sessionProfileStore);
  registerProfileRoutes(app, deps.profileStore, deps.profileProvider);
  registerAdminRoutes(app, deps.configWatch, deps.autoPrompt);
  registerMetricsRoutes(app, deps.metricsSubscriber);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const payload: Record<string, string> = { error: 'Internal Server Error' };
    if (deps.config.server.nodeEnv !== 'production') {
      payload.message = error instanceof Error ? error.message : String(error);
    }
    reply.status(500).send(payload);
  });

  return app;
}
