# ecom-agent 代码架构全景讲解

> 本文件由 codebase-explainer 技能生成，可作为后续讲解的参考基线。

---

## 1. 模块与代码映射

| SPEC 章节 / 能力模块 | 核心代码文件 |
|----------------------|-------------|
| **2.1 用户画像引擎** — 领域实体 | `src/domain/types.ts`（20+ 接口）、`src/domain/entities/user-profile.entity.ts`（充血模型） |
| **2.1 用户画像引擎** — 画像构建 | `src/application/services/profile-engine/order-analyzer.ts`（订单→画像） |
| **2.1 用户画像引擎** — 维度 Plugin | `src/application/services/profile-engine/dimension-registry.ts` |
| **2.1 用户画像引擎** — 冷启动 | `src/application/services/profile-engine/cold-start-manager.ts` |
| **2.1 用户画像引擎** — 持久化 | `src/application/services/profile-store.ts`、`src/infra/adapters/redis.ts` |
| **2.2 轻量模型推理** — 覆盖率匹配 | `src/application/services/profile-engine/spec-inference.ts` |
| **2.2 轻量模型推理** — 模型槽位 | `src/application/services/model-slot/model-provider.ts`（cockatiel 弹性封装） |
| **2.2 轻量模型推理** — 槽位管理 | `src/application/services/model-slot/model-slot-manager.ts`（注册/切换/fallback） |
| **2.2 轻量模型推理** — 推理缓存 | `src/application/services/model-slot/inference-cache.ts` |
| **2.2 轻量模型推理** — A/B 路由 | `src/application/services/model-slot/ab-router.ts` |
| **2.3 会话记忆** — 滑动窗口 | `src/application/agent.ts`（第 55 行 `slice(-windowSize)`） |
| **2.4 EventBus** — 事件分级 | `src/domain/event-bus.ts`（Critical/Normal/Low + 死信队列） |
| **2.5 数据飞轮** | `src/application/services/data-flywheel/badcase-collector.ts`、`badcase-analyzer.ts`、`prompt-optimizer.ts`、`ab-experiment.ts` |
| **2.6 Workflow 路由** — 图引擎 | `src/application/workflow/workflow-graph.ts`（声明式 WorkflowGraph） |
| **2.6 Workflow 路由** — 意图路由 | `src/application/workflow/intent-router.ts`（规则 + LLM 双模式） |
| **2.6 Workflow 路由** — 4 个场景 | `product-consult.ts`、`after-sale.ts`、`logistics.ts`、`complaint.ts` |
| **2.7 Guardrails** | `src/application/guardrails/input-guard.ts`、`execution-guard.ts`、`output-guard.ts` |
| **表现层** — HTTP API | `src/presentation/server.ts`、`src/presentation/api/*.ts` |
| **表现层** — CLI | `src/presentation/cli/agent-cli.ts` |
| **基础设施** | `src/infra/config.ts`、`src/infra/adapters/llm.ts`、`redis.ts`、`product-service.ts` |

---

## 2. 系统架构图

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         表现层 (Presentation)                            │
│                                                                          │
│   ┌─────────────────────┐              ┌─────────────────────┐          │
│   │   Fastify HTTP API  │              │      CLI 对话       │          │
│   │  POST /conversation │              │   stdin/stdout      │          │
│   │  GET  /profile      │              │   滑动窗口 K=10     │          │
│   └─────────┬───────────┘              └─────────┬───────────┘          │
└─────────────┼────────────────────────────────────┼──────────────────────┘
              │  ① 用户消息                         │
              ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         应用层 (Application)                             │
