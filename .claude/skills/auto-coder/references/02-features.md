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

### 2.3 会话记忆与 Context Window 四层架构管理

> 参考 Claw 四层记忆机制与 Context Window 物理组装策略。
> 核心结论：大模型的记忆管理本质是对 Context Window（Token 资源）的排兵布阵。系统采用按“抗压缩级别”与“加载时机”划分的**四层记忆架构**，解决超长对话和多意图穿插导致的上下文遗忘问题。

系统在 `Agent.handleMessage()` 组装 Prompt 时，严格遵循以下四层物理结构：

**第一层：Bootstrap 层（系统基座，绝对免疫压缩）**
- **定位**：放置在 Prompt 最顶端，每次会话强制加载，无论对话多长绝不能被压缩或截断。
- **内容**：
  - **SOUL 约束**：系统的“宪法”与角色设定（如 Guardrails 约束："不能做出退款承诺"）。
  - **USER 长期记忆**：用户画像数据。由 `ProfileStore`（永久画像）和 `SessionProfileStore`（当前会话临时画像）合并后生成 `profile.summarizeForPrompt()`。
- **作用**：确保 Agent 始终保持正确的服务边界，且永远不会忘记用户的核心身形数据和明确偏好。

**第二层：Conversation History（受压缩的历史层）**
- **定位**：承载对话上下文，随着对话轮数增加会占用大量 Token。
- **机制**：
  - **滑动窗口**：最近 K 轮对话保留完整消息文本。
  - **分段压缩（Compaction）**：由 `SegmentCompressor` 处理，溢出滑动窗口的历史消息会被压缩为精简的结构化摘要，以高信息密度取代原始 Token。

**压缩段数据结构与索引**：
```typescript
interface CompressedSegment {
  segmentIndex: number;
  turnRange: [number, number];  // 核心指针：JSONL 会话文件中的行号范围
  tokenUsage: number;           // 压缩后的 Token 估算消耗
  summary: string;              // 简短自然语言摘要
  factSlots: {                  // 事实槽位化摘要（减少信息丢失）
    who: string;                // 交互主体 (如 "给老公买")
    intent: WorkflowType;       // 核心意图
    constraints: string[];      // 明确的偏好和约束 (如 ["宽松", "不要黑色"])
    decisions: string[];        // 已达成的决策 (如 ["选了M码", "确认退货"])
    open_questions: string[];   // 待解决的问题
  };
}
```
*注：这里的摘要从“纯自然语言”升级为“事实槽位化摘要+动态压缩”。系统根据当前 Context 预算决定保留原文还是仅保留事实槽位。`turnRange` 核心指针使得大模型在需要时能通过 Tool 调用无损回捞原文。*

**第三层：Tool Results（按需检索的工作记忆层）**
- **定位**：仅在当前轮次需要时动态注入的外部知识，用完即抛，不污染长期上下文。
- **内容**：
  - **外部事实**：如 `ProductService` 刚刚查到的“商品 p101 的详细规格和材质”。
  - **Few-shot RAG**：通过 `ChromaDB` 动态召回的历史优秀回复案例。
  - **历史原文检索 (`recall_history`)**：大模型阅读第二层的“历史摘要”后，如果认为缺乏细节，可通过 Tool Call 传入 `turnRange`，系统将原始对话读取并注入到本层，实现**无损细节回溯**。

**第四层：Current Message（当前消息层）**
- **定位**：Prompt 的最底部，大模型注意力机制最集中的区域。
- **内容**：用户刚刚发送的最新输入。

**全量会话保留策略 (Auditable Session Retention)**：
除了四层上下文管理大模型的“工作记忆”，系统还在底层维持一个不可变的 **全量事件日志 (Event-Sourced JSONL Log)**：
- 每一次用户的输入 (`message:user`)、大模型的输出 (`message:assistant`)、工具调用 (`tool:call`/`tool:result`) 均作为离散事件追加写入。
- **检测与评估**：通过 `SessionLogSubscriber` 保留结构化数据，提供 100% 完整的对话和推理 Trace。大模型的上下文窗口可以任意压缩和丢弃，但管理员和 Eval 脚本随时可以通过离线 JSONL 解析或 API 回放整个会话的每个字节。

