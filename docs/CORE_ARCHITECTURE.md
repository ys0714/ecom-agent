# 电商客服 Agent 核心技术架构与设计细节

本文档深入剖析 `ecom-agent` 项目的三个核心技术聚焦点：**记忆机制 (Memory Mechanism)**、**用户画像 (User Profile)**、以及 **数据飞轮 (Data Flywheel)**。这些模块的设计全面贯彻了 2026 年“**可靠性优先 (Reliability over Autonomy)**”与“**评测驱动迭代 (Eval-Driven Iteration)**”的 Agent 工程化最佳实践。

---

## 1. 记忆机制与 Context Window (Memory Mechanism)

大模型的记忆管理本质是对 Context Window（Token 预算）的排兵布阵与信息密度压缩。系统摒弃了简单的“全部塞入 Prompt”的做法，采用类似 OpenClaw 的 **四层记忆架构 + 全量可审计落盘**。

### 1.1 物理排兵布阵：四层记忆架构
在 `Agent.handleMessage()` 中，Prompt 的组装严格遵循四个物理层级：
1. **Layer 1: Bootstrap 层（系统基座，绝对免疫压缩）**
   - **定位**：Prompt 最顶端，每次会话强制加载，绝不被压缩或截断。
   - **内容**：系统的安全护栏 (Guardrails 约束) 与 用户画像核心数据 (`profile.summarizeForPrompt()`)。
2. **Layer 2: Conversation History（受压缩的历史层）**
   - **机制**：采用 **滑动窗口 + 分段压缩**。最近 K 轮对话保留完整原文，溢出窗口的历史消息则交给 `SegmentCompressor` 处理。
3. **Layer 3: Tool Results（按需检索的工作记忆层）**
   - **定位**：动态注入的外部知识，用完即抛，避免污染主上下文。
   - **内容**：商品查询结果、RAG 动态召回的 Few-shot 案例、以及通过 `recall_history` 工具检索回来的历史对话原文。
4. **Layer 4: Current Message（当前消息层）**
   - **定位**：Prompt 底部，注意力机制最集中的区域，放置用户最新输入。

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

### 2.2 混合路由与偏好仲裁 (Confidence Arbitration)
用户在对话中提到的“我要宽松点”、“我朋友170cm”等属于偏好信号 (`PreferenceSignal`)。
- **混合路由检测**：优先走基于正则与关键词的 **规则快速路径 (0ms)** 捕获高确定性信号；失败时则走 **LLM 深度路径 (~200ms)** 进行模糊语义理解。
- **置信度仲裁**：不同来源的数据有不同置信度（如：订单历史 0.9，口头修改 0.7，隐式偏好 0.6）。`ConfidenceArbitrator` 会对比现有数据的置信度与新信号，决定是 **覆盖 (accept)**、**合并 (merge)** 还是 **忽略 (ignore)**。

### 2.3 冷启动策略 (Cold Start Manager)
画像具备 `Completeness` (0~1) 和 `ColdStartStage` (cold/warm/hot) 属性。针对冷启动用户，`ColdStartManager` 会动态生成引导提问（如“请问您的身高体重大概是多少？”），并将其作为 `coldStartInstruction` 注入到 System Prompt 的工作记忆层，诱导用户自然补全画像。

---

## 3. 数据飞轮闭环 (Data Flywheel)

告别盲目的 Prompt 修改，将迭代建立在“度量与归因”之上，实现 **Analyze → Measure → Improve** 工业级闭环。

### 3.1 度量采集层 (Trace & Measure)
- **隐式与显式触发**：在 `Agent` 中，如果检测到用户直接覆盖了推荐 (`spec_rejected`)，会当场打包当前画像、意图和匹配覆盖率形成 `BadCaseTrace`，并经 `BadCaseCollector` 记录；同时前端 UI 的点踩 (`dislike`) 接口也会通过读取最新 Trace 追加 BadCase。
- **量化评估**：`SpecRecommendationEvaluator` 统计推荐总数、首次接受率、覆盖率算法命中率等四维指标，指标下滑超过 5% 时亦可触发飞轮。
- **数据蒸馏**：`DataDistillationSubscriber` 对落盘数据进行 PII 脱敏处理，为后续微调 (SFT) 提供高质量对齐数据。

### 3.2 诊断分析层 (Analyze)
一旦 `BadCaseCollector` 累积满批次，触发 `badcase:detected` 事件，`AutoPromptSubscriber` 便开始流水线作业：
- **多维归因 (`diagnoseFailureModes`)**：结合当时的 Trace 详情诊断病因。例如，若画像完整度低于 0.3，则归因为 `cold_start_insufficient`；若是覆盖率极低但强行匹配错误，则归因为 `low_coverage_match`。
- **聚类分析 (`BadCaseAnalyzer`)**：将这批 BadCase 按 `FailureMode` 进行聚类，找出当前的“Top Cluster (首要问题)”。

### 3.3 调优反馈层 (Improve)
- **参数推荐 (`TuningAdvisor`)**：针对 Top Cluster 给出参数级调优建议。例如，若 `presentation_issue` (推荐对了但用户不接受) 占比高，说明解释话术或信心不足，Advisor 会建议将 `MIN_RECOMMEND_CONFIDENCE` 阈值调高 0.1。
- **热更新生效 (`ConfigWatchSubscriber`)**：Advisor 给出的高置信度数值型/布尔型建议，会由 `ConfigWatchSubscriber` 直接应用并广播到全局，各相关服务（如推理引擎、规则匹配引擎）即刻采用新参数，完成飞轮运转。

---

## 总结

- **画像系统** 保证了业务的根基（无幻觉、可仲裁、双轨安全）。
- **记忆机制** 保证了大模型的表现（Token 预算合理、事实留存、全局事件溯源）。
- **数据飞轮** 保证了系统的进化（可观测、可衡量、自动归因调优）。

这三者的结合，使 `ecom-agent` 摆脱了“玩具级聊天机器人”的脆弱性，成为具备极强自我修复和稳定性的工程化 Agent 系统。
