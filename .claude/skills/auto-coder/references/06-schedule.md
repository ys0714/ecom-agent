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
| M3-1 | ModelProvider（HTTP + cockatiel 断路器/重试/超时） | ✅ | `services/model-slot/model-provider.ts` |
| M3-2 | ModelSlotManager（注册/注销/热切换/fallback） | ✅ | `services/model-slot/model-slot-manager.ts` |
| M3-3 | InferenceCache（Redis 缓存） | ✅ | `services/model-slot/inference-cache.ts` |
| M3-4 | ABRouter（确定性 hash 分桶） | ✅ | `services/model-slot/ab-router.ts` |
| M3-5 | IntentRouter（规则 + LLM 双模式） | ✅ | `application/workflow/intent-router.ts` |
| M3-6 | WorkflowGraph 声明式图引擎 | ✅ | `application/workflow/workflow-graph.ts` |
| M3-7 | ProductConsultWorkflow | ✅ | `application/workflow/product-consult.ts` |
| M3-8 | Agent 主循环（Workflow 调度） | ✅ | `application/agent.ts` |
| M3-9 | 模型槽位 + Workflow 测试 | ✅ | `tests/model-slot.test.ts`, `tests/workflow.test.ts` |

### Phase 4：安全护栏 + API 层（周 7-8）

> **交付物**：HTTP API 可用，安全护栏上线，可进入灰度测试。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P4-1 | Guardrails 输入层（注入检测 + 敏感词 + 身份绑定） | ✅ | `application/guardrails/input-guard.ts` |
| P4-2 | Guardrails 执行层（工具权限白名单 + 金额/频率限制） | ✅ | `application/guardrails/execution-guard.ts` |
| P4-3 | Guardrails 输出层（PII 脱敏 + 承诺合规） | ✅ | `application/guardrails/output-guard.ts` |
| P4-4 | Fastify 服务初始化 | ✅ | `presentation/server.ts` |
| P4-5 | ConversationHandler（对话 API + Guardrails 集成） | ✅ | `presentation/api/conversation-handler.ts` |
| P4-6 | ProfileHandler + AdminHandler | ✅ | `presentation/api/*.ts` |
| P4-7 | API 集成测试 | ✅ | `tests/presentation/api.test.ts` |

### Phase 5：EventBus 加固 + Subscriber 体系（周 9-10）

> **交付物**：完整的事件分级、可观测性、告警能力。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P5-1 | EventBus 事件分级（Critical/Normal/Low）+ 错误隔离 + 死信队列 | ✅ | `domain/event-bus.ts` |
| P5-2 | SessionLogSubscriber（JSONL 持久化） | ✅ | `subscribers/session-log-subscriber.ts` |
| P5-3 | MetricsSubscriber（推理延迟/降级率/拦截率） | ✅ | `subscribers/metrics-subscriber.ts` |
| P5-4 | AlertSubscriber（连续降级告警） | ✅ | `subscribers/alert-subscriber.ts` |
| P5-5 | ConfigWatchSubscriber（配置热更新） | ✅ | `subscribers/config-watch-subscriber.ts` |
| P5-6 | OTel SDK 初始化（可选依赖，graceful skip） | ✅ | `infra/observability/otel-setup.ts` |

### Phase 6：数据飞轮重构（周 11-12）

> **交付物**：Trace 采集 → 自动评估器 → 根因归因 → 旋钮调优 → A/B 验证闭环。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P6-1 | BadCase Trace 采集重构（携带完整决策上下文） | ✅ | `services/data-flywheel/badcase-collector.ts` |
| P6-2 | SpecRecommendationEvaluator（推荐准确率、首次接受率、覆盖率有解率、fallback 率） | ✅ | `services/data-flywheel/evaluator.ts` |
| P6-3 | 多维根因归因引擎（基于 Trace 上下文自动归因 6 种失败模式） | ✅ | `services/data-flywheel/badcase-analyzer.ts` |
| P6-4 | 旋钮调优器（定位失败模式 → 对应参数旋钮 → 生成调优方案） | ✅ | `services/data-flywheel/tuning-advisor.ts` |
| P6-5 | A/B 实验增强（明确 success 定义：spec_accepted / session_purchase） | ✅ | `services/data-flywheel/ab-experiment.ts` |
| P6-6 | 飞轮闭环集成测试（Trace→评估→归因→调优→A/B→回流） | ✅ | `tests/data-flywheel.test.ts` |

