## 5. 系统架构与模块设计

### 5.1 四层架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│  Presentation Layer (表现层 / API 层) — Fastify                      │
│  src/presentation/                                                   │
│  ├── api/                     → Fastify 路由 + Zod 请求校验          │
│  │   ├── conversation-handler.ts  → 对话入口：接收用户消息，           │
│  │   │                              路由到 IntentRouter → Workflow   │
│  │   ├── profile-handler.ts       → 画像查询 API：                   │
│  │   │                              GET /profile/{userId}           │
│  │   ├── admin-handler.ts         → 运维 API：模型切换、画像锚定、    │
│  │   │                              实验管理、配置热更新             │
│  │   ├── review-handler.ts        → Prompt 审核 API：审核队列管理    │
│  │   └── metrics-handler.ts       → 指标暴露：GET /metrics (OTel)   │
│  └── cli/                                                            │
│      ├── agent-cli.ts             → CLI 工具：手动画像查询、会话回放  │
│      └── model-cli.ts             → 模型管理 CLI：切换、健康检查      │
├─────────────────────────────────────────────────────────────────────┤
│  Application Layer (应用层) — 纯编排，不含业务规则                     │
│  src/application/                                                    │
│  ├── agent.ts                → Agent 核心：Workflow 调度、上下文构建  │
│  ├── tools.ts                → Tool Schema 定义（按 Workflow 分组）  │
│  ├── workflow/               → Workflow 路由与场景实现                │
│  │   ├── intent-router.ts         → 意图路由器（LLM + 规则双模式）  │
│  │   ├── product-consult.ts       → 商品咨询 Workflow               │
│  │   ├── after-sale.ts            → 售后 Workflow                   │
│  │   ├── logistics.ts             → 物流查询 Workflow               │
│  │   ├── complaint.ts             → 投诉处理 Workflow               │
│  │   └── workflow-registry.ts     → Workflow 注册中心               │
│  ├── services/                                                       │
│  │   ├── profile-engine/                                             │
│  │   │   ├── order-analyzer.ts        → 历史订单统计聚合             │
│  │   │   ├── profile-builder.ts       → 特征工程，画像构建           │
│  │   │   ├── conversation-updater.ts  → 对话中实时画像更新           │
│  │   │   ├── spec-inference.ts        → 规格推理（覆盖率匹配+模型）  │
│  │   │   ├── cold-start-manager.ts    → 冷启动策略管理              │
│  │   │   └── dimension-registry.ts    → 画像维度 Plugin 注册中心    │
│  │   ├── model-slot/                                                 │
│  │   │   ├── model-slot-manager.ts    → 模型槽位管理（注册/切换/路由）│
│  │   │   ├── model-provider.ts        → 模型提供者（HTTP + cockatiel │
│  │   │   │                              断路器/重试/超时）           │
│  │   │   ├── inference-cache.ts       → 推理结果缓存（Redis）        │
│  │   │   ├── ab-router.ts            → A/B 流量路由                  │
│  │   │   └── prompt-builder.ts          → Prompt 拼接（TS 模板字面量）│
│  │   ├── memory/                                                     │
│  │   │   ├── preference-memory.ts     → L1 用户偏好记忆（RedisJSON） │
│  │   │   ├── session-memory.ts        → L2 完整会话记忆             │
│  │   │   ├── window-memory.ts         → L3 滑动窗口记忆             │
│  │   │   └── context-builder.ts       → LLM 上下文构建（滑动窗口）   │
│  │   ├── data-flywheel/                                              │
│  │   │   ├── badcase-collector.ts     → BadCase 收集器              │
│  │   │   ├── badcase-analyzer.ts      → BadCase 聚类（规则+Embedding│
│  │   │   │                              语义聚类）                   │
│  │   │   ├── prompt-optimizer.ts      → Prompt 自动优化生成         │
│  │   │   ├── prompt-review-queue.ts   → Prompt 人工审核队列          │
│  │   │   ├── offline-evaluator.ts     → 离线评估                    │
│  │   │   └── ab-experiment.ts         → A/B 实验管理（含统计检验）   │
│  │   ├── session-manager.ts           → 会话管理                    │
│  │   └── profile-store.ts            → 画像持久化                    │
│  └── subscribers/                                                    │
│      ├── index.ts                     → Subscriber 注册入口         │
│      ├── session-log-subscriber.ts    → 会话日志持久化 (Normal)     │
│      ├── metrics-subscriber.ts        → OTel 指标采集 (Normal)      │
│      ├── tracing-subscriber.ts        → OTel 链路追踪 (Normal)      │
│      ├── replay-subscriber.ts         → 会话回放 (Low)              │
│      ├── alert-subscriber.ts          → 异常告警 (Critical)         │
│      ├── auto-prompt-subscriber.ts    → 数据飞轮触发 (Low)          │
│      └── config-watch-subscriber.ts   → 配置热更新推送 (Normal)     │
├─────────────────────────────────────────────────────────────────────┤
│  Domain Layer (领域层) — 核心业务规则                                  │
│  src/domain/                                                         │
│  ├── entities/               → 领域实体（充血模型，含行为方法）       │
│  │   └── user-profile.entity.ts  → UserProfileEntity                │
│  │       ├── applyDelta()         → 画像增量合并                    │
│  │       ├── resolveConflict()    → 冲突仲裁算法                    │
│  │       ├── decayConfidence()    → 时间衰减                        │
│  │       └── summarizeForPrompt() → LLM 摘要生成                    │
│  ├── services/               → 领域服务（跨实体的业务规则）          │
│  │   └── conflict-arbitration.service.ts                             │
│  │       ├── 加权置信度仲裁算法                                      │
│  │       ├── 震荡抑制（窗口冷却 + 回弹检测）                         │
│  │       └── 人工介入阈值判定                                        │
│  ├── types.ts                → 全局类型定义                          │
│  │   ├── CategoryScore, SpecScore, DimensionData  → 画像核心类型    │
│  │   ├── ConflictResult, Evidence                 → 冲突仲裁类型    │
│  │   ├── ModelSlot, ModelProvider, ModelConfig     → 模型槽位类型    │
│  │   ├── Message, AgentSession, WorkflowContext    → 会话/Workflow   │
│  │   ├── BadCase, PromptVersion, ABExperiment     → 数据飞轮类型    │
│  │   ├── PromptSegment, SegmentCondition          → Prompt 模板类型 │
│  │   ├── ProfileDimensionPlugin                   → 画像维度插件    │
│  │   └── MemoryLayer, SessionSummaryBlock         → 记忆层类型      │
│  ├── event-bus.ts            → 事件总线                              │
│  │   ├── AgentEvent (22 种联合类型 + 事件分级)                       │
│  │   ├── InMemoryEventBus<T> (Request + Notification 双模式)        │
│  │   ├── EventSubscriber 接口（含 priority + onError）              │
│  │   └── EventBusRegistry + 错误隔离策略                             │
│  ├── errors.ts               → 领域错误层级                          │
│  │   ├── DomainError (业务错误基类)                                  │
│  │   ├── ProfileConflictError, ColdStartError     → 画像领域错误    │
│  │   ├── InferenceError, ModelHealthError         → 推理领域错误    │
│  │   └── WorkflowTransitionError                  → Workflow 错误   │
│  ├── schemas/                → Zod 运行时校验 Schema                 │
│  │   ├── profile.schema.ts   → UserProfile Zod 校验                 │
│  │   ├── conflict.schema.ts  → ConflictResult Zod 校验              │
│  │   ├── inference.schema.ts → SpecRecommendation Zod 校验          │
│  │   └── prompt.schema.ts    → PromptSegment Zod 校验               │
│  └── constants.ts            → 业务常量（运行时可热更新）             │
│      ├── 仲裁权重（SOURCE_WEIGHTS, DECAY_LAMBDA, OVERRIDE_THRESHOLD）│
│      ├── 记忆层参数（L3_WINDOW_SIZE=10, L2_MAX_ROUNDS=200）         │
│      ├── 冷启动阈值（COLD_THRESHOLD=0.3, WARM_THRESHOLD=0.7）       │
│      └── BadCase 信号权重                                            │
├─────────────────────────────────────────────────────────────────────┤
│  Infrastructure Layer (基础设施层)                                    │
│  src/infra/                                                          │
│  ├── config.ts               → 分层配置中心                          │
│  │   ├── 路径常量：DATA_DIR, PROJECT_DIR, SESSIONS_DIR, PROFILES_DIR│
│  │   ├── 模型配置：MODEL_SLOTS, DEFAULT_SLOT_CONFIG                 │
│  │   ├── Redis 配置：REDIS_URL, CACHE_TTL                           │
│  │   ├── 业务参数：AB_TRAFFIC_RATIO, BADCASE_BATCH_SIZE             │
│  │   └── RuntimeConfigStore：运行时可热更新的参数层                  │
│  ├── di/                     → 依赖注入配置                          │
│  │   └── container.ts        → 手动 Composition Root（无框架）     │
│  ├── observability/          → 可观测性基础设施                       │
│  │   ├── otel-setup.ts       → OpenTelemetry SDK 初始化              │
│  │   ├── tracer.ts           → Tracer 工厂（OTel Tracing API）      │
│  │   └── meter.ts            → Meter 工厂（OTel Metrics API）       │
│  └── adapters/                                                       │
│      ├── llm.ts              → OpenAI-compatible 客户端              │
│      ├── redis.ts            → Redis 客户端（ioredis + RedisJSON）   │
│      ├── order-service.ts    → 外部订单服务适配器                    │
│      ├── product-service.ts  → 外部商品服务适配器                    │
│      ├── file-system.ts      → 文件操作（路径安全校验）              │
│      ├── compression.ts      → 上下文压缩策略                        │
│      └── logger.ts           → 结构化日志（接入 OTel Logs API）      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 核心数据流

