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
