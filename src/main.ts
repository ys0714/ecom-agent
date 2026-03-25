import { config } from './infra/config.js';
import { createLLMClient } from './infra/adapters/llm.js';
import { InMemoryRedisClient } from './infra/adapters/redis.js';
import { MockOrderService } from './infra/adapters/order-service.js';
import { MockProductService } from './infra/adapters/product-service.js';
import { InMemoryEventBus } from './domain/event-bus.js';
import { ProfileStore } from './application/services/profile-store.js';
import { ModelSlotManager } from './application/services/model-slot/model-slot-manager.js';
import { IntentRouter } from './application/workflow/intent-router.js';
import { ColdStartManager } from './application/services/profile-engine/cold-start-manager.js';
import { Agent } from './application/agent.js';
import { SessionLogSubscriber } from './application/subscribers/session-log-subscriber.js';
import { MetricsSubscriber } from './application/subscribers/metrics-subscriber.js';
import { AlertSubscriber } from './application/subscribers/alert-subscriber.js';
import { buildServer } from './presentation/server.js';

const eventBus = new InMemoryEventBus();
const redis = new InMemoryRedisClient();
const profileStore = new ProfileStore(redis, config.paths.profiles);
const orderService = new MockOrderService();
const productService = new MockProductService();

const llmClient = createLLMClient({
  baseUrl: config.llm.baseUrl,
  apiKey: config.llm.apiKey,
  modelId: config.llm.modelId,
  timeoutMs: config.llm.timeoutMs,
});

const modelSlotManager = new ModelSlotManager(eventBus, () => llmClient);
modelSlotManager.registerSlot('conversation', 'conversation',
  { name: config.llm.modelId, endpoint: config.llm.baseUrl, modelId: config.llm.modelId,
    maxTokens: 2048, temperature: 0.7, timeoutMs: config.llm.timeoutMs },
  { batchSize: 1, enableFallback: false, cacheTTL: 0, maxRetries: 2, retryDelayMs: 500 },
);

const agent = new Agent({
  eventBus,
  profileStore,
  modelSlotManager,
  intentRouter: new IntentRouter(),
  coldStartManager: new ColdStartManager(),
  productService,
  slidingWindowSize: config.business.slidingWindowSize,
});

eventBus.register(new SessionLogSubscriber(config.paths.sessions));
eventBus.register(new MetricsSubscriber());
eventBus.register(new AlertSubscriber());

const server = buildServer(agent, profileStore, config);

server.listen({ port: config.server.port, host: '0.0.0.0' }).then((address: string) => {
  console.log(`[ecom-agent] server listening on ${address}`);
  console.log(`[ecom-agent] LLM: ${config.llm.modelId} @ ${config.llm.baseUrl}`);
  console.log(`[ecom-agent] data dir: ${config.paths.dataDir}`);
}).catch((err: unknown) => {
  console.error('[ecom-agent] failed to start:', err);
  process.exit(1);
});