#### 对话主循环（`Agent.conversationLoop()`）

```
┌────────────────────────────────────────────────────────────┐
│ 用户消息到达                                                 │
│                                                              │
│ 1. EventBus.publish('message:user', msg)                    │
│                                                              │
│ 2. L3-Window.append(msg)                                    │
│    → L3 溢出？→ EventBus.publish('memory:l3_overflow')      │
│    → (L2/L1 通过事件订阅自动响应，见 2.4 层间协议)           │
│                                                              │
│ 3. ConversationProfileUpdater.extract(msg)                  │
│    → 从消息中提取偏好信号 → ProfileDelta                     │
│                                                              │
│ 4. UserProfileEntity.applyDelta(delta)                      │
│    → 冲突检测 → 仲裁（领域实体内部逻辑）                     │
│    → EventBus.publish('profile:updated' | 'conflict_*')     │
│                                                              │
│ 5. IntentRouter.classify(msg, context)                      │
│    → 意图识别 → 路由到对应 Workflow                          │
│    → 意图切换？→ currentWorkflow.onExit() → newWorkflow.onEnter()
│                                                              │
│ 6. 构建 System Prompt（TypeScript 模板字面量）               │
│    → 画像摘要 + 场景指令 + Guardrails 约束 + 滑动窗口上下文 │
│                                                              │
│ 7. currentWorkflow.onMessage(msg, workflowContext)          │
│    → Workflow 状态机执行 → 调用 ModelSlotManager.infer()     │
│    → 回复中包含商品推荐？                                    │
│      → SpecInferenceEngine.infer(profile, product)          │
│      → 覆盖率匹配优先，fallback 到模型推理                   │
│      → 注入推荐规格到回复                                    │
│                                                              │
│ 8. EventBus.publish('message:assistant', response)          │
│                                                              │
│ 9. BadCaseCollector.evaluate(msg, response, profile)        │
│    → 冷启动阶段跳过（样本质量不够）                          │
│    → 疑似 badcase？→ EventBus.publish('badcase:detected')   │
│                                                              │
│ 10. 返回客服回复给用户                                       │
└────────────────────────────────────────────────────────────┘
```

