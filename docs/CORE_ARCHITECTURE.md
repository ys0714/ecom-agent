# 电商客服 Agent 核心技术架构与设计细节

本文档深入剖析 `ecom-agent` 项目的三个核心技术聚焦点：**记忆机制 (Memory Mechanism)**、**用户画像 (User Profile)**、以及 **数据飞轮 (Data Flywheel)**。这些模块的设计全面贯彻了 2026 年“**可靠性优先 (Reliability over Autonomy)**”与“**评测驱动迭代 (Eval-Driven Iteration)**”的 Agent 工程化最佳实践。

---

## 1. 记忆机制与 Context Window (Memory Mechanism)

大模型的记忆管理本质是对 Context Window（Token 预算）的排兵布阵与信息密度压缩。系统摒弃了简单的“全部塞入 Prompt”的做法，采用类似 OpenClaw 的 **四层记忆架构 + 全量可审计落盘**。

### 1.1 物理排兵布阵：四层记忆架构
在 `Agent.handleMessage()` 中，Prompt 的组装严格遵循四个物理层级。大模型并不是在“读全文”，而是在读我们精心编排的记忆结构。

```typescript
// src/application/agent.ts 中 Prompt 组装的设计体现
private buildSystemPrompt(...) {
  // 1. Bootstrap Layer (系统基座，绝对免疫压缩)
  const bootstrapLayer = `${roleInstruction}\n\n${profileSection}\n\n${workflowSection}\n\n${guardrailSection}`;

  // 2. Conversation History Layer (受压缩的历史层)
  const historyLayer = compressor?.formatForPrompt() ?? '';

  // 3. Tool Results Layer (按需检索的工作记忆层)
  const toolResultsLayer = `\n\n--- 动态工作记忆 ---\n${coldStartInstruction}${fewShotExamples}`;

  return `${bootstrapLayer}${historyLayer}${toolResultsLayer}`;
}

// 在拼装入给大模型的 messages 数组时：
const messages: Message[] = [
  { role: 'system', content: systemPrompt }, // 包含了 Layer 1~3
  ...window,                                 // 4. Current Message Window (滑动窗口内的最新对话，包含 L4 本身)
];
```

1. **Layer 1: Bootstrap 层（系统基座，绝对免疫压缩）**
   - **定位**：Prompt 最顶端，每次会话强制加载，绝不被压缩或截断。
   - **内容**：系统的安全护栏 (Guardrails 约束) 与 用户画像核心数据 (`profile.summarizeForPrompt()`)。
2. **Layer 2: Conversation History（受压缩的历史层）**
   - **机制**：由大模型自动管理的压缩摘要。当历史对话较长时，交给 `SegmentCompressor` 处理，提取结构化 `factSlots` 供大模型参考。
3. **Layer 3: Tool Results（按需检索的工作记忆层）**
   - **定位**：动态注入的外部知识，用完即抛，避免污染主上下文。
   - **内容**：商品查询结果、RAG 动态召回的 Few-shot 案例、以及通过 `recall_history` 工具检索回来的历史对话原文。
4. **Layer 4: Current Message Window（当前对话窗口层）**
   - **定位**：Prompt 底部，注意力机制最集中的区域，也是 `messages` 数组的尾部。
   - **内容**：**最近 K 轮**（通常是最近 3-5 轮）的完整、未经任何压缩的原始对话记录，包含用户最新的输入和系统的即时多轮追问。滑动出这个窗口的消息才会被送入 Layer 2 压缩。

### 1.2 OpenClaw 化动态压缩与事实提取
旧版的“自然语言摘要”存在信息丢失的通病。在升级后，`SegmentCompressor` 输出结构化的 `factSlots`：
```typescript
interface CompressedSegment {
  segmentIndex: number;
  turnRange: [number, number];  // 核心指针：指向 JSONL 的行号范围
  tokenUsage: number;           // 压缩后的 Token 估算，用于 Budget-Aware 管理
  summary: string;              // 简短自然语言摘要
  factSlots: {                  // 事实槽位化摘要
    who: string;                // 交互主体 (如 "给老公买")
    intent: WorkflowType;       // 核心意图
    constraints: string[];      // 明确偏好 (如 ["宽松", "175cm"])
    decisions: string[];        // 决策 (如 ["选了M码"])
    open_questions: string[];   // 待解决的问题
  };
}
```
**无损回溯 (Tool Call)**：当大模型阅读压缩后的 `factSlots` 觉得缺乏语境时，可以主动调用 `recall_history(startTurn, endTurn)`，凭借 `turnRange` 指针将当时那一小段完整对话原文拉取到 Layer 3 (工作记忆层)。这实现了“全局低成本概览 + 局部高精度检索”。

