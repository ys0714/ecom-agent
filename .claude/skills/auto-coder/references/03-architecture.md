## 3. 系统架构与模块设计

### 3.1 四层架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│  Presentation Layer (表现层 / API 层) — Fastify                      │
│  src/presentation/                                                   │
│  ├── api/                     → Fastify 路由请求处理                  │
│  │   ├── conversation-handler.ts  → 对话 API 接入                    │
│  │   ├── profile-handler.ts       → 画像查询 API                     │
│  │   ├── admin-handler.ts         → 飞轮触发等运维 API               │
│  │   └── metrics-handler.ts       → 指标暴露                         │
│  ├── cli/                                                            │
│  │   └── agent-cli.ts             → CLI 对话与查询工具                │
│  └── server.ts                → Fastify 服务器实例化与注册            │
├─────────────────────────────────────────────────────────────────────┤
│  Application Layer (应用层) — 纯编排，不含底层实现规则                   │
│  src/application/                                                    │
│  ├── agent.ts                 → Agent 核心主循环与上下文组装           │
│  ├── guardrails/              → 安全护栏策略                          │
│  │   ├── input-guard.ts                                              │
│  │   ├── execution-guard.ts                                          │
│  │   └── output-guard.ts                                             │
│  ├── workflow/                → Workflow 路由与场景实现               │
│  │   ├── intent-router.ts         → 意图路由器                       │
│  │   ├── product-consult.ts       → 商品咨询 Workflow                │
│  │   ├── after-sale.ts                                               │
│  │   ├── logistics.ts                                                │
│  │   ├── complaint.ts                                                │
│  │   └── workflow-graph.ts        → 状态机节点图实现                   │
│  ├── services/                                                       │
│  │   ├── profile-engine/                                             │
│  │   │   ├── spec-inference.ts        → 规格匹配与推理计算            │
│  │   │   ├── preference-detector.ts   → 用户偏好检测（规则+LLM）      │
│  │   │   ├── explanation-generator.ts → 推荐解释生成                 │
│  │   │   ├── confidence-arbitrator.ts → 置信度冲突仲裁               │
│  │   │   ├── cold-start-manager.ts    → 冷启动处理                   │
│  │   │   └── dimension-registry.ts    → 维度插件注册                 │
│  │   ├── model-slot/                                                 │
│  │   │   ├── model-slot-manager.ts    → 模型槽位管理                 │
│  │   │   ├── model-provider.ts                                       │
│  │   │   ├── inference-cache.ts                                      │
│  │   │   └── ab-router.ts                                            │
│  │   ├── data-flywheel/                                              │
│  │   │   ├── badcase-collector.ts     → Badcase 采集与收集           │
│  │   │   ├── badcase-analyzer.ts      → Badcase 聚类分析             │
│  │   │   ├── tuning-advisor.ts        → 自动调优建议生成              │
│  │   │   ├── evaluator.ts             → 推荐打分评估                 │
│  │   │   ├── ab-experiment.ts         → A/B 实验管理                 │
│  │   │   └── prompt-optimizer.ts      → Prompt 优化建议              │
│  │   ├── context/                                                    │
│  │   │   └── segment-compressor.ts    → 窗口外历史对话压缩记忆        │
│  │   ├── session-manager.ts           → 会话管理 + Event Sourcing    │
│  │   ├── profile-store.ts             → 画像持久化                   │
│  │   └── profile-provider.ts          → 外部画像接入接口             │
│  └── subscribers/             → 事件订阅者                            │
│      ├── session-log-subscriber.ts    → 会话日志持久化               │
│      ├── metrics-subscriber.ts        → 指标采集                     │
│      ├── alert-subscriber.ts          → 异常告警                     │
│      ├── auto-prompt-subscriber.ts    → 数据飞轮定期触发             │
│      └── config-watch-subscriber.ts   → 配置热更新                   │
├─────────────────────────────────────────────────────────────────────┤
│  Domain Layer (领域层) — 核心业务规则与契约                            │
│  src/domain/                                                         │
│  ├── entities/               → 领域实体（充血模型）                    │
│  │   └── user-profile.entity.ts  → UserProfileEntity                │
│  ├── types.ts                → 全局类型定义                          │
│  └── event-bus.ts            → 事件总线（分发引擎和接口契约）          │
├─────────────────────────────────────────────────────────────────────┤
│  Infrastructure Layer (基础设施层)                                    │
│  src/infra/                                                          │
│  ├── config.ts               → 环境变量及静态配置                     │
│  ├── observability/          → 可观测性设施                          │
│  │   └── otel-setup.ts       → OpenTelemetry 初始化                 │
│  └── adapters/               → 外部实现适配器                        │
│      ├── llm.ts              → OpenAI 协议大模型调用                 │
│      ├── redis.ts            → 内存或真实 Redis 适配                 │
│      ├── mock-profile-provider.ts → 画像系统 Mock 提供者             │
│      ├── product-service.ts  → 外部商品服务适配                      │
│      └── logger.ts           → 日志格式化工具                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 核心数据流

#### 对话主循环（`Agent.handleMessage()`）