#### 数据飞轮循环（`AutoPromptPipeline.run()`）

```
┌──────────────────────────────────────────────────────┐
│  触发条件：BadCase 池累积 ≥ BADCASE_BATCH_SIZE (50)   │
│                                                        │
│  1. BadCaseAnalyzer.cluster(badcases)                 │
│     → 规则分组 + Embedding 语义聚类                     │
│                                                        │
│  2. PromptOptimizer.analyze(clusters)                 │
│     → 定位 prompt 缺陷                                  │
│     → 调用 72B 生成 ≤3 个候选 prompt                    │
│                                                        │
│  3. PromptReviewQueue.submit(candidates)              │
│     → 候选进入人工审核队列                               │
│     → 审核通过后继续                                     │
│                                                        │
│  4. OfflineEvaluator.evaluate(approved, testset)      │
│     → 历史数据集回归测试                                │
│     → 选出最优候选                                      │
│                                                        │
│  5. ABExperiment.create(winner, baselinePrompt)       │
│     → 灰度 10% 流量，最小样本量 ≥1000                   │
│     → 统计检验（Z-test / 贝叶斯 AB）                    │
│                                                        │
│  6. ABExperiment.evaluate()                           │
│     → 统计显著优于基线 → 全量切换                        │
│     → 不显著/劣于基线 → 回滚/延长实验                    │
│                                                        │
│  7. EventBus.publish('badcase:prompt_optimized')      │
└──────────────────────────────────────────────────────┘
```