### 1.3 全量会话保留策略 (Auditable Session Retention)
大模型视角的记忆可以被压缩、丢弃，但**系统视角的记忆必须 100% 保留**。
- 系统底层依赖 `EventBus`，通过 `SessionLogSubscriber` 将所有交互 (`message:user/assistant`, `tool:call/result`, `turn:trace`) 记录为 Immutable JSONL Event Log。
- 在存储前，通过 `compactPayload()` 对 `turn:trace` 中的冗余问答和全量 `messagesForDistillation` 做轻量化摘要（转为 `distillationSummary`），以兼顾落盘体积与诊断完整度。

---

## 2. 用户画像引擎 (User Profile Engine)

画像不是静态的数据表，而是随着对话流动、推翻、重塑的生命周期状态。

### 2.1 双轨制存储架构 (Double-Track Storage)
为防止短期“给他人代购”污染用户的全局长期画像，系统设计了双轨机制：
1. **主画像 (`ProfileStore`)**：持久化，存放基于历史订单或高置信度明确告知的核心身形数据。
2. **会话画像 (`SessionProfileStore`)**：附带 24 小时 TTL 的临时 Redis 缓存，记录本会话中的特定情境（如角色切换 `role_switch`）。
3. **运行时合并**：每次 Request 进来，内存中的 `UserProfileEntity` 会执行 `mergeSessionProfile`，使当次推荐享有完整上下文，而持久化时互不干扰。

### 2.2 混合路由与置信度仲裁 (Confidence Arbitration)
用户在对话中提到的“我要宽松点”、“我朋友170cm”等属于偏好信号 (`PreferenceSignal`)。
系统如何判断“是听用户的口头表达，还是坚持历史画像数据”？这里引入了**混合检测**与**数学仲裁**机制：

1. **混合检测路由 (PreferenceDetector)**：
   - 优先走基于正则与关键词的 **规则快速路径 (0ms)**，捕获高确定性信号（如“我身高165cm”）。
   - 如果未命中，则走 **LLM 深度路径 (~200ms)**，理解隐式的模糊语义（如“这件感觉有点小”）。LLM 会根据语境给出一个浮点数作为该信号的“语义置信度”。

2. **置信度仲裁器 (ConfidenceArbitrator)**：
   - 不同的底层数据有其“基准置信度”（例如：购买过 5 单以上置信度 0.9，1 单置信度 0.6）。
   - 仲裁器会将**“当前画像的置信度 (existingConfidence)”**与**“传入信号的置信度 (incoming.confidence)”**进行数学比对：

```typescript
// src/application/services/profile-engine/confidence-arbitrator.ts
export function arbitrate(existingConfidence: number, incoming: PreferenceSignal): ArbitrationResult {
  // 1. 用户明确指定 (最高优先级)，直接覆盖
  if (incoming.type === 'explicit_override') {
    return { decision: 'accept', effectiveConfidence: 1.0, reason: '用户明确指定' };
  }
  // 2. 新信号显著强于已有画像 (> 1.2 倍)，接受新信号
  if (incoming.confidence > existingConfidence * 1.2) {
    return { decision: 'accept', effectiveConfidence: incoming.confidence };
  }
  // 3. 信号强度接近 (> 0.8 倍)，采取数值融合
  if (incoming.confidence > existingConfidence * 0.8) {
    return { decision: 'merge', effectiveConfidence: (existingConfidence + incoming.confidence) / 2 };
  }
  // 4. 新信号弱于已有画像，忽略口头表达，坚持历史数据
  return { decision: 'ignore', effectiveConfidence: existingConfidence };
}
```

   - **闭环强化**：如果用户的当次采纳被事后下单印证，其对应维度的置信度会被 `adjustConfidence` 奖励 (`+0.1`)；若遭到拒绝则惩罚 (`-0.1`)。

### 2.3 冷启动策略 (Cold Start Manager)
画像具备 `Completeness` (0~1) 和 `ColdStartStage` (cold/warm/hot) 属性。针对冷启动用户，`ColdStartManager` 会动态生成引导提问（如“请问您的身高体重大概是多少？”），并将其作为 `coldStartInstruction` 注入到 System Prompt 的工作记忆层，诱导用户自然补全画像。

