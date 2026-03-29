import { config } from './infra/config.js';
import { createLLMClient } from './infra/adapters/llm.js';
import { createRedisClient, IORedisClient, InMemoryRedisClient, type RedisClient } from './infra/adapters/redis.js';
import { MockProductService } from './infra/adapters/product-service.js';
import { InMemoryEventBus } from './domain/event-bus.js';
import { ProfileStore } from './application/services/profile-store.js';
import { SessionManager } from './application/services/session-manager.js';
import { ModelSlotManager } from './application/services/model-slot/model-slot-manager.js';
import { IntentRouter } from './application/workflow/intent-router.js';
import { ColdStartManager } from './application/services/profile-engine/cold-start-manager.js';
import { Agent } from './application/agent.js';
import { SessionLogSubscriber } from './application/subscribers/session-log-subscriber.js';
import { MetricsSubscriber } from './application/subscribers/metrics-subscriber.js';
import { AlertSubscriber } from './application/subscribers/alert-subscriber.js';
import { ConfigWatchSubscriber } from './application/subscribers/config-watch-subscriber.js';
import { AutoPromptSubscriber } from './application/subscribers/auto-prompt-subscriber.js';
import { BadCaseCollector } from './application/services/data-flywheel/badcase-collector.js';
import { BadCaseAnalyzer } from './application/services/data-flywheel/badcase-analyzer.js';
import { TuningAdvisor } from './application/services/data-flywheel/tuning-advisor.js';
import { SpecRecommendationEvaluator } from './application/services/data-flywheel/evaluator.js';
import { SegmentCompressor } from './application/services/context/segment-compressor.js';
import { DataDistillationSubscriber } from './application/subscribers/data-distillation-subscriber.js';
import { buildServer } from './presentation/server.js';
import { MockProfileProvider } from './infra/adapters/mock-profile-provider.js';
import { vectorStore } from './infra/adapters/vector-store.js';

import { SessionProfileStore } from './application/services/session-profile-store.js';

async function bootstrap() {
  let vs: typeof vectorStore | undefined;
  try {
    await vectorStore.initialize();
    vs = vectorStore;
    console.log(`[ecom-agent] Vector DB ready: ChromaDB @ ${config.vectorStore.url}`);
  } catch (err) {
    console.warn(`[ecom-agent] ChromaDB unavailable, few-shot retrieval disabled: ${err instanceof Error ? err.message : err}`);
  }

  const eventBus = new InMemoryEventBus();

  // 创建 Redis 客户端（优先使用真实 Redis，失败则回退到内存版）
  let redis: RedisClient;
  try {
    redis = createRedisClient(config.redis.url);
    if (redis instanceof IORedisClient) {
      console.log(`[ecom-agent] Redis connected: ${config.redis.url}`);
    } else {
      console.log('[ecom-agent] Using in-memory Redis (data will be lost on restart)');
    }
  } catch (err) {
    console.warn(`[ecom-agent] Redis connection failed, using in-memory: ${err instanceof Error ? err.message : err}`);
    redis = new InMemoryRedisClient();
  }

  const profileStore = new ProfileStore(redis, config.paths.profiles);
  const sessionProfileStore = new SessionProfileStore(redis, config.paths.sessions);
  console.log(`[ecom-agent] Profile store ready: ${config.paths.profiles}`);
const profileProvider = new MockProfileProvider();
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

const configWatch = new ConfigWatchSubscriber(config.paths.dataDir);
const badcaseCollector = new BadCaseCollector(config.business.badcaseBatchSize);
const badcaseAnalyzer = new BadCaseAnalyzer();
// Register some knobs for TuningAdvisor
const tuningAdvisor = new TuningAdvisor({
  'FEATURE_PRIORITY': { getValue: () => ['height', 'weight', 'bust', 'waistline', 'footLength'] },
  'COMPLETENESS_THRESHOLDS': { getValue: () => 0.3 },
  'MIN_RECOMMEND_CONFIDENCE': { getValue: () => 0.5 },
  'MATCH_RANGE_EXPANSION': { getValue: () => 'strict' },
  'MODEL_SLOT / PROMPT_VERSION': { getValue: () => 'current' },
  'PROFILE_UPDATE_FREQUENCY': { getValue: () => 'T+1' },
});
const autoPrompt = new AutoPromptSubscriber(badcaseCollector, badcaseAnalyzer, tuningAdvisor, configWatch);
const evaluator = new SpecRecommendationEvaluator();

const segmentCompressor = new SegmentCompressor({ llmClient, segmentSize: 5 });

const agent = new Agent({
  eventBus,
  profileStore,
  modelSlotManager,
  intentRouter: new IntentRouter(),
  coldStartManager: new ColdStartManager(),
  productService,
  llmClient,
  evaluator,
  segmentCompressor,
  slidingWindowSize: config.business.slidingWindowSize,
  vectorStore: vs,
  badcaseCollector,
});

// 创建订阅者实例（需要保留引用以传递给 server）
const sessionLogSub = new SessionLogSubscriber(config.paths.sessions);
const dataDistillationSub = new DataDistillationSubscriber(config.paths.dataDir);
const metricsSub = new MetricsSubscriber();
const alertSub = new AlertSubscriber();

eventBus.register(sessionLogSub);
eventBus.register(dataDistillationSub);
eventBus.register(metricsSub);
eventBus.register(alertSub);
eventBus.register(configWatch);
eventBus.register(autoPrompt);

const server = buildServer({
  agent,
  profileStore,
  sessionProfileStore,
  profileProvider,
  config,
  sessionManager: new SessionManager(config.paths.sessions),
  metricsSubscriber: metricsSub,
  configWatch,
  autoPrompt,
  eventBus,
  redis,
  llm: llmClient,
  badcaseCollector,
});

  server.listen({ port: config.server.port, host: '0.0.0.0' }).then((address: string) => {
    console.log(`[ecom-agent] server listening on ${address}`);
    console.log(`[ecom-agent] LLM: ${config.llm.modelId} @ ${config.llm.baseUrl}`);
    console.log(`[ecom-agent] data dir: ${config.paths.dataDir}`);
    console.log(`[ecom-agent] metrics collection: enabled`);
    console.log(`[ecom-agent] profile persistence: ${redis instanceof IORedisClient ? 'Redis + File' : 'File only (memory cache)'}`);
  }).catch((err: unknown) => {
    console.error('[ecom-agent] failed to start:', err);
    process.exit(1);
  });
}

bootstrap().catch((err: unknown) => {
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