### 5.3 模块依赖关系

```
                    ┌────────────────────────────┐
                    │   domain/ (零外部依赖)       │
                    │   ├── entities/             │ ← 领域实体（充血模型）
                    │   │   └── UserProfileEntity │
                    │   ├── services/             │ ← 领域服务
                    │   │   └── ConflictArbitration│
                    │   ├── types.ts              │ ← 纯类型定义
                    │   ├── event-bus.ts          │ ← 零外部依赖
                    │   ├── errors.ts             │ ← 错误层级
                    │   ├── schemas/              │ ← 仅依赖 zod
                    │   └── constants.ts          │ ← 零依赖
                    └──────────┬─────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌────────────┐  ┌──────────────┐  ┌──────────────────┐
       │ infra/     │  │ infra/       │  │ application/     │
       │ config.ts  │  │ adapters/    │  │ workflow/        │
       │ di/        │  │   llm.ts     │  │   intent-router  │
       │  container │  │   redis.ts   │  │   product-consult│
       │ observ-    │  │   order-svc  │  │   after-sale     │
       │  ability/  │  │   product-svc│  │ services/        │
       │  otel-setup│  │   fs.ts      │  │   profile-engine/│
       │  tracer.ts │  │   compress   │  │   model-slot/    │
       │  meter.ts  │  │   logger     │  │   memory/        │
       │            │  │              │  │   data-flywheel/ │
       │            │  │              │  │ subscribers/     │
       └────────────┘  └──────────────┘  └────────┬─────────┘
                                                  │
                                        ┌─────────┴─────────┐
                                        ▼                   ▼
                                 ┌────────────┐      ┌──────────┐
                                 │presentation│      │  cli/    │
                                 │ Fastify API│      │ agent-cli│
                                 │ handlers   │      │ model-cli│
                                 └────────────┘      └──────────┘

依赖规则：
  domain/ → 不依赖任何其他层（仅依赖 zod）
  infra/  → 仅依赖 domain/（类型 + 接口）
  application/ → 依赖 domain/ + infra/
  presentation/ → 依赖 application/（通过 DI 容器注入）
```

### 5.4 依赖注入与组装

系统采用**手动 Composition Root** 模式（无框架），在入口文件统一组装所有依赖。对于本项目的规模（~20 个服务类），手动组装完全可控且零额外依赖，避免了 tsyringe 等装饰器库在 ESM + strict 模式下的兼容性问题。

**Composition Root**（`src/main.ts`）：

