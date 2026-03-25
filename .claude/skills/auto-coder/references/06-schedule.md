## 6. 项目排期（纵向切片 MVP 交付）

> 采用**纵向切片**（Vertical Slice）交付模式：每个阶段交付可运行的端到端功能，而非横向分层建设。
> 原则：**先跑通业务闭环，再按需演进**。
> **状态说明**：✅ 已完成 | 🔧 需优化 | 📋 待实现

### MVP-1：最小可运行对话（周 1-2）

> **交付物**：一个可 demo 的端到端对话，用户输入商品 → 返回规格推荐。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| M1-1 | 项目初始化、TypeScript 配置、ESM 模块、依赖管理（fastify, neverthrow, cockatiel, @opentelemetry/*） | ✅ | `package.json`, `tsconfig.json` |
| M1-2 | Domain 层核心类型定义（UserProfile, SpecScore, ModelSlot, WorkflowType 等） | ✅ | `domain/types.ts` |
| M1-3 | UserProfileEntity 领域实体（applyDelta, summarizeForPrompt，**不含**冲突仲裁） | 📋 | `domain/entities/user-profile.entity.ts` |
| M1-4 | 硬编码覆盖率匹配算法（用户画像 × 商品画像 → 最优规格） | 📋 | `services/profile-engine/spec-inference.ts` |
| M1-5 | 简单 CLI 对话循环（stdin/stdout，单模型调用，滑动窗口 K=10） | 📋 | `presentation/cli/agent-cli.ts` |
| M1-6 | OpenAI-compatible LLM 客户端封装 | 📋 | `infra/adapters/llm.ts` |
| M1-7 | 基本 EventBus（发布-订阅，无分级，仅日志 Subscriber） | 📋 | `domain/event-bus.ts` |

### MVP-2：真实画像驱动推荐（周 3-4）

> **交付物**：真实订单数据构建画像，Redis 持久化，推荐准确率可量化。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| M2-1 | Redis 客户端封装（ioredis + RedisJSON） | 📋 | `infra/adapters/redis.ts` |
| M2-2 | 订单服务适配器（外部 API mock + 接口定义） | 📋 | `infra/adapters/order-service.ts` |
| M2-3 | 商品服务适配器（外部 API mock + 接口定义） | 📋 | `infra/adapters/product-service.ts` |
| M2-4 | OrderAnalyzer + ProfileBuilder（订单 → 画像构建） | 📋 | `services/profile-engine/order-analyzer.ts` |
| M2-5 | ProfileDimensionRegistry + 内置维度 Plugin | 📋 | `services/profile-engine/dimension-registry.ts` |
| M2-6 | ProfileStore（RedisJSON 部分更新 + JSON 文件落盘） | 📋 | `services/profile-store.ts` |
| M2-7 | ColdStartManager（四级冷启动策略） | 📋 | `services/profile-engine/cold-start-manager.ts` |
| M2-8 | 画像构建单元测试 + 集成测试 | 📋 | `tests/profile-engine.test.ts` |

### MVP-3：模型槽位 + Workflow 路由（周 5-6）

> **交付物**：多模型热切换、多场景 Workflow 路由、A/B 路由能力。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| M3-1 | ModelProvider 抽象（HTTP + cockatiel 断路器/重试/超时） | 📋 | `services/model-slot/model-provider.ts` |
| M3-2 | ModelSlotManager（注册/注销/热切换/健康检查/fallback） | 📋 | `services/model-slot/model-slot-manager.ts` |
| M3-3 | InferenceCache（Redis 缓存，key=userId:productId:profileVersion） | 📋 | `services/model-slot/inference-cache.ts` |
| M3-4 | ABRouter（A/B 流量路由，按百分比分流） | 📋 | `services/model-slot/ab-router.ts` |
| M3-5 | IntentRouter（LLM 意图分类 + 规则快速路由双模式） | 📋 | `application/workflow/intent-router.ts` |
| M3-6 | WorkflowGraph 声明式图结构引擎 + WorkflowRegistry | 📋 | `application/workflow/workflow-graph.ts` |
| M3-7 | ProductConsultWorkflow（商品咨询主场景） | 📋 | `application/workflow/product-consult.ts` |
| M3-8 | Agent 主循环（重构为 Workflow 调度模式） | 📋 | `application/agent.ts` |
| M3-9 | 模型槽位 + Workflow 单元测试 | 📋 | `tests/model-slot.test.ts`, `tests/workflow.test.ts` |

### Phase 4：安全护栏 + API 层（周 7-8）

> **交付物**：HTTP API 可用，安全护栏上线，可进入灰度测试。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P4-1 | Guardrails 输入层（Prompt 注入检测 + 敏感词过滤 + 身份绑定） | 📋 | `application/guardrails/input-guard.ts` |
| P4-2 | Guardrails 执行层（工具调用权限白名单 + 操作幂等 + 金额限制） | 📋 | `application/guardrails/execution-guard.ts` |
| P4-3 | Guardrails 输出层（PII 脱敏 + 承诺合规检查 + 事实校验） | 📋 | `application/guardrails/output-guard.ts` |
| P4-4 | Fastify 服务初始化（Zod type-provider、OTel 插桩、错误中间件） | 📋 | `presentation/server.ts` |
| P4-5 | ConversationHandler（对话 API 入口） | 📋 | `presentation/api/conversation-handler.ts` |
| P4-6 | ProfileHandler + AdminHandler | 📋 | `presentation/api/*.ts` |
| P4-7 | 端到端集成测试（含 Guardrails 拦截场景） | 📋 | `tests/e2e.test.ts` |

### Phase 5：EventBus 加固 + Subscriber 体系（周 9-10）

> **交付物**：完整的事件分级、可观测性、告警能力。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P5-1 | EventBus 事件分级（Critical/Normal/Low）+ Subscriber 错误隔离 | 📋 | `domain/event-bus.ts` |
| P5-2 | SessionLogSubscriber（JSONL 持久化） | 📋 | `subscribers/session-log-subscriber.ts` |
| P5-3 | MetricsSubscriber（OTel Metrics）+ TracingSubscriber（OTel Tracing） | 📋 | `subscribers/metrics-subscriber.ts` |
| P5-4 | AlertSubscriber（规则告警 + Webhook） | 📋 | `subscribers/alert-subscriber.ts` |
| P5-5 | ConfigWatchSubscriber（配置热更新） | 📋 | `subscribers/config-watch-subscriber.ts` |
| P5-6 | OTel SDK 初始化 + 自动插桩配置 | 📋 | `infra/observability/otel-setup.ts` |

### Phase 6：数据飞轮（周 11-12）

> **交付物**：BadCase 自动识别 → Prompt 优化 → A/B 验证闭环。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P6-1 | BadCaseCollector（多信号识别，冷启动过滤） | 📋 | `services/data-flywheel/badcase-collector.ts` |
| P6-2 | BadCaseAnalyzer（规则 + Embedding 语义聚类） | 📋 | `services/data-flywheel/badcase-analyzer.ts` |
| P6-3 | PromptOptimizer + PromptReviewQueue（Human-in-the-Loop） | 📋 | `services/data-flywheel/prompt-*.ts` |
| P6-4 | ABExperiment（含统计检验 Z-test/贝叶斯） | 📋 | `services/data-flywheel/ab-experiment.ts` |
| P6-5 | AutoPromptSubscriber + 飞轮集成测试 | 📋 | `subscribers/auto-prompt-subscriber.ts` |

### Phase 7：更多 Workflow + 生产加固（周 13+）

> **交付物**：覆盖售后/物流/投诉场景，性能优化，在线评估闭环。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P7-1 | AfterSaleWorkflow + LogisticsWorkflow + ComplaintWorkflow | 📋 | `application/workflow/*.ts` |
| P7-2 | LLM-as-Judge 在线评估（每日采样打分 + 质量趋势看板） | 📋 | `services/evaluation/llm-judge.ts` |
| P7-3 | 推理结果 batch 优化 + Redis Pipeline 批量操作 | 📋 | `services/model-slot/model-provider.ts` |
| P7-4 | 性能 benchmark 测试套件 | 📋 | `tests/benchmark/` |
| P7-5 | 结构化日志（OTel Logs API）+ 日志级别控制 | 📋 | `infra/adapters/logger.ts` |


---
