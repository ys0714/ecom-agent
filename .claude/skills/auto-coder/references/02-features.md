## 2. 核心特点

### 2.1 推荐解释性（三层结构化解释）

> 参考 FIRE（arxiv 2025，SHAP 忠实解释）、Amazon Fashion（社会证明）、Sizebay 行业数据（33% 购物者因尺码不确定放弃购物车）。
> 详细调研见 `.claude/skills/tech-researcher/references/profile-explainability-and-conflict.md`。

推荐解释采用**三层结构**，每层职责明确：

| 层级 | 职责 | 来源 |
|------|------|------|
| **结论层** | 一句话推荐结论 | 覆盖率算法输出 |
| **依据层** | 用户画像锚点 + 商品规格 + 匹配关系 | 画像数据 + 商品数据 + 特征覆盖率 |
| **信心层** | 根据置信度调整语气（高/中/低） | `profileCompleteness` + `recommendation.confidence` |

**解释生成接口**：

```typescript
interface ExplanationContext {
  profile: GenderSpecProfile;         // 用户画像
  productSpec: ProductSpecProfile;    // 命中的商品规格
  matchResult: SpecMatchResult;       // 覆盖率详情
  confidence: number;                 // 综合置信度
  orderCount: number;                 // 支撑订单数
  isTemporaryProfile: boolean;        // 是否为临时画像（为他人购买）
}

function generateExplanation(ctx: ExplanationContext): {
  conclusion: string;   // "这款羽绒服推荐 M 码"
  reasoning: string;    // "您近期购买的女装多为 M 码（身高 160-170cm...），该商品 M 码适合..."
  caveat: string;       // "如果您近期体型有变化，可以告诉我调整" 或 ""
}
```

**信心层策略**：

| 置信度 | 语气 | 示例 |
|--------|------|------|
| 高（≥ 0.7） | 直接推荐，不加修饰 | — |
| 中（0.3~0.7） | 推荐 + 轻微确认 | "如果您近期体型有变化，可以告诉我调整" |
| 低（< 0.3） | 不推荐，主动询问 | "请问您的身高体重大概是多少？" |
| 临时画像 | 推荐 + 建议核实 | "由于是首次为他选购，建议参考商品详情页确认" |

**关键原则**（FIRE 论文）：解释必须**忠实于覆盖率算法的实际计算结果**，不能让 LLM 自由编造。每个特征的匹配度直接来自 `computeCoverage()` 的输出。

### 2.2 对话偏好覆写与置信度仲裁（混合方案）

> 参考 ContraSolver（偏好图）、AWARE-US（约束放松）、ACL 2020（用户记忆图）。
> 方案决策调研见 `.claude/skills/tech-researcher/references/confidence-arbitration-model-hybrid.md`。

对话中用户可能表达与画像不一致的偏好。系统采用**规则快速路径 + LLM 深度路径**的混合方案：高确定性信号走规则（零延迟），低确定性/隐式偏好走模型（语义理解）。

**混合路由架构**：

```
            用户消息
               │
    ┌──────────┴──────────┐
    ▼                     ▼
 规则快速路径          LLM 深度路径
 (PreferenceDetector)  (ModelPreferenceAnalyzer)
 延迟: 0ms             延迟: ~200ms
    │                     │
    ▼                     ▼
 匹配到明确信号？       返回 LLMPreferenceSignal
 YES → 直接用规则结果    (含语义置信度 + scope + subject)
 NO  → 调用模型路径
    │                     │
    └──────────┬──────────┘
               ▼
      ConfidenceArbitrator
      (数值仲裁逻辑不变)
```

**规则快速路径**（零延迟，处理高确定性信号）：

| 覆写类型 | 触发关键词 | 置信度 |
|---------|-----------|--------|
| **明确纠正** | "我要L码"、"不要M" | 1.0 |
| **为他人购买** | "帮我老公买"、"给孩子选" | 0.4 |
| **主观偏好** | "要宽松的"、"修身款" | 0.6 |
| **画像纠正** | "我身高165cm"、"体重110斤" | 0.7 |