**Prompt 组装伪代码示例**：

```typescript
const messages: Message[] = [
  { role: 'system', content: [
    // 1. Bootstrap Layer (免疫压缩)
    `<SOUL>${GUARDRAILS}</SOUL>\n<USER_PROFILE>${profile.summarize()}</USER_PROFILE>`,
    // 2. Conversation History Layer
    compressor.getSummaryForPrompt(), // 早期对话压缩为 factSlots
    // 3. Tool Results Layer (按需检索的工作记忆)
    `<PRODUCT_INFO>${productDetail}</PRODUCT_INFO>\n<FEW_SHOT>${fewShotExamples}</FEW_SHOT>`
  ].join('\n\n') },
  
  // 4. Current Message Window (滑动窗口)
  ...slidingWindow // 最近 K 轮完整对话（包含当前 userText）
];
```

**画像存储的双轨制设计**：
1. **`ProfileStore` (持久化主画像)**：记录基于订单推算或用户明确纠正的全局稳定身形数据（落盘+Redis）。
2. **`SessionProfileStore` (会话级临时画像)**：记录当前情境下的临时状态（例如：“今天帮老公看衣服”导致的角色切换与临时体重信息，设置 24h TTL）。
3. 每次对话时，系统会在内存中动态合并两者，既保证了当前情景推荐的准确性，又避免了单次给他人代购污染用户的永久主画像。

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

#### 2.5.2 自动评估器（Measure 层：LLM-as-a-Judge）

飞轮的核心前提是**能自动打分**。系统定义 `SpecRecommendationEvaluator`，持续计算推荐质量指标：

| 维度 | 指标 | 计算方式 / 数据源 | 目标 |
|------|------|---------|------|
| **硬规则** | 推荐准确率 | 用户最终下单规格 === 系统推荐规格 | ≥ 70% |
| **硬规则** | 首次接受率 | 用户未修改推荐规格直接下单 / 总推荐次数 | ≥ 60% |
| **硬规则** | 模型 fallback 率 | 走了模型推理 / 总推荐请求 | ≤ 20% |
| **软质量** | 语义有用性 (Helpfulness) | **LLM-as-a-Judge** (抽样 10% 会话交由大参数模型评分) | ≥ 4.0/5.0 |
| **软质量** | 护栏合规度 (Safety) | **LLM-as-a-Judge** (抽样大模型评估语气及承诺边界) | ≥ 4.8/5.0 |

评估器不仅计算客观的接受率，还会**通过定时批处理任务调用大模型 API**，对落盘的历史 Session 进行深度的软质量打分。评分低于阈值时，自动触发飞轮分析。

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

#### 2.5.4 可调旋钮与动态 Prompt (Improve 层)

飞轮的 Improve 主要通过两大维度生效：**调优业务参数** 与 **动态更新 Few-shot Prompt**。

| 旋钮 / 动态注入 | 位置 / 机制 | 调优方向 | 触发条件 |
|------|------|---------|---------|
| `FEATURE_PRIORITY` | `spec-inference.ts` | 调整 height/weight/bust 等的排序权重 | `low_coverage_match` 频率 > 20% |
| `MIN_RECOMMEND_CONFIDENCE` | Agent 推荐逻辑 | 调高=保守推荐，调低=激进推荐 | `presentation_issue` 频率 > 15% |
| `COMPLETENESS_THRESHOLDS` | `user-profile.entity.ts` | 调整 cold/warm/hot 边界 | `cold_start_insufficient` 频率 > 30% |
| **动态 Few-Shot RAG** | `Agent.buildSystemPrompt()` | 将 LLM-as-a-Judge 评出的优质回复存入 ChromaDB，并在相近场景下作为示例实时召回 | 解决单纯参数调优无法覆盖的“话术与语气”问题 |

参数调优通过 RuntimeConfig 热更新生效；动态 Few-shot 通过在 ChromaDB 中 Upsert 数据自动在下次请求中生效。

#### 2.5.5 A/B 验证 + 回流 (闭环测试)

