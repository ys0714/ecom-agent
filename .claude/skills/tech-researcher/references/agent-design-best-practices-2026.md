## 调研报告：2026 Agent 设计最佳实践（可靠性优先）

### 一、问题定义

- 要解决什么问题？
  - 为 `ecom-agent` 提炼一套对生产更友好的 Agent 设计理念，避免“能力堆砌但不可控”。
- 当前系统现状和不足？
  - 已有 Workflow、Guardrails、Trace、四层记忆等基础能力，但设计原则尚未系统对齐 2026 社区共识（如有界循环、评测分层、ACI 等）。

### 二、业界实践（2-3 个参考）

- 参考 A：Anthropic（Building effective agents, Dec 2024；Demystifying evals for AI agents, Jan 2026）
  - 核心做法：先简单后复杂；工作流优先于自治；Agent 要有边界；能力评测与回归评测分层。
  - 价值：显著降低迭代回归风险，提升上线信心与变更速度。
- 参考 B：OpenAI Agents SDK（Guardrails / Tracing）
  - 核心做法：Guardrails 作为运行时闸门；Tracing 覆盖 LLM、工具、护栏、handoff，全链路可回放。
  - 价值：安全治理和线上诊断成本显著下降。
- 参考 C：Letta Context Hierarchy + AutoGen HITL
  - 核心做法：按数据重要性与规模进行记忆分层；人类介入作为可配置控制面。
  - 价值：控制 token 成本，提升长会话稳定性和高风险场景可控性。

### 三、方案对比

| 方案 | 核心思路 | 优势 | 劣势 | 适用性 |
|------|---------|------|------|--------|
| 方案 A：高自治 Agent 优先 | 放大模型自主规划，减少显式流程 | 灵活、扩展快 | 漂移大、复现难、成本不稳定 | 部分适用（探索场景） |
| 方案 B：可靠性优先（Workflow + 有界 Agent） | 确定性主链路 + 有边界自治 + 可回放 | 稳定、可测、可审计 | 设计约束更多 | 高度适用（本项目首选） |
| 方案 C：纯规则系统 | 完全规则化，不依赖模型决策 | 可控性强、成本低 | 泛化弱、维护成本高 | 局部适用（高确定性子任务） |

### 四、推荐方案

- 建议做什么？
  - 采用**方案 B：可靠性优先**，保留“规则优先 + 模型兜底”的混合架构，并补齐发布门禁。
- 为什么选这个方案？
  - 与电商客服核心诉求一致：稳定、可追责、可复盘；同时保留必要的语义泛化能力。
- 实现复杂度估算
  - 中：主要是治理和工程化约束强化，不是推翻重写。

### 五、待澄清问题

- 是否将“发布检查清单（Release Gate）”纳入 CI 阻断条件？
- 人工介入（HITL）在本项目中优先放在哪类场景（高风险售后/大额赔付/敏感投诉）？
- Trace 默认保留策略（时长、脱敏粒度）如何平衡排障与合规？

### 六、优先级建议

| 优化项 | 业务价值 | 复杂度 | 建议（P0/P1/P2） |
|--------|---------|--------|------------------|
| 有界 Agent 循环与统一降级策略 | 高 | 中 | P0 |
| Trace 结构统一（工具/护栏/推理阶段） | 高 | 低 | P0 |
| 能力评测 vs 回归评测双套件治理 | 高 | 中 | P0 |
| ACI 规范（工具参数语义、错误约束） | 中 | 低 | P1 |
| HITL 升级/审批策略 | 中 | 中 | P1 |
| 长期记忆分层策略精细化 | 中 | 中 | P2 |

### 参考来源

- Anthropic: [Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- Anthropic: [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- OpenAI Agents SDK: [Guardrails](https://openai.github.io/openai-agents-js/guides/guardrails/)
- OpenAI Agents SDK: [Tracing](https://openai.github.io/openai-agents-js/guides/tracing/)
- Letta: [Context hierarchy](https://docs.letta.com/guides/agents/context-hierarchy/)
- AutoGen: [Human-in-the-loop](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/human-in-the-loop.html)
