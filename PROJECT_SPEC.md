# 电商客服 Agent 系统

> 版本：1.0 — 基于画像驱动的智能客服对话系统
> 本系统消费的用户画像和商品画像由独立的画像提取系统生产（维护在独立仓库或 `profile-extraction` 分支）。
> 两个系统通过 `UserSpecProfile` / `ProductSpecProfile` 数据契约连接。

## 目录

- [1. 系统概述](#1-系统概述)
  - [1.1 项目聚焦点与边界](#11-项目聚焦点与边界)
- [2. 核心特点](#2-核心特点)
  - [2.1 推荐解释性](#21-推荐解释性三层结构化解释)
  - [2.2 对话偏好覆写与置信度仲裁](#22-对话偏好覆写与置信度仲裁)
  - [2.3 会话记忆与上下文管理](#23-会话记忆与上下文管理)
  - [2.4 EventBus + Subscriber](#24-eventbus--subscriber-运行时解耦)
  - [2.5 数据飞轮](#25-数据飞轮--analyzemeasureimprove-闭环)
  - [2.6 Agent Workflow 路由](#26-agent-workflow-路由)
  - [2.7 Agent Guardrails](#27-agent-guardrails-安全护栏)
- [3. 系统架构与模块设计](#3-系统架构与模块设计)
- [4. 测试与评估方案](#4-测试与评估方案)
- [5. 项目排期](#5-项目排期)
- [6. 可扩展性与未来展望](#6-可扩展性与未来展望)

---

## 1. 系统概述

本系统是**电商客服智能 Agent**，核心 LLM 为对话模型（如 DeepSeek-Chat），服务于电商客服与用户的多轮对话场景。系统消费由画像提取系统（SPEC-A）生产的用户画像和商品画像，在对话中提供精准的规格推荐、偏好仲裁和解释性回复。

### 1.1 项目聚焦点与边界

本项目聚焦于一个高价值、可量化、可持续优化的垂直问题：**服饰场景下的尺码与规格决策**。

**聚焦点（What we optimize）**：

- **业务目标**：降低“尺码不确定”带来的咨询阻塞、下单犹豫与退换货风险
- **系统目标**：让每次推荐都具备“可解释、可追踪、可复盘”的决策链路
- **体验目标**：在多轮对话中稳定保持角色一致性与偏好一致性，减少上下文遗忘

**边界声明（What we do not optimize first）**：

- 不把系统定位为开放域聊天机器人
- 不优先追求“泛化回答能力”，优先保证“推荐正确率与稳定性”
- 不在核心推荐路径中引入不可验证、不可回放的黑盒策略
- 不做与规格推荐弱相关的复杂 Agent 编排能力堆叠

**核心能力**：

- **推荐解释性**：三层结构化解释（结论层 + 依据层 + 信心层），忠实于覆盖率算法计算结果
- **对话偏好仲裁**：规则快速路径（零延迟） + LLM 深度路径（语义理解）的混合方案
- **会话记忆**：画像 Store（跨会话持久）+ 滑动窗口 + 分段压缩（窗口外上下文保留）
- **数据飞轮**：BadCase Trace 采集 → 自动评估 → 根因归因 → 旋钮调优 → A/B 验证闭环
- **Workflow 路由**：基于意图识别的声明式图结构（商品咨询、售后、物流、投诉）
- **安全护栏**：输入注入检测 / 执行权限校验 / 输出 PII 脱敏三层防护

### 设计理念

> 参考 2026 年开源社区与行业实践（Anthropic Agent patterns/evals、OpenAI Agents guardrails+tracing、AutoGen HITL、Letta 分层记忆），本项目设计理念升级为“**可靠性优先的 Agent 工程原则**”。

#### 一、设计原则（Do）

| 原则 | 说明 | 在本项目中的落点 |
|------|------|------|
| **Reliability over Autonomy** | 在客服场景中优先稳定可控，而非追求最大自治 | 规则优先 + 模型兜底；覆盖率匹配先于自由生成 |
| **Deterministic Orchestration** | 用显式状态机/工作流承载主链路，降低随机漂移 | `IntentRouter` + Workflow 路由 + 显式工具调用回路 |
| **Bounded Agent Loop** | Agent 循环必须有边界（轮次、超时、失败退化） | 模型槽位 timeout/retry/fallback + 错误降级文案 |
| **Trace-First Engineering** | 任何线上问题都要可回放到“用户输入→工具调用→输出” | `turn:trace`、`tool:call`、`model:inference` 全链路事件 |
| **Eval-Driven Iteration** | 以评测驱动迭代，区分能力提升与回归保护 | Vitest + 回归套件 + BadCase 采集/归因闭环 |
| **Guardrails as Runtime Gate** | 护栏是运行时闸门，不是提示词附属品 | 输入/执行/输出三层 Guardrails + tripwire 思路 |
| **Memory Hierarchy by Cost** | 按 token 成本和关键性分层记忆，按需检索 | Bootstrap/History/Tool Results/Current 四层记忆 |
| **Agent-Computer Interface (ACI)** | 工具接口要“对模型友好”，避免歧义参数 | `recall_history(startTurn,endTurn)` 明确参数与回填格式 |

#### 二、反模式（Don’t）

| 反模式 | 风险 |
|------|------|
| **Prompt 堆砌替代流程控制** | 难调试、不可回归、行为漂移明显 |
| **无上限的 Agent 自主循环** | 延迟失控、成本失控、错误级联 |
| **只有日志没有结构化 trace** | 事故难复盘，无法定位“哪一步错” |
| **只做离线评测不做线上回归** | 迭代后质量回退难以及时发现 |
| **把记忆全部塞进上下文窗口** | token 浪费、关键信息被淹没 |

#### 三、落地检查清单（Release Gate）

- **可靠性**：关键链路具备超时、重试、回退与降级响应
- **可观测性**：每轮有完整 trace（含 tool calls、latency、intent、memory）
- **可评测性**：能力评测与回归评测均可自动运行
- **安全性**：输入/执行/输出护栏可拦截并留痕
- **可维护性**：新增场景通过 workflow/plugin 扩展，而非修改主干分支逻辑

---

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
  summary: string;              // "用户为老公选购夹克，身高178体重155斤"
  keyFacts: string[];           // ["角色切换:male", "身高:178", "体重:155"]
  intent: WorkflowType;
}
```
*注：这里的摘要不仅是总结，更是**索引目录**。`turnRange` 指针使得大模型在需要时能够准确找回原始细节。*

**第三层：Tool Results（按需检索的工作记忆层）**
- **定位**：仅在当前轮次需要时动态注入的外部知识，用完即抛，不污染长期上下文。
- **内容**：
  - **外部事实**：如 `ProductService` 刚刚查到的“商品 p101 的详细规格和材质”。
  - **Few-shot RAG**：通过 `ChromaDB` 根据当前问题动态召回的优秀历史回复案例。
  - **历史原文检索（规划中）**：大模型阅读第二层的“历史摘要”后，如果认为缺乏细节，可通过 Tool Call 传入 `turnRange`，系统将原始对话读取并注入到本层，实现**无损细节回溯**。

**第四层：Current Message（当前消息层）**
- **定位**：Prompt 的最底部，大模型注意力机制最集中的区域。
- **内容**：用户刚刚发送的最新输入。

**Prompt 组装伪代码示例**：

```typescript
const messages: Message[] = [
  // 1. Bootstrap Layer (免疫压缩)
  { role: 'system', content: `<SOUL>${GUARDRAILS}</SOUL>\n<USER_PROFILE>${profile.summarize()}</USER_PROFILE>` },
  
  // 2. Conversation History Layer
  ...compressor.getSummaryAsMessages(), // 早期对话摘要
  ...slidingWindow,                      // 最近 K 轮完整对话
  
  // 3. Tool Results Layer (按需检索的工作记忆)
  { role: 'system', content: `<PRODUCT_INFO>${productDetail}</PRODUCT_INFO>\n<FEW_SHOT>${fewShotExamples}</FEW_SHOT>` },
  
  // 4. Current Message Layer
  { role: 'user', content: userText }
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

## 4. 测试与评估方案

### 4.1 单元测试

| 测试模块 | 框架 | 覆盖范围 | 优先级 |
|---------|------|---------|--------|
| **画像领域实体** | Vitest | `UserProfileEntity.applyDelta()` / `summarizeForPrompt()` | P0 |
| **冲突仲裁** | Vitest | `ConfidenceArbitrator` 置信度计算与仲裁 | P0 |
| **模型槽位** | Vitest + Mock | `ModelSlotManager` 注册/切换/健康检查 | P0 |
| **分段压缩** | Vitest | 滑动窗口溢出触发、摘要生成、System Prompt 注入 | P1 |
| **EventBus** | Vitest | 事件分级分发、Subscriber 错误隔离 | P0 |
| **Workflow 路由** | Vitest + Mock | `IntentRouter` 意图分类、Workflow 状态转换 | P0 |
| **冷启动策略** | Vitest | 四级冷启动阶段判定、主动询问话术生成 | P1 |

### 4.2 集成测试

| 测试场景 | 框架 | 覆盖范围 | 优先级 |
|---------|------|---------|--------|
| **端到端流程** | Vitest + Mock API | 画像加载 → 对话更新 → 冲突仲裁 → 持久化 | P0 |
| **冷启动 → 成熟画像** | Vitest | 模拟新用户从 L0（零画像）经过多轮对话 + 下单逐步升级到 L3（成熟画像） | P0 |
| **多轮对话冲突** | Vitest | 模拟 10 轮对话，包含 3 次冲突，验证仲裁结果和画像稳定性 | P0 |
| **Workflow 切换** | Vitest + Mock LLM | 模拟"商品咨询"→"物流查询"→"售后"的意图切换，验证上下文继承 | P0 |
| **会话持久化恢复** | Vitest | 写入 JSONL → 进程重启 → 重建会话 → 验证画像状态一致 | P1 |
| **数据飞轮流程** | Vitest + Mock LLM | BadCase 注入 → 聚类归因 → 生成调优建议 (TuningAdvisor) → 应用配置 | P1 |

### 4.3 性能测试

| 测试目标 | 方法 | 验收标准 |
|---------|------|---------|
| 8B 模型推理延迟 | 1000 次规格推理 benchmark | P50 < 150ms, P99 < 500ms |
| 画像加载耗时 | 1000 用户画像加载与反序列化 | P50 < 5ms (纯 CPU) |
| 冲突仲裁耗时 | 10000 次仲裁计算 | P50 < 5ms |
| 上下文压缩耗时 | 200 轮对话压缩 | < 100ms (零 LLM 调用层) |
| Redis 画像读取 | 10000 次随机读 | P50 < 2ms |

### 4.4 在线评估指标（生产监控）

传统离线测试数据集反映的是构建者预期，无法覆盖真实用户的拼写错误、模糊表达、多语言输入等情况。系统定义**四维在线评估指标**：

| 维度 | 指标 | 采集方式 | 目标 |
|------|------|---------|------|
| **Quality** | 规格推荐首次接受率 | 用户行为埋点 | ≥ 70% |
| | 用户满意度（点赞/踩） | 对话末尾反馈 | ≥ 4.0/5.0 |
| | LLM-as-Judge 质量分 | 独立评估模型每日采样打分 | ≥ 0.8 |
| **Reliability** | 端到端延迟 P99 | OTel Tracing | ≤ 3s |
| | 模型降级率 | EventBus `model:fallback` | ≤ 2% |
| | 工具调用成功率 | EventBus `tool:result` | ≥ 98% |
| **Cost** | 每次对话平均 token 数 | OTel Metrics | 趋势监控 |
| | 每次成功推荐成本（GPU 时间） | 基础设施指标 | 趋势监控 |
| **Safety** | Guardrail 拦截率 | EventBus `guardrail:blocked` | 趋势监控 |
| | PII 暴露事件数 | 输出层检测 | = 0 |
| | 未授权承诺次数 | 输出层检测 | = 0 |

**LLM-as-Judge 评估**：使用独立的评估模型（如 72B）对每日采样的对话进行自动打分，评估 helpfulness / correctness / safety 三个维度，比人工标注更 scalable：

```
每日采样 100 条对话 → 评估模型逐条打分（0~1）→ 聚合为质量趋势 → 低于阈值触发告警
```

### 4.5 SLO 定义（Service Level Objectives）

| SLO | 目标值 | 测量周期 | 违反后果 |
|-----|--------|---------|---------|
| 规格推荐首次接受率 | ≥ 70% | 每周 | 触发飞轮分析 |
| 端到端对话延迟 P99 | ≤ 3s | 实时 | 告警 + 排查 |
| 模型可用性 | ≥ 99.5% | 每月 | fallback 到 72B |
| PII 泄露事件 | = 0 | 实时 | 立即停服排查 |
| Guardrail 误拦率 | ≤ 5% | 每周 | 调整规则阈值 |

---

---

## 5. 项目排期

项目采用**纵向切片**（Vertical Slice）模式交付，绝大部分后端与核心引擎开发已完成。当前所处阶段：**收尾与全链路集成测试**。

| 阶段 | 核心任务 | 状态 | 涉及核心模块 |
|------|---------|------|---------|
| **阶段 1：基础画像与推荐引擎** | 画像加载封装、覆盖率匹配算法、Redis 持久化 | ✅ 已完成 | `profile-engine`, `profile-store` |
| **阶段 2：对话主循环与架构设施** | Intent 路由、EventBus解耦、Model Slot 切换、四层架构建设 | ✅ 已完成 | `agent.ts`, `workflow`, `model-slot` |
| **阶段 3：推荐解释与仲裁机制** | 三层结构化解释、规则+LLM混合置信度偏好仲裁 | ✅ 已完成 | `explanation-generator`, `confidence-arbitrator` |
| **阶段 4：长文本与上下文记忆** | 滑动窗口 + 角色切换强制分段压缩 + 摘要主动注入 | ✅ 已完成 | `segment-compressor`, `sliding-window` |
| **阶段 5：数据飞轮与工程运维** | BadCase 收集/归因/调优、OTel 指标采集、安全护栏Guardrails | ✅ 已完成 | `data-flywheel`, `subscribers`, `guardrails` |
| **阶段 6：Web Chat 与调试面板** | 浏览器端交互面板、用户/商品切换、会话追踪面板 | ✅ 已完成 | `web/app`, `TracePanel` |
| **阶段 7：生产级打磨** | 会话隔离、角色一致性修复、安全加固、测试补齐 | 🏃 进行中 | `agent.ts`, `tests/` |

---

---

## 6. 可扩展性与未来展望

> 仅保留与三个核心技术点（画像引擎、数据飞轮、上下文管理与仲裁）直接相关的演进方向。

### 6.1 短期演进

| 方向 | 当前状态 | 目标 | 触发条件 |
|------|---------|------|---------|
| **外部服务对接** | Mock 适配器 | 对接真实订单 API + 商品 API | 进入灰度 |
| **Redis 生产部署** | InMemoryRedisClient | 对接真实 Redis | 部署到测试环境 |
| **飞轮自动回流** | TuningAdvisor 只建议 | 参数调优自动生效 | 500+ badcase |
| **解释性社会证明** | 三层结构化解释 | "相似体型用户 80% 选了 M 码" | 有反馈数据后 |

### 6.2 中期演进

| 方向 | 说明 | 触发条件 |
|------|------|---------|
| **微调数据飞轮** | BadCase 自动生成 SFT 数据，增量微调 8B | 旋钮调优收益递减 |
| **群体画像** | 冷启动用户 fallback 到聚类群体画像 | cold_start 占比 > 30% |
| **主动上下文检索** | Agent 通过 `recall_context` tool 按段索引回查原始消息（需先实现 ReAct 循环） | 对话轮数常超 20 轮 |

### 6.3 长期演进

| 方向 | 演进路径 |
|------|---------|
| **画像存储** | RedisJSON → PostgreSQL |
| **事件持久化** | InMemory EventBus → Redis Streams |
| **分段压缩** | 被动注入 → 主动检索（Agent tool use） |
