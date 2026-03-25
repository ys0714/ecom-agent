---
name: resume-writer
description: "基于 ecom-agent（电商客服 Agent 用户特征画像系统）项目生成定制化简历项目经历。结合 SFT/GRPO 微调、覆盖率匹配、Workflow 路由、Guardrails 等技术亮点与用户业务场景，按简历编写原则输出高质量项目描述（中英文）。Use when user says '写简历', 'resume', '简历', 'write resume', '项目经历', 'project experience', or asks to generate resume content based on this project."
---

# Resume Writer

基于"写作原则 + 项目亮点 + 用户画像 = 定制化简历"三角模型生成简历项目经历。

## 工作流程

### Phase 1: 加载知识

1. 读取 [references/resume_principles.md](references/resume_principles.md) — 四段式结构、技术标签、亮点挖掘策略
2. 读取 [references/project_highlights.md](references/project_highlights.md) — 核心技术亮点
3. 按需深读 `PROJECT_SPEC.md` 对应章节补充细节

### Phase 2: 用户画像采集

用 `ask_questions` 收集：

**问题 1 — 目标岗位**：AI Agent Engineer / Backend Engineer / MLE / LLM Application Engineer / 全栈 AI

**问题 2 — 业务背景**：引导用户描述真实工作场景。示例：
- "我在电商平台做客服系统，用户下单时尺码选择错误率高"
- "我做推荐系统，用户画像更新周期长影响推荐时效性"

**问题 3 — 技术侧重**（多选）：SFT/GRPO 微调 / 覆盖率匹配算法 / Workflow 状态机 / Agent Guardrails / 数据飞轮 / 冷启动策略 / EventBus 架构 / 可观测性

**问题 4 — 特殊要求**

### Phase 3: 亮点匹配

从项目中提取 3-5 个亮点：

| 亮点 | 话术方向 | 量化角度 |
|------|---------|---------|
| SFT/GRPO 微调 8B 替代 72B | 模型蒸馏、训练数据构建、交叉模型验证 | 评测 89.52 vs 72B 90.42，GPU 成本 -50%，推理 6x 加速 |
| 覆盖率匹配算法 | 零模型调用的规格推荐、8 种身体特征区间匹配 | 匹配命中率、P50 延迟 |
| 声明式 Workflow 图引擎 | LangGraph 模式状态机、意图路由、多场景支持 | 4 个 Workflow、条件回溯 |
| 三层安全护栏 | Prompt 注入防护、PII 脱敏、承诺合规 | 拦截率、零 PII 泄露 |
| 数据飞轮 | BadCase 自动识别→Prompt 优化→A/B 统计检验 | BadCase 率下降 |
| 四级冷启动策略 | 渐进式画像积累、群体画像 fallback | 冷启动用户推荐覆盖率 |
| 模型槽位热切换 | cockatiel 断路器/重试、A/B 流量路由、自动 fallback | 模型可用性 99.5%+ |
| 充血领域模型 | DDD 实体封装业务规则、Plugin 扩展机制 | 画像维度可插拔 |

### Phase 4: 四段式输出

```
**[项目名称]** | [时间段] | [角色]

**背景**：[基于用户 Q2 描述的真实业务场景]

**目标**：[技术目标 + 核心能力 + 预期效果]

**过程**：
• [Bullet 1] — 动词开头 + 技术 + 量化
• [Bullet 2-5] ...

**结果**：[3-5 个量化指标汇总]

**技术栈**：TypeScript / Node.js / Fastify / OpenAI SDK / Redis / Vitest / cockatiel / neverthrow / Zod / vLLM / SFT / GRPO
```

### Phase 5: 面试追问预测

- "8B 替代 72B 的训练数据怎么构建的？交叉模型验证的一致性判定逻辑？"
- "覆盖率匹配算法的特征优先级怎么确定的？权重怎么调？"
- "Workflow 状态机支持回溯吗？意图切换时上下文怎么继承？"
- "Guardrails 的 Prompt 注入检测用的什么方法？误拦率多少？"
- "数据飞轮的 A/B 实验用什么统计检验？最小样本量怎么定？"

## 底线

不声称使用了项目中未实现的技术，不声称完成了标记为"未来展望"的功能（如冲突仲裁、分层记忆、Prompt Template Engine）。