**LLM 深度路径**（规则未匹配时触发，处理隐式/模糊信号）：

```typescript
interface LLMPreferenceSignal extends PreferenceSignal {
  scope: 'this_turn' | 'session' | 'permanent';
  subject: 'self' | 'other';
  reasoning: string;
}
```

模型能识别规则无法覆盖的场景：
- 隐式偏好："这件太小了" → `fit_modifier`，confidence 由模型根据语境打分
- 主体判断："我朋友165cm帮看看" → `role_switch` + `subject: 'other'`（规则会误判为自己）
- 范围判断："一般穿M码" → `scope: 'permanent'` vs "这件想试试L" → `scope: 'this_turn'`

**置信度打分仲裁**（两条路径共用同一仲裁器）：

```typescript
function arbitrate(existing: number, incoming: PreferenceSignal): 'accept' | 'merge' | 'ignore' {
  if (incoming.type === 'explicit_override') return 'accept';
  if (incoming.confidence > existing * 1.2) return 'accept';
  if (incoming.confidence > existing * 0.8) return 'merge';
  return 'ignore';
}
```

**数据源置信度基准**：

| 来源 | 基础置信度 | 说明 |
|------|-----------|------|
| `order_history`（5+ 单） | 0.9 | 多次购买验证 |
| `order_history`（1-4 单） | 0.6 | 少量样本 |
| `explicit_override`（明确指定） | 1.0 | 最高优先 |
| `profile_correction`（纠正画像） | 0.7 | 应尊重 |
| `fit_modifier`（宽松/修身） | 0.6（规则）/ 模型动态打分 | 主观偏好 |
| `role_switch`（为他人购买） | 0.4（规则）/ 模型动态打分 | 临时画像 |
| LLM 深度路径输出 | 模型动态打分 0~1 | 基于对话上下文语义 |

**用户反馈闭环**：
- 用户接受推荐 → 该维度置信度 +0.1
- 用户修改规格后下单 → BadCase 信号 + 置信度 -0.1
- 用户明确纠正 → 直接覆写，无需仲裁

### 2.3 会话记忆与上下文管理

> 参考 arxiv 2603.07670（Memory for Autonomous LLM Agents, 2026）、LangGraph 双层记忆、Mem0 记忆层。
> 核心结论：**画像引擎本身就是长期记忆**（等价于 Mem0 的 fact extraction），唯一缺口是单会话内长对话的上下文丢失。

系统采用**画像 Store + 滑动窗口 + 分段压缩**的记忆架构：

- **画像 Store（跨会话持久）**：Redis（RedisJSON）+ JSON 文件落盘，用户的尺码/体重/偏好等结构化数据跨会话持久化，通过 `summarizeForPrompt()` 注入 System Prompt
- **滑动窗口（会话内实时）**：最近 K 轮对话（默认 K=10）保留完整消息，FIFO 淘汰
- **分段压缩（窗口外摘要）**：溢出窗口的消息按段压缩为结构化摘要，被动注入 System Prompt，防止长对话丢失关键上下文（如角色切换、尺码纠正）
- **会话持久化**：SessionManager + JSONL append-only 写入，支持按 sessionId 重建

**分段压缩机制**：

```
窗口溢出触发 → 溢出消息分段（固定5轮 or 角色切换强制分段）
    → LLM 压缩为 CompressedSegment（摘要 + keyFacts + turnRange）
    → 被动注入 System Prompt 的 [历史摘要] 区域
```

```typescript
interface CompressedSegment {
  segmentIndex: number;
  turnRange: [number, number];  // JSONL 行号范围，可回查原始消息
  summary: string;              // "用户为老公选购夹克，身高178体重155斤"
  keyFacts: string[];           // ["角色切换:male", "身高:178", "体重:155"]
  intent: WorkflowType;
}
```

**Prompt 拼接结构**：