```typescript
// src/main.ts — 手动组装所有依赖
const config = loadConfig();
const redis = createRedisClient(config.redis);
const eventBus = new InMemoryEventBus();

const profileStore = new ProfileStore(redis);
const dimensionRegistry = new ProfileDimensionRegistry();
const modelSlotManager = new ModelSlotManager(config.models, eventBus);
const intentRouter = new IntentRouter(modelSlotManager);
const sessionManager = new SessionManager(config.dataDir);

const agent = new Agent({
  profileStore, dimensionRegistry, modelSlotManager,
  intentRouter, sessionManager, eventBus,
});

// 注册 Subscribers
eventBus.register(new SessionLogSubscriber(config.dataDir));
eventBus.register(new MetricsSubscriber());
eventBus.register(new AlertSubscriber(config.alert));

// 启动 Fastify
const server = buildServer(agent, profileStore, config);
server.listen({ port: config.port });
```

**设计原则**：
- 所有服务通过构造函数注入依赖，不使用全局单例或 Service Locator
- 测试时直接在测试文件中 `new Service(mockDep)` 替换依赖，无需框架
- 组装逻辑集中在一个文件，依赖关系一目了然

### 5.5 错误处理架构

系统定义统一的**错误层级**（Error Hierarchy），并采用 `Result<T, E>` 模式替代 throw/catch 的隐式控制流。

**错误层级**：

```typescript
abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly isRetryable: boolean;
}

class ProfileConflictError extends DomainError { code = 'PROFILE_CONFLICT'; isRetryable = false; }
class ColdStartError extends DomainError { code = 'COLD_START'; isRetryable = false; }
class InferenceError extends DomainError { code = 'INFERENCE_FAILED'; isRetryable = true; }
class ModelHealthError extends DomainError { code = 'MODEL_UNHEALTHY'; isRetryable = true; }
class WorkflowTransitionError extends DomainError { code = 'WORKFLOW_TRANSITION'; isRetryable = false; }

class InfrastructureError extends Error {
  constructor(readonly cause: Error, readonly service: string) { super(); }
}
```

**Result 模式**（基于 neverthrow）：

```typescript
type InferenceResult = Result<SpecRecommendation, InferenceError>;
type ProfileUpdateResult = Result<void, ProfileConflictError>;

const result = await specInference.infer(profile, product);
result.match(
  (recommendation) => { /* 成功处理 */ },
  (error) => { /* 错误处理，类型安全 */ }
);
```

**弹性策略**（基于 cockatiel）：

| 策略 | 应用场景 | 配置 |
|------|---------|------|
| **重试** | LLM 调用、Redis 操作 | 指数退避，max 3 次，初始 200ms |
| **断路器** | 模型推理端点 | 失败率 > 50% 开启，冷却 30s |
| **超时** | 所有外部调用 | LLM: 10s, Redis: 2s, 外部 API: 5s |
| **Bulkhead** | 并发推理请求 | 最大并发 10，队列 50 |
| **Fallback** | 模型推理 | 8B 失败 → 72B → 规则引擎兜底 |

### 5.6 可观测性架构

系统采用 **OpenTelemetry** 作为统一可观测性框架，覆盖 Metrics、Traces、Logs 三大支柱。不再使用 prom-client + 自研 Tracing + 自研 Logger 三套独立实现。