```
┌────────────────────────────────────────────────────────────┐
│ 用户消息到达                                                 │
│                                                              │
│ 1. EventBus.publish('message:user', msg)                    │
│                                                              │
│ 2. IntentRouter.classify(msg)                               │
│    → 识别用户意图 (例如 product_consult)                       │
│                                                              │
│ 3. PreferenceDetector.detectHybrid(msg, history)            │
│    → 混合路由检测偏好：规则路径或LLM模型路径                     │
│    → 返回 PreferenceSignal (包括明确覆写或画像纠正等)             │
│                                                              │
│ 4. UserProfileEntity.applyDelta(...)                        │
│    → 将纠正的偏好应用于画像中，并进行内部置信度仲裁                 │
│                                                              │
│ 5. ColdStartManager.getAction(profile)                      │
│    → 对新用户生成冷启动主动询问提示（例如：询问身高体重）             │
│                                                              │
│ 6. SlidingWindow 溢出处理与 SegmentCompressor 压缩              │
│    → 将超出窗口的消息转为压缩段记忆 (被动注入)                      │
│                                                              │
│ 7. 构建 System Prompt 与大模型推理                             │
│    → ModelSlotManager.infer() 生成回复                        │
│                                                              │
│ 8. SpecInference 推荐与解释 (商品咨询时触发)                     │
│    → 如果触发推荐，进行规格覆盖率计算并生成三层结构化解释             │
│    → 推荐内容附加至最终回复                                      │
│                                                              │
│ 9. 记录返回结果并发布事件 'message:assistant'                   │
│                                                              │
│ 10. EventBus.publish('turn:trace', debug)                    │
│     → 完整决策链路追踪（意图/画像/偏好/仲裁/推荐/记忆）          │
│                                                              │
│ 11. SpecRecommendationEvaluator 记录推荐质量跟踪               │
└────────────────────────────────────────────────────────────┘
```

#### 数据飞轮循环（`AutoPromptSubscriber.runFlywheel()`）

```
┌──────────────────────────────────────────────────────┐
│  触发条件：BadCase 池累积满或定时器定期触发               │
│                                                        │
│  1. BadCaseCollector.drainPool()                      │
│     → 提取未处理的 badcases，进入分析池                   │
│                                                        │
│  2. BadCaseAnalyzer.analyze(pool)                     │
│     → 结合归因维度对 badcase 进行聚类，得出 FailureModeCluster │
│                                                        │
│  3. TuningAdvisor.recommend(topCluster)               │
│     → 根据最大错误模式提供针对性的参数调优建议                 │
│                                                        │
│  4. TuningAdvisor.apply(recommendation)               │
│     → 判断置信度，高/中置信度的数值型参数进行自动修改应用          │
│                                                        │
│  5. ConfigWatchSubscriber.applyChange()               │
│     → 通知系统组件参数热更                                 │
└──────────────────────────────────────────────────────┘
```

### 3.3 模块依赖关系

```
                    ┌────────────────────────────┐
                    │   domain/ (零外部依赖)       │
                    │   ├── entities/             │ ← 领域实体（充血模型）
                    │   │   └── UserProfileEntity │
                    │   ├── types.ts              │ ← 全局类型定义
                    │   └── event-bus.ts          │ ← 事件接口及简单实现
                    └──────────┬─────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌────────────┐  ┌──────────────┐  ┌──────────────────┐
       │ infra/     │  │ infra/       │  │ application/     │
       │ config.ts  │  │ adapters/    │  │ workflow/        │
       │ observ-    │  │   llm.ts     │  │   intent-router  │
       │  ability/  │  │   redis.ts   │  │   product-consult│
       │  otel-setup│  │   product-svc│  │ guardrails/      │
       │            │  │   mock-prof. │  │ services/        │
       │            │  │   logger.ts  │  │   profile-engine/│
       │            │  │              │  │   model-slot/    │
       │            │  │              │  │   context/       │
       │            │  │              │  │   data-flywheel/ │
       │            │  │              │  │ subscribers/     │
       └────────────┘  └──────────────┘  └────────┬─────────┘
                                                  │
                                        ┌─────────┴─────────┐
                                        ▼                   ▼
                                 ┌────────────┐      ┌──────────┐
                                 │presentation│      │  cli/    │
                                 │ Fastify API│      │ agent-cli│
                                 │ handlers   │      └──────────┘
                                 └────────────┘      

依赖规则：
  domain/ → 不依赖任何其他层
  infra/  → 仅依赖 domain/（类型 + 接口）
  application/ → 依赖 domain/ + infra/
  presentation/ → 依赖 application/
```

### 3.4 依赖注入与组装

系统采用**手动 Composition Root** 模式（无框架），在 `src/main.ts` 中统一组装所有依赖。对于本项目的规模，手动组装完全可控，避免了注入框架在 ESM 模式下的兼容性问题。

**设计原则**：
- 所有服务通过构造函数注入依赖，不使用全局单例。
- 测试时直接在测试文件中实例化类并替换 mock 依赖。
- 组装逻辑集中在一个入口文件，依赖链路一目了然。

### 3.5 配置管理架构

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

---