```
System Prompt = 画像摘要 + [历史摘要]（压缩段索引列表） + 场景指令 + Guardrails 约束
Messages = 滑动窗口内的完整消息（最近 K 轮）
```

**设计决策记录**：
- 不实现 L1/L2/L3 三层分层记忆（画像 Store 已覆盖长期记忆需求，分层检索是过度设计）
- 不引入向量记忆（Mem0 式）（与结构化画像引擎功能重复）
- 摘要被动注入而非主动检索（当前 Agent 无 tool use / ReAct 循环，被动注入零延迟）
- 主动检索（`recall_context` tool）作为中期演进方向，需先实现 ReAct 循环

### 2.4 EventBus + Subscriber 运行时解耦

所有核心行为通过 `InMemoryEventBus<AgentEvent>` 发布-订阅，实现运行时与监控采集的完全解耦。事件按 Critical/Normal/Low 三级分发，每个 Subscriber 运行在独立错误边界内。

**六大 Subscriber**：SessionLogSubscriber（JSONL 日志）、MetricsSubscriber（推理延迟/降级率）、AlertSubscriber（连续降级告警）、AutoPromptSubscriber（飞轮触发）、ConfigWatchSubscriber（配置审计+回滚）、ReplaySubscriber（会话回放，预留）。

新增 Subscriber 只需实现 `EventSubscriber` 接口并调用 `registry.register()`。

### 2.5 数据飞轮 — Analyze → Measure → Improve 闭环

> 参考 OpenAI Evaluation Flywheel（Analyze→Measure→Improve）、Meta CharacterFlywheel（15 代模型迭代）、Agenta LLMOps 5 步生产飞轮。

系统实现基于生产 Trace 数据的**闭环改进飞轮**，核心原则：**先能度量，再谈改进**。不是"自动优化 Prompt"的黑盒，而是"量化问题 → 调参数 → 验证效果"的工程化循环。

#### 2.5.1 Trace 采集（完整决策上下文）

每次推荐交互记录完整的决策链路，而非仅存用户消息和回复。BadCase 必须携带足够的上下文用于根因分析：

```typescript
interface BadCaseTrace {
  promptVersion: string;                // 当时用的 Prompt 版本
  profileSnapshot: UserSpecProfile;     // 当时的画像状态
  profileCompleteness: number;
  coldStartStage: ColdStartStage;

  specMatchResult: {                    // 覆盖率匹配详细打分
    attempted: boolean;
    topCandidates: Array<{
      propValueId: string;
      coverage: number;
      featureBreakdown: Record<string, number>;
    }>;
    selectedSpec: string | null;
    fallbackToModel: boolean;
  };

  intentResult: IntentResult;
  workflow: WorkflowType;
}
```

#### 2.5.2 自动评估器（Measure 层）

飞轮的核心前提是**能自动打分**。系统定义 `SpecRecommendationEvaluator`，持续计算推荐质量指标：

| 指标 | 计算方式 | 目标 |
|------|---------|------|
| **推荐准确率** | 用户最终下单规格 === 系统推荐规格 | ≥ 70% |
| **首次接受率** | 用户未修改推荐规格直接下单 / 总推荐次数 | ≥ 60% |
| **覆盖率匹配有解率** | 覆盖率算法命中 / 总推荐请求 | ≥ 80% |
| **模型 fallback 率** | 走了模型推理 / 总推荐请求 | ≤ 20% |

评估器每日自动计算并输出趋势，指标下降时触发飞轮分析。

#### 2.5.3 多维根因归因（Analyze 层）

替代旧版的"信号→失败模式"一对一硬编码映射。每个 badcase 结合 Trace 上下文做**多维归因**，一个 badcase 可能同时有多个失败原因：