```
评估器检测到指标下降或捕获优质案例
        ↓
  ① 根因归因（按 Trace 上下文分类）/ LLM 优质判定
        ↓
  ② 定位最大失败模式 → 确定对应旋钮 / 提取优质对话对
        ↓
  ③ 生成调优方案（参数值变更） / 写入向量库供 Few-shot RAG
        ↓
  ④ 严格 A/B 验证（针对新参数或加入 Few-shot 的新 Prompt，灰度 10% 流量）
     成功定义：LLM-Judge 评分显著上升，且 spec_accepted 提升
        ↓
  ⑤ promote → 全量生效
     rollback → 撤销 Few-shot 或回退参数，记录失败原因
        ↓
  ⑥ 评估器重新打分 → 循环
```

**触发机制**：
- **隐式信号触发**：当 `Agent` 识别到用户的拒绝偏好 (`explicit_override`) 时发出 `badcase:detected` 事件。
- **显式信号触发**：在 UI 侧新增反馈接口（点赞/点踩），点踩时记录 `user_rejection` 信号。
- **定时触发**：每天通过 LLM-as-a-Judge 对全量/抽样日志进行打分，高分进 Few-shot 池，低分进 Badcase 池。
- **冷启动过滤**：`coldStartStage === 'cold'` 的用户产生的 BadCase 不计入。

#### 2.5.6 飞轮架构演进与可观测性基建 (基于 Langfuse)

系统采用业界标准的开源 LLMOps 工具链构建可观测性底座：

1. **统一的 OTel 遥测与 Langfuse 接入**：
   - 彻底废弃非标的内部跟踪展示面板，引入标准的 OpenTelemetry LLM 语义。
   - `OpenTelemetrySubscriber` 将运行时的 Span（包括耗时、Prompt、Token消耗、模型路由）直接导出至自托管的 **Langfuse** 或 **Phoenix** 容器中，实现工业级面板与成本追踪。
2. **动态 Few-shot 飞轮 (Prompt 层)**：
   - 通过 LLM-Judge 结合 Langfuse 数据选出表现优异的对话。将其作为黄金示例存入本地向量库，并在后续推理时 RAG 召回，低成本实现行为修正，必须配合 A/B 测试验证其对留存和转化的提升。
3. **混合反馈信号采集 (UI + 业务层)**：
   - 将用户前端的显式点赞/点踩，通过 Langfuse SDK 关联到对应 Session Trace，实现闭环。
4. **标准化数据资产落盘 (模型蒸馏储备)**：
   - 所有原始交互数据以 JSONL 离线落盘，为未来从 72B 大模型向本地 8B/1.5B 小模型的 SFT（监督微调）打好资产基础。

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

### 2.8 鲁棒性与上下文保护机制 (Robustness & Context Preservation)

在真实的对话场景中，用户的意图经常会发生跳跃或语义降级（例如上一句“想买某童装”，下一句直接跳到“身高130cm”）。为保证 Agent 稳定性与多轮状态一致性，系统引入了运行时上下文保护机制：

1. **上下文意图重估 (Intent Re-evaluation)**：当用户进行画像纠正时，单轮意图识别可能会将其判定为 `general`。系统会自动回溯历史对话，如果发现最近讨论过具体商品，则**强制将意图重估为 `product_consult`**，并在内部级联商品 ID，保证规格推荐流程不断链。
2. **基于商品的隐式角色推断 (Implicit Role Switching)**：不完全依赖用户显式声明（如“给孩子买”）。系统会解析当前或历史涉及商品的 `targetAudience`（受众群体）。当发现目标商品属于童装或特定性别时，即使未检测到 `role_switch` 信号，系统也会**自动推断并静默切换当前 `activeRole`**（如 `child`），并确保随后收集到的画像数据精准存入该角色的独立档案。
3. **大模型幻觉后处理层 (Output Sanitization)**：由于推荐是由系统后台精准计算并追加的，为防止 LLM 自身输出“我目前无法为您推荐”等防御性废话，或自行编造规格产生冲突，系统在最终组装回复前，会主动通过正则清洗 LLM 原始输出中的伪推荐文案，确保规格推荐权完全收敛在系统的覆盖率算法层。


---