### 2.4 鲁棒性与角色一致性保护 (Context & Role Protection)
对话中经常发生意图跳跃或语义缺失（例如：“想买p301” -> “身高130cm”）。为防止画像引擎因为失去上下文而把数据写错地方，系统实施了两级保护：
1. **隐式角色推断 (Implicit Role Inference)**：系统会跨轮次扫描当前及历史提到的商品。如果商品 `p301` 属童装（`targetAudience: 'child'`），即便用户未明确说“给孩子买”，系统也会静默将 `activeRole` 绑定为 `child`。
2. **意图重估 (Intent Re-evaluation)**：当用户在提供画像数据（触发 `profile_correction`）时，如果意图路由器将其误判为普通闲聊 (`general`)，系统会向后追溯。若发现近期存在商品讨论，会强制将意图扭转回 `product_consult`，并在内部向用户文本自动挂载该商品 ID 补全上下文，确保推荐引擎与画像引擎能针对“正确的角色”和“正确的商品”进行准确的规格匹配和档案写入。

---

## 3. 数据飞轮闭环 (Data Flywheel)

告别盲目的 Prompt 修改，将迭代建立在“度量与归因”之上，实现 **Analyze → Measure → Improve** 工业级闭环。

### 3.1 度量采集层 (Trace & Measure: OTel & LLM-as-a-Judge)
- **标准化 Trace 接入**：通过 `OpenTelemetrySubscriber`，彻底拥抱 Langfuse/Phoenix 等开源标准协议，将耗时、Token 消耗、工具调用链路全量上报至专门的可观测面板，无需重复造轮子。
- **隐式与显式触发**：在 `Agent` 中，如果检测到用户直接覆盖了推荐 (`spec_rejected`)，会当场打包当前画像、意图和匹配覆盖率形成 `BadCaseTrace`，并经 `BadCaseCollector` 记录；同时前端 UI 的点踩 (`dislike`) 接口也会追加反馈并绑定到 Langfuse 的 Session Trace 上。
- **自动评估 (LLM-as-a-Judge)**：不同于仅统计“接受率”这种滞后指标，引入后台批处理 `SpecRecommendationEvaluator`，利用大模型对线上 10% 的会话抽样进行“多维软性打分”（如回答同理心、有无越界承诺、引导性），这让飞轮能在没有用户投诉的情况下主动发现问题。

### 3.2 诊断分析层 (Analyze)
一旦 `BadCaseCollector` 累积满批次，触发 `badcase:detected` 事件，`AutoPromptSubscriber` 便开始流水线作业：
- **多维归因 (`diagnoseFailureModes`)**：结合当时的 Trace 详情诊断病因。

```typescript
// src/application/services/data-flywheel/badcase-collector.ts
export function diagnoseFailureModes(trace: BadCaseTrace, signal: BadCaseSignal): FailureMode[] {
  const modes: FailureMode[] = [];
  // 1. 画像信息太少，推荐失败属于冷启动问题
  if (trace.profileCompleteness < 0.3) {
    modes.push('cold_start_insufficient');
  }
  // 2. 覆盖率得分太低，属于特征权重或匹配范围问题
  if (trace.specMatchResult.attempted && trace.specMatchResult.topCandidates[0]?.coverage < 0.5) {
    modes.push('low_coverage_match');
  }
  // 3. 模型兜底生成的推荐遭拒绝，属于提示词或模型能力问题
  if (trace.specMatchResult.fallbackToModel && signal === 'user_rejection') {
    modes.push('model_fallback_quality');
  }
  return modes.length > 0 ? modes : ['unknown'];
}
```

- **聚类分析 (`BadCaseAnalyzer`)**：将这批 BadCase 按 `FailureMode` 进行聚类，找出当前的“Top Cluster (首要问题)”。

### 3.3 调优反馈层 (Improve: Params & Few-Shot RAG)
- **参数推荐 (`TuningAdvisor`)**：针对 Top Cluster 给出参数级调优建议。例如，若 `presentation_issue` (推荐对了但用户不接受) 占比高，说明解释话术或信心不足，Advisor 会建议将 `MIN_RECOMMEND_CONFIDENCE` 阈值调高 0.1。
- **动态 Few-Shot 注入**：结合 LLM-Judge 找出的高分黄金用例存入 ChromaDB 向量库，Agent 推理时将最近的相似成功案例抽取放入 System Prompt（必须经过严格 A/B 测试验证有效性后才全量），这比调参更能有效改变模型的“口吻与推理逻辑”。
- **热更新生效 (`ConfigWatchSubscriber`)**：Advisor 给出的高置信度数值型建议，会由 `ConfigWatchSubscriber` 直接应用并广播到全局。

---

## 总结

- **画像系统** 保证了业务的根基（无幻觉、可仲裁、双轨安全）。
- **记忆机制** 保证了大模型的表现（Token 预算合理、事实留存、全局事件溯源）。
- **数据飞轮** 保证了系统的进化（可观测、可衡量、自动归因调优）。

这三者的结合，使 `ecom-agent` 摆脱了“玩具级聊天机器人”的脆弱性，成为具备极强自我修复和稳定性的工程化 Agent 系统。