| 归因维度 | 判定条件 | 对应旋钮 |
|---------|---------|---------|
| `cold_start_insufficient` | `profileCompleteness < 0.3` | 冷启动阈值 |
| `low_coverage_match` | 覆盖率匹配有解但 top coverage < 0.5 | 特征优先级权重 |
| `coverage_no_match` | 覆盖率匹配完全无解 | 匹配范围扩大策略 |
| `model_fallback_quality` | 走了模型 fallback 但用户仍拒绝 | 模型质量 / Prompt |
| `presentation_issue` | 推荐了正确规格但用户拒绝（话术问题） | System Prompt 话术 |
| `profile_stale` | 画像最后更新 > 30 天 | 画像更新频率 |

#### 2.5.4 可调旋钮 + 参数优化（Improve 层）

飞轮的 Improve 不是"让 72B 写新 Prompt"，而是**调具体的参数旋钮**，每个旋钮有明确的调优方向：

| 旋钮 | 位置 | 调优方向 | 触发条件 |
|------|------|---------|---------|
| `FEATURE_PRIORITY` | `spec-inference.ts` | 调整 height/weight/bust 等的排序权重 | `low_coverage_match` 频率 > 20% |
| `MIN_RECOMMEND_CONFIDENCE` | Agent 推荐逻辑 | 调高=保守推荐，调低=激进推荐 | `presentation_issue` 频率 > 15% |
| `COMPLETENESS_THRESHOLDS` | `user-profile.entity.ts` | 调整 cold/warm/hot 边界 | `cold_start_insufficient` 频率 > 30% |
| `SLIDING_WINDOW_SIZE` | `config.ts` | 增大=更多上下文但更贵 | `context_lost` 相关 badcase |
| **System Prompt 话术** | `agent.ts` `buildSystemPrompt()` | 修改推荐呈现方式 | `presentation_issue` 显著时 |

参数调优通过 RuntimeConfig 热更新生效，无需重启服务。

#### 2.5.5 A/B 验证 + 回流

```
评估器检测到指标下降
        ↓
  ① 根因归因（按 Trace 上下文自动分类）
        ↓
  ② 定位最大失败模式 → 确定对应旋钮
        ↓
  ③ 生成调优方案（参数值变更 or Prompt 修改）
        ↓
  ④ A/B 验证（灰度 10%，Z-test，最小样本 ≥1000）
     成功定义：spec_accepted（用户接受推荐规格）
              session_purchase（本次会话有购买）
        ↓
  ⑤ promote → 参数自动全量生效（RuntimeConfig 更新）
     rollback → 回退参数，记录失败原因
        ↓
  ⑥ 评估器重新打分 → 循环
```

**触发机制**：
- **指标驱动**：评估器检测到推荐准确率周环比下降 > 5% 时自动触发
- **定时触发**：每周强制运行一次飞轮分析，即使指标稳定
- **手动触发**：`POST /admin/flywheel/trigger`
- **冷启动过滤**：`coldStartStage === 'cold'` 的用户产生的 BadCase 不进入飞轮

#### 2.5.6 飞轮架构演进与最佳实践 (基于开源社区调研)

> 详细调研见 `references/data-flywheel-best-practices.md`。

基于开源社区与业界（如 NVIDIA Data Flywheel、电商 AIGQ）的最新最佳实践，系统在数据飞轮架构上引入以下核心决策：

1. **动态 Few-shot 飞轮 (Prompt 层)**：
   - 引入轻量级本地向量存储（如 ChromaDB）管理优质 Case。将线上表现差的 Bad Case 修正后存入向量库，在后续推理时通过 RAG 动态召回作为 System Prompt 的 Few-shot 示例，实现免微调的快速系统修复。
2. **合成数据冷启动 (Synthetic Data)**：
   - 针对系统初期缺乏真实交互数据的问题，预先通过脚本或大模型生成一批典型的电商客服对话与 Bad Case，以此转动第一波“动态 Few-shot 飞轮”。
3. **混合反馈信号采集 (UI + 业务层)**：
   - 闭环反馈的触发不仅依赖**隐式行为**（如用户修改尺码、发生退单），同时在前端 UI 增加**显式评价**（点赞/踩），两者结合作为系统的强化/惩罚信号。