**OTel SDK 初始化**（`infra/observability/otel-setup.ts`）：

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'ecom-agent',
  traceExporter: new OTLPTraceExporter({ url: config.otel.traceEndpoint }),
  metricReader: new PrometheusExporter({ port: config.otel.metricsPort }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

**自动插桩**（零代码改动即可采集）：

| 插桩目标 | 自动采集内容 |
|---------|------------|
| HTTP (Fastify) | 请求延迟、状态码、路由维度 |
| Redis (ioredis) | 命令延迟、连接池状态 |
| 自定义 LLM Span | 推理延迟、token 数、模型名称（通过手动 Span 封装） |

**自定义业务指标**（通过 OTel Metrics API）：

| 指标名称 | 类型 | 维度 | 说明 |
|---------|------|------|------|
| `profile.conflict.total` | Counter | `conflict_type`, `resolved` | 画像冲突总数 |
| `inference.duration` | Histogram | `model_name`, `slot_id` | 推理延迟分布 |
| `inference.fallback.total` | Counter | `from_model`, `to_model` | 降级次数 |
| `badcase.total` | Counter | `signal_type` | BadCase 识别总数 |
| `workflow.transition.total` | Counter | `from`, `to` | Workflow 切换次数 |
| `cold_start.stage` | Gauge | `stage` | 各冷启动阶段用户数 |

### 5.7 配置管理架构

系统采用**分层配置**设计，支持运行时热更新业务参数，无需重启服务。

**配置分层**（优先级从低到高）：

```
┌──────────────────────────────────────────────┐
│  Layer 4: Experiment Override (A/B 实验参数)   │ ← 最高优先级
│  → 实验期间临时覆盖，实验结束自动清除          │
├──────────────────────────────────────────────┤
│  Layer 3: Runtime Override (运行时热更新)      │
│  → 通过 Admin API 修改，存储在 Redis          │
│  → EventBus.publish('config:updated') 通知    │
├──────────────────────────────────────────────┤
│  Layer 2: Config File (应用默认值)            │
│  → $PROJECT_DIR/config.json                   │
│  → 部署时确定，进程启动时加载                  │
├──────────────────────────────────────────────┤
│  Layer 1: Environment Variables (部署环境)     │ ← 最低优先级
│  → .env / 容器环境变量                         │
│  → 仅存放基础设施地址、密钥等部署相关配置       │
└──────────────────────────────────────────────┘
```

**可热更新的参数**：

| 参数 | 默认值 | 热更新 | 说明 |
|------|--------|--------|------|
| `SLIDING_WINDOW_SIZE` | 10 | 支持 | 对话滑动窗口大小 |
| `BADCASE_BATCH_SIZE` | 50 | 支持 | 飞轮触发批次 |
| `AB_TRAFFIC_RATIO` | 0.1 | 支持 | A/B 灰度比例 |
| `MIN_RECOMMEND_CONFIDENCE` | 0.5 | 支持 | 推荐最低置信度阈值 |
| `FEATURE_PRIORITY` | `[height,weight,bust,waistline,footLength]` | 支持 | 覆盖率匹配特征优先级 |
| `REDIS_URL` | - | 不支持 | 需重启 |
| `LLM_BASE_URL` / `LLM_MODEL_ID` | - | 不支持 | 需重启（通过模型热切换替代） |

配置变更通过 `ConfigWatchSubscriber` 推送到相关模块，模块自行响应更新。

### 5.8 容量规划

基于预估流量的资源需求估算（以日活 10 万用户、日均 50 万次对话为基准）：

| 资源 | 估算 | 依据 |
|------|------|------|
| **Redis 内存** | ~10 GB | 100 万用户画像 × ~10KB/画像 |
| **Redis 推理缓存** | ~2 GB | 50 万活跃 SKU × ~4KB 缓存条目，TTL=1h 自动淘汰 |
| **会话 JSONL 磁盘** | ~15 GB/月 | 50 万对话/天 × 平均 10 轮 × ~1KB/条 × 30 天 |
| **Node.js 进程** | 2-4 实例 | 单进程支撑 ~500 并发 WebSocket/HTTP 连接 |
| **8B 模型 GPU** | 1×X40 GPU | 支撑 ~100 QPS（continuous batching），P50 ~100ms |
| **72B fallback GPU** | 1×2 X40 GPU | 低 QPS 兜底，平时闲置可用于飞轮离线评估 |
| **BadCase JSONL** | ~500 MB/月 | 按 5% BadCase 率估算 |

**扩容策略**：
- Node.js 水平扩容（无状态，Redis 集中存储画像和会话元数据）
- 8B 模型通过 vLLM 多实例或增加 GPU 扩容
- JSONL 日志按天滚动 + 定期归档到对象存储

---