│                                                                          │
│   ┌──── 安全护栏 (Guardrails) ────┐                                     │
│   │ 输入层: 注入检测 + 敏感词     │                                     │
│   │ 执行层: 工具权限白名单        │                                     │
│   │ 输出层: PII 脱敏 + 承诺合规   │                                     │
│   └───────────┬───────────────────┘                                     │
│               │  ② 安全检查通过                                          │
│               ▼                                                          │
│   ┌───────────────────────┐         ┌──────────────────────────┐        │
│   │  IntentRouter         │         │  ColdStartManager        │        │
│   │  规则匹配(零延迟)     │ ──────▶ │  cold→warm→hot 阶段判定  │        │
│   │  + LLM 意图分类       │         │  主动探索引导问题         │        │
│   └─────────┬─────────────┘         └──────────────────────────┘        │
│             │  ③ 路由到 Workflow                                         │
│             ▼                                                            │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │              WorkflowGraph 声明式图引擎                      │       │
│   │                                                              │       │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │       │
│   │  │ 商品咨询  │ │   售后   │ │   物流   │ │   投诉   │       │       │
│   │  │ greeting  │ │ issue_id │ │ order_id │ │ collect  │       │       │
│   │  │ → analysis│ │ → lookup │ │ → track  │ │ → assess │       │       │
│   │  │ → recomm  │ │ → solve  │ │ → notify │ │ → resolve│       │       │
│   │  │ → confirm │ │ → execute│ │          │ │ → follow │       │       │
│   │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │       │
│   └───────────────────────┬─────────────────────────────────────┘       │
│                           │  ④ 需要规格推荐？                            │
│                           ▼                                              │
│   ┌──────────────────────────────────────────┐                          │
│   │         SpecInferenceEngine               │                          │
│   │                                           │                          │
│   │  Step1: 覆盖率匹配(零模型调用)            │                          │
│   │    用户画像[160,170]cm × 商品[155,168]cm  │                          │
│   │    → 选覆盖率最高的 SKU                    │                          │
│   │                                           │                          │
│   │  Step2: 未命中 → ModelSlotManager          │                          │
│   │    8B(RL) → fallback 72B                  │                          │
│   └──────────────┬───────────────────────────┘                          │
│                  │  ⑤ 推理调用                                           │
│                  ▼                                                        │
│   ┌──────────────────────────────────────────┐                          │
│   │         ModelSlotManager                  │                          │
│   │  ┌────────────────────────────────┐      │                          │
│   │  │  ResilientModelProvider        │      │                          │
│   │  │  cockatiel: 重试+断路器+超时   │      │                          │
│   │  └────────────────────────────────┘      │                          │
│   │  ┌──────────┐  ┌──────────┐              │                          │
│   │  │ ABRouter │  │ InfCache │              │                          │
│   │  │ 流量分桶 │  │ Redis缓存│              │                          │
│   │  └──────────┘  └──────────┘              │                          │
│   └──────────────────────────────────────────┘                          │
│                                                                          │
│   ┌─── EventBus(分级) ─────────────────────────────────────────┐        │
│   │ Critical: model:fallback, system:error, guardrail:blocked  │        │
│   │ Normal:   message:*, profile:updated, model:inference      │        │
│   │ Low:      session:summary, badcase:prompt_optimized        │        │
│   │                                                             │        │
│   │  订阅者: SessionLog│Metrics│Alert│AutoPrompt│ConfigWatch   │        │
│   └─────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
              │                                     │
              │  ⑥ 持久化                           │  ⑦ 飞轮
              ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         领域层 (Domain)                                   │
│                                                                          │
│   ┌────────────────────────────┐     ┌──────────────────────────┐       │
│   │   UserProfileEntity        │     │   EventBus 事件定义       │       │
│   │   applyDelta() 画像合并    │     │   15 种事件类型           │       │
│   │   summarizeForPrompt()     │     │   3 级优先级              │       │
│   │   冷启动阶段自动转换        │     │   死信队列 + 错误隔离     │       │
│   └────────────────────────────┘     └──────────────────────────┘       │
│                                                                          │
│   ┌─ types.ts ─────────────────────────────────────────────────┐        │
│   │ UserSpecProfile · GenderSpecProfile · ProductSpecProfile   │        │
│   │ ModelSlot · WorkflowType · IntentResult · GuardrailResult  │        │
│   │ BadCase · SpecRecommendation · Message · AgentSession      │        │
│   └─────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       基础设施层 (Infrastructure)                         │
│                                                                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐       │
│   │ LLM 客户端│  │  Redis   │  │ 订单服务  │  │    配置中心       │       │
│   │ OpenAI SDK│  │ ioredis  │  │ Mock/HTTP │  │ .env → defaults  │       │
│   │ 兼容 vLLM │  │ +InMemory│  │          │  │                  │       │
│   └──────────┘  └──────────┘  └──────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 关键代码实现讲解

### 步骤 1：用户画像 — 充血领域实体

系统用 `UserProfileEntity` 封装画像数据和业务行为，而非贫血的纯数据结构。`applyDelta()` 是画像更新的核心——从订单或对话中提取的偏好增量，通过该方法合并到画像中，区间类特征自动扩大范围。

**核心代码**（`src/domain/entities/user-profile.entity.ts` 第 75~86 行）：
```
applyDelta(delta: ProfileDelta): Result<void, string> {
  if (delta.dimensionId === 'specPreference') {
    return this.applySpecDelta(delta);
  }
  this._dimensions.set(delta.dimensionId, {
    ...this._dimensions.get(delta.dimensionId),
    ...delta.delta,
  });
  this._spec.updatedAt = new Date().toISOString();
  this.recalcCompleteness();
  return ok(undefined);
}
```

**设计要点**：采用 `neverthrow` 的 `Result<T, E>` 返回类型，而非 throw 异常——调用方可以安全地链式处理成功/失败，不会有隐式控制流。`recalcCompleteness()` 在每次更新后自动重算画像完整度并触发冷启动阶段转换（cold → warm → hot）。

---

### 步骤 2：覆盖率匹配 — 零模型调用的规格推荐

核心推荐算法。用户画像的身体特征区间与商品规格的适用区间做重叠计算，按特征优先级加权，选覆盖率最高的 SKU。整个过程不调用任何模型，延迟趋近于零。