### Phase 7：更多 Workflow + 生产加固（周 13+）

> **交付物**：覆盖售后/物流/投诉场景，性能优化，在线评估闭环。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P7-1 | AfterSale / Logistics / Complaint Workflow | ✅ | `application/workflow/*.ts` |
| P7-2 | LLM-as-Judge 对话质量评估 | ✅ | `services/evaluation/llm-judge.ts` |

### Phase 8：核心闭环集成（Last Mile Integration）

> **交付物**：用户说话 → 画像匹配 → 返回推荐规格的端到端闭环真正跑通。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P8-1 | Agent.trySpecRecommendation 接通 ProductService + matchSpecs | ✅ | `application/agent.ts` |
| P8-2 | Composition Root（main.ts 串联全部模块） | ✅ | `src/main.ts` |
| P8-3 | CLI 接通真实画像构建流程 | ✅ | `presentation/cli/agent-cli.ts` |
| P8-4 | SessionManager + JSONL 会话持久化 | ✅ | `application/services/session-manager.ts` |
| P8-5 | 端到端闭环集成测试 | ✅ | `tests/e2e/last-mile.test.ts` |

### Phase 9：推荐解释性 + 对话偏好仲裁（混合方案）

> **交付物**：三层结构化解释 + 规则快速路径 + LLM 深度路径 + 置信度打分仲裁。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P9-1 | ExplanationGenerator（三层结构化解释） | ✅ | `services/profile-engine/explanation-generator.ts` |
| P9-2 | PreferenceDetector 规则快速路径（4 种覆写类型识别） | ✅ | `services/profile-engine/preference-detector.ts` |
| P9-3 | ConfidenceArbitrator（置信度打分仲裁） | ✅ | `services/profile-engine/confidence-arbitrator.ts` |
| P9-4 | Agent 集成（解释+覆写+仲裁接入主循环） | ✅ | `application/agent.ts` |
| P9-5 | 规则路径测试（解释质量+覆写识别+仲裁决策） | ✅ | `tests/application/explanation.test.ts`, `tests/application/preference.test.ts` |
| P9-6 | done | ✅ | `services/profile-engine/model-preference-analyzer.ts` |
| P9-7 | done | ✅ | `services/profile-engine/preference-detector.ts` |
| P9-8 | done | ✅ | `tests/application/preference-hybrid.test.ts` |

### Phase 10：监控运维（Monitoring & Observability）

> **交付物**：指标 API、深度健康检查、结构化日志、配置审计——不引入新依赖。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P10-1 | done | ✅ | `presentation/api/metrics-handler.ts` |
| P10-2 | done | ✅ | `presentation/server.ts` |
| P10-3 | done | ✅ | `infra/adapters/logger.ts` |
| P10-4 | done | ✅ | `subscribers/config-watch-subscriber.ts` |
| P10-5 | done | ✅ | `tests/presentation/monitoring.test.ts` |

### Phase 11：Web Chat UI + 调试面板（Next.js）

> **交付物**：浏览器对话窗口 + 实时调试面板（画像/匹配/偏好检测/仲裁过程可视化）。
> 回退了原 Phase 11 的 OTel/prom-client/Streamlit（偏离项目焦点），改为聚焦核心的对话交互体验。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P11-1 | Next.js 项目初始化（`web/` 目录，TypeScript，Tailwind CSS） | 📋 | `web/package.json`, `web/next.config.ts` |
| P11-2 | ChatPanel 组件（消息列表 + 输入框 + 发送，调 `/api/conversation`） | 📋 | `web/app/page.tsx`, `web/components/ChatPanel.tsx` |
| P11-3 | DebugPanel 组件（画像快照 + 覆盖率匹配详情 + 偏好检测信号 + 仲裁决策） | 📋 | `web/components/DebugPanel.tsx` |
| P11-4 | 后端 `/api/conversation` 增加 `debug` 字段（返回画像/匹配/偏好/仲裁的完整中间数据） | 📋 | `presentation/api/conversation-handler.ts`, `application/agent.ts` |
| P11-5 | ProfilePanel 组件（当前画像状态 + 冷启动阶段 + 维度完整度） | 📋 | `web/components/ProfilePanel.tsx` |
| P11-6 | Fastify 代理 `/web` 路由到 Next.js dev server（开发模式）或静态托管（生产模式） | 📋 | `presentation/server.ts` |
| P11-7 | Web UI 集成测试 | 📋 | `web/` 内部测试 |

---
