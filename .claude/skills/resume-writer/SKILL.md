---
name: resume-writer
description: "基于 ecom-agent（电商客服 Agent 用户特征画像系统）生成定制化简历内容，支持技术点提炼、项目经历四段式改写、中英文版本与面试追问准备。聚焦 SFT/GRPO 微调、覆盖率匹配算法、Workflow 路由、Guardrails、数据飞轮、可观测性与工程化落地。Use when user says '写简历', 'resume', 'resume writer', 'resume writter', '简历', 'write resume', '项目经历', 'project experience', '技术亮点', '简历技术点', or asks to generate resume-ready bullets from this project."
---

# Resume Writer

基于“写作原则 + 项目亮点 + 用户画像”生成可直接用于简历的高质量内容。

## 快速模式选择

- 若用户只要“简历技术点/亮点”，走 **技术点速出模式**
- 若用户要完整项目经历，走 **四段式项目模式**
- 若用户还要英文版或面试问答，在上述结果后追加对应输出

## 工作流程

### Phase 1: 加载知识

1. 读取 [references/resume_principles.md](references/resume_principles.md)
2. 读取 [references/project_highlights.md](references/project_highlights.md)
3. 按需深读 `PROJECT_SPEC.md` 对应章节补齐细节与数据口径

### Phase 2: 采集最少必要信息

优先用最少问题快速落地，缺省信息可用“通用电商客服画像场景”补位：

1. 目标岗位（如 AI Agent Engineer / 后端 / LLM 应用工程）
2. 期望语言（中文 / 英文 / 双语）
3. 侧重方向（算法 / 工程 / 业务结果 / 稳定性）
4. 是否需要量化指标（默认需要）

### Phase 3: 亮点筛选与改写

从项目中筛选 3-6 个最相关亮点，遵循：

- 每条 bullet 必须“动词开头 + 技术动作 + 结果或价值”
- 优先保留可量化信息（成本、时延、准确率、稳定性、吞吐）
- 不写未实现或“未来规划”能力

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

### Phase 4A: 技术点速出模式（默认优先）

按下列模板输出 6-10 条“可直接贴简历”的技术点：

```markdown
**简历技术点（项目：ecom-agent）**

- 设计并落地 `SFT + GRPO` 微调方案，将 8B 模型画像提取能力逼近 72B（89.52 vs 90.42），推理速度提升 6x，GPU 成本降低 50%。
- 构建“用户画像区间 × 商品画像区间”的覆盖率匹配算法，在零模型调用路径完成 SKU 推荐，提升在线响应效率与稳定性。
- 实现声明式 Workflow 图引擎（节点/条件边/共享状态），支持商品咨询、售后、物流、投诉多场景路由与回溯。
- 搭建三层 Guardrails（输入/执行/输出），覆盖 Prompt 注入、工具白名单、PII 脱敏与承诺合规拦截，降低安全与合规风险。
- 建立 BadCase 数据飞轮（识别→审核→优化→A/B 验证），通过统计检验驱动 Prompt 持续迭代与效果收敛。
- 设计四级冷启动策略（L0-L3），通过群体画像 fallback 与渐进采集机制提升新用户早期可服务性。
- 采用 cockatiel 实现模型槽位弹性治理（断路器/重试/超时/fallback），并通过 EventBus 广播推理指标支撑可观测性闭环。
- 以 DDD 充血实体 + Plugin 机制封装画像规则，新增画像维度无需改动核心流程，提升系统可扩展性与可测试性。
```

### Phase 4B: 四段式项目模式

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

### Phase 5: 面试追问预测（可选）

- "8B 替代 72B 的训练数据怎么构建的？交叉模型验证的一致性判定逻辑？"
- "覆盖率匹配算法的特征优先级怎么确定的？权重怎么调？"
- "Workflow 状态机支持回溯吗？意图切换时上下文怎么继承？"
- "Guardrails 的 Prompt 注入检测用的什么方法？误拦率多少？"
- "数据飞轮的 A/B 实验用什么统计检验？最小样本量怎么定？"

## 底线

不声称使用了项目中未实现的技术，不声称完成了标记为"未来展望"的功能（如冲突仲裁、分层记忆、Prompt Template Engine）。