**核心代码**（`src/application/services/profile-engine/spec-inference.ts` 第 30~42 行）：
```
export function computeCoverage(userRange: NumericRange, productRange: NumericRange): number {
  const overlapMin = Math.max(userRange[0], productRange[0]);
  const overlapMax = Math.min(userRange[1], productRange[1]);
  if (overlapMin > overlapMax) return 0;

  const overlapLength = overlapMax - overlapMin;
  const userLength = userRange[1] - userRange[0];
  if (userLength === 0) {
    return (userRange[0] >= productRange[0] && userRange[0] <= productRange[1]) ? 1 : 0;
  }
  return overlapLength / userLength;
}
```

**设计要点**：覆盖率 = 区间重叠长度 / 用户区间长度（0~1）。当用户区间是一个点时退化为"是否落在商品区间内"。产品区间越完整覆盖用户区间，得分越高。

---

### 步骤 3：声明式 Workflow 图引擎

参考 LangGraph 的模式，Workflow 定义为节点 + 条件边的图结构。状态转换是声明式的，可视化、可回溯。

**核心代码**（`src/application/workflow/workflow-graph.ts` 第 54~66 行）：
```
async step(state: TState): Promise<TState> {
  const nodeId = state.currentNode;
  const handler = this.nodes.get(nodeId);
  if (!handler) throw new Error(`Node "${nodeId}" not found`);

  const newState = await handler(state);

  const edge = this.edges.get(nodeId);
  if (!edge) return newState;

  const nextNode = edge.type === 'fixed' ? edge.to! : edge.router!(newState);
  return { ...newState, currentNode: nextNode };
}
```

**设计要点**：`step()` 执行当前节点 handler，然后根据边类型决定下一个节点。状态不可变（`{ ...newState, currentNode }`），天然支持回溯和重放。

---

### 步骤 4：EventBus 事件分级 + 错误隔离

所有模块通过 EventBus 解耦。事件按优先级分为 Critical/Normal/Low，不同级别有不同的重试策略和失败处理。

**核心代码**（`src/domain/event-bus.ts` 第 42~50 行）：
```
publish(event: AgentEvent): void {
  const priority = getEventPriority(event.type);
  for (const sub of this.subscribers) {
    if (!sub.subscribedEvents.includes(event.type)) continue;
    const maxRetries = RETRY_BY_PRIORITY[priority];
    this.executeWithRetry(sub, event, maxRetries, priority);
  }
}
```

**设计要点**：Critical 事件重试 3 次 → 死信队列 → 告警；Normal 重试 1 次 → 日志；Low 不重试 → 静默。每个 Subscriber 独立错误边界，一个失败不影响其他。

---

### 步骤 5：Agent 主循环 — 编排者模式

`Agent.handleMessage()` 是系统中枢，本身不含业务规则——只负责编排：意图识别 → 冷启动判断 → Prompt 构建 → 模型调用 → 规格推荐 → 事件广播。

**调用链**（`src/application/agent.ts` 第 32~86 行）：
```
① eventBus.publish('message:user')          — 广播用户消息
② intentRouter.classify(userMsg)            — 意图路由
③ coldStartManager.getAction(profile)       — 冷启动检查
④ this.buildSystemPrompt(profile, intent)   — Prompt 构建（画像 + 场景指令 + 安全约束）
⑤ conversationHistory.slice(-windowSize)    — 滑动窗口截取
⑥ modelSlotManager.infer('conversation')    — 模型调用（含 fallback）
⑦ trySpecRecommendation(profile, userText)  — 规格推荐（商品咨询场景）
⑧ eventBus.publish('message:assistant')     — 广播助手回复
```

**设计要点**：依赖通过构造函数注入（`AgentDeps` 接口），手动 Composition Root 组装。滑动窗口是 v3.0 的简洁记忆方案。

---

### 步骤 6：三层安全护栏

Guardrails 在 API 层执行：输入检查在模型调用前，输出检查在返回用户前。

**注入检测**（`src/application/guardrails/input-guard.ts`）：
```
INJECTION_PATTERNS = [
  /忽略(上面|之前|以上)(的|所有)?(指令|规则|说明)/,    // 中文注入
  /ignore\b.*\b(instructions|rules)/i,                   // 英文注入
  /you are now/i, /system\s*prompt/i, /\bDAN\b/,
]
```

**执行层**（`execution-guard.ts`）：Workflow 工具白名单 + 金额/频率限制。
**输出层**（`output-guard.ts`）：PII 正则脱敏（手机号/身份证/银行卡）+ 未授权承诺拦截。

---

## 4. 项目统计

| 指标 | 数值 |
|------|------|
| 源文件 | 43 个 .ts |
| 测试文件 | 14 个 |
| 测试用例 | 123 个 (全部 PASS) |
| 类型检查 | tsc --noEmit 0 errors |
| 代码行数 | ~4500 LoC |
| 提交历史 | 13 commits (master 分支) |