4. **标准化数据资产落盘 (模型层储备)**：
   - 采用标准 JSONL 格式（兼容 OpenAI 格式）落盘所有交互的 Trace 上下文，为未来的模型蒸馏（如微调小尺寸模型替代大模型）夯实数据基建。

### 2.6 Agent Workflow 路由

电商客服场景涵盖商品咨询、售后、物流、投诉等多种意图。系统引入**声明式图结构**定义 Workflow，参考 LangGraph 的状态机模式：节点是处理函数，边是条件路由，状态是共享数据结构。

**意图路由器（`IntentRouter`）**：

```typescript
interface IntentRouter {
  classify(message: Message, context: ConversationContext): Promise<IntentResult>;
}

interface IntentResult {
  intent: WorkflowType;
  confidence: number;
  entities: Record<string, string>;
}

type WorkflowType =
  | 'product_consult'     // 商品咨询（规格推荐、比价）
  | 'after_sale'          // 售后（退款、退货、换货）
  | 'logistics'           // 物流查询
  | 'complaint'           // 投诉处理
  | 'general';            // 通用闲聊/兜底
```

路由支持**双模式**：规则快速路由（关键词匹配，零延迟）作为 LLM 意图分类的前置快速路径。

**声明式 Workflow Graph**（参考 LangGraph 模式）：

```typescript
interface WorkflowGraph<TState> {
  addNode(id: string, handler: NodeHandler<TState>): this;
  addEdge(from: string, to: string): this;
  addConditionalEdge(from: string, router: (state: TState) => string): this;
  setEntryPoint(nodeId: string): this;
  compile(): CompiledWorkflow<TState>;
}

// 使用示例：商品咨询 Workflow
const productConsult = new WorkflowGraph<ConsultState>()
  .addNode('greeting', greetingHandler)
  .addNode('need_analysis', analyzeHandler)
  .addNode('recommendation', recommendHandler)
  .addNode('spec_selection', specHandler)
  .addNode('confirmation', confirmHandler)
  .addEdge('greeting', 'need_analysis')
  .addConditionalEdge('need_analysis', (state) =>
    state.hasEnoughInfo ? 'recommendation' : 'need_analysis')
  .addConditionalEdge('recommendation', (state) =>
    state.userSatisfied ? 'spec_selection' : 'need_analysis')
  .addEdge('spec_selection', 'confirmation')
  .setEntryPoint('greeting')
  .compile();
```

**设计优势**（相比面向对象的 `onMessage/onEnter/onExit`）：
- 状态转换**可视化**（可直接生成流程图）
- 支持**循环和回溯**（如推荐不满意 → 重新分析需求）
- 支持**人工介入**（任意节点可暂停，等待人工审核后恢复）
- 新增 Workflow 只需声明图结构并注册到 `WorkflowRegistry`

**内置 Workflow**：

| Workflow | 核心工具 | 状态节点 |
|----------|---------|---------|
| `ProductConsultWorkflow` | 查询商品、规格推理、比价 | `greeting → need_analysis → recommendation → spec_selection → confirmation` |
| 其他 Workflow | 售后/物流/投诉（骨架实现） | 见 `application/workflow/*.ts` |

### 2.7 Agent Guardrails 安全护栏

电商客服 Agent 实现**输入/执行/输出三层防护**：

| 层 | 防护项 | 方法 |
|----|--------|------|
| 输入 | Prompt 注入检测 | 中英文正则模式匹配 |
| 输入 | 敏感词过滤 | 可配置关键词库 |
| 输入 | 用户身份绑定 | Session 校验 |
| 执行 | 工具调用权限 | Workflow 白名单 |
| 执行 | 金额/频率限制 | 阈值校验 |
| 输出 | PII 脱敏 | 手机号/身份证/银行卡正则替换 |
| 输出 | 承诺合规检查 | "保证退全款"等未授权承诺拦截 |

触发时通过 `EventBus.publish('guardrail:blocked')` 广播，AlertSubscriber 记录告警。


---
