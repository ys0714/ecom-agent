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
| M1-3 | UserProfileEntity 领域实体（applyDelta, summarizeForPrompt，**不含**冲突仲裁） | ✅ | `domain/entities/user-profile.entity.ts` |
| M1-4 | 硬编码覆盖率匹配算法（用户画像 × 商品画像 → 最优规格） | ✅ | `services/profile-engine/spec-inference.ts` |
| M1-5 | 简单 CLI 对话循环（stdin/stdout，单模型调用，滑动窗口 K=10） | ✅ | `presentation/cli/agent-cli.ts` |
| M1-6 | OpenAI-compatible LLM 客户端封装 | ✅ | `infra/adapters/llm.ts` |
| M1-7 | 基本 EventBus（发布-订阅，无分级，仅日志 Subscriber） | ✅ | `domain/event-bus.ts` |

### MVP-2：真实画像驱动推荐（周 3-4）

> **交付物**：真实订单数据构建画像，Redis 持久化，推荐准确率可量化。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| M2-1 | Redis 客户端封装（ioredis + RedisJSON） | ✅ | `infra/adapters/redis.ts` |
| M2-2 | 订单服务适配器（外部 API mock + 接口定义） | ✅ | `infra/adapters/order-service.ts` |
| M2-3 | 商品服务适配器（外部 API mock + 接口定义） | ✅ | `infra/adapters/product-service.ts` |
| M2-4 | OrderAnalyzer + ProfileBuilder（订单 → 画像构建） | ✅ | `services/profile-engine/order-analyzer.ts` |
| M2-5 | ProfileDimensionRegistry + 内置维度 Plugin | ✅ | `services/profile-engine/dimension-registry.ts` |
| M2-6 | ProfileStore（RedisJSON 部分更新 + JSON 文件落盘） | ✅ | `services/profile-store.ts` |
| M2-7 | ColdStartManager（四级冷启动策略） | ✅ | `services/profile-engine/cold-start-manager.ts` |
| M2-8 | 画像构建单元测试 + 集成测试 | ✅ | `tests/profile-engine.test.ts` |

### MVP-3：模型槽位 + Workflow 路由（周 5-6）

> **交付物**：多模型热切换、多场景 Workflow 路由、A/B 路由能力。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| M3-1 | done | ✅ | `services/model-slot/model-provider.ts` |
| M3-2 | done | ✅ | `services/model-slot/model-slot-manager.ts` |
| M3-3 | done | ✅ | `services/model-slot/inference-cache.ts` |
| M3-4 | done | ✅ | `services/model-slot/ab-router.ts` |
| M3-5 | done | ✅ | `application/workflow/intent-router.ts` |
| M3-6 | done | ✅ | `application/workflow/workflow-graph.ts` |
| M3-7 | done | ✅ | `application/workflow/product-consult.ts` |
| M3-8 | done | ✅ | `application/agent.ts` |
| M3-9 | done | ✅ | `tests/model-slot.test.ts`, `tests/workflow.test.ts` |

### Phase 4：安全护栏 + API 层（周 7-8）

> **交付物**：HTTP API 可用，安全护栏上线，可进入灰度测试。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P4-1 | done | ✅ | `application/guardrails/input-guard.ts` |
| P4-2 | done | ✅ | `application/guardrails/execution-guard.ts` |
| P4-3 | done | ✅ | `application/guardrails/output-guard.ts` |
| P4-4 | done | ✅ | `presentation/server.ts` |
| P4-5 | done | ✅ | `presentation/api/conversation-handler.ts` |
| P4-6 | done | ✅ | `presentation/api/*.ts` |
| P4-7 | done | ✅ | `tests/e2e.test.ts` |

### Phase 5：EventBus 加固 + Subscriber 体系（周 9-10）

> **交付物**：完整的事件分级、可观测性、告警能力。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P5-1 | done | ✅ | `domain/event-bus.ts` |
| P5-2 | done | ✅ | `subscribers/session-log-subscriber.ts` |
| P5-3 | done | ✅ | `subscribers/metrics-subscriber.ts` |
| P5-4 | done | ✅ | `subscribers/alert-subscriber.ts` |
| P5-5 | done | ✅ | `subscribers/config-watch-subscriber.ts` |
| P5-6 | done | ✅ | `infra/observability/otel-setup.ts` |

### Phase 6：数据飞轮（周 11-12）

> **交付物**：BadCase 自动识别 → Prompt 优化 → A/B 验证闭环。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P6-1 | done | ✅ | `services/data-flywheel/badcase-collector.ts` |
| P6-2 | done | ✅ | `services/data-flywheel/badcase-analyzer.ts` |
| P6-3 | done | ✅ | `services/data-flywheel/prompt-*.ts` |
| P6-4 | done | ✅ | `services/data-flywheel/ab-experiment.ts` |
| P6-5 | done | ✅ | `subscribers/auto-prompt-subscriber.ts` |

### Phase 7：更多 Workflow + 生产加固（周 13+）

> **交付物**：覆盖售后/物流/投诉场景，性能优化，在线评估闭环。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P7-1 | done | ✅ | `application/workflow/*.ts` |
| P7-2 | done | ✅ | `services/evaluation/llm-judge.ts` |
| P7-3 | done | ✅ | `services/model-slot/model-provider.ts` |
| P7-4 | done | ✅ | `tests/benchmark/` |
| P7-5 | done | ✅ | `infra/adapters/logger.ts` |


---
