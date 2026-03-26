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
import { ConfigWatchSubscriber } from './application/subscribers/config-watch-subscriber.js';
import { AutoPromptSubscriber } from './application/subscribers/auto-prompt-subscriber.js';
import { BadCaseCollector } from './application/services/data-flywheel/badcase-collector.js';
import { BadCaseAnalyzer } from './application/services/data-flywheel/badcase-analyzer.js';
import { TuningAdvisor } from './application/services/data-flywheel/tuning-advisor.js';
import { SpecRecommendationEvaluator } from './application/services/data-flywheel/evaluator.js';
import { SegmentCompressor } from './application/services/context/segment-compressor.js';
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
});

eventBus.register(new SessionLogSubscriber(config.paths.sessions));
eventBus.register(new MetricsSubscriber());
eventBus.register(new AlertSubscriber());
eventBus.register(configWatch);
eventBus.register(autoPrompt);

const server = buildServer({
  agent,
  profileStore,
  config,
  configWatch,
  autoPrompt,
});

server.listen({ port: config.server.port, host: '0.0.0.0' }).then((address: string) => {
  console.log(`[ecom-agent] server listening on ${address}`);
  console.log(`[ecom-agent] LLM: ${config.llm.modelId} @ ${config.llm.baseUrl}`);
  console.log(`[ecom-agent] data dir: ${config.paths.dataDir}`);
}).catch((err: unknown) => {
  console.error('[ecom-agent] failed to start:', err);
  process.exit(1);
});
