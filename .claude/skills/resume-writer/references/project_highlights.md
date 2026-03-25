# ecom-agent 项目技术亮点

## 亮点 1：SFT/GRPO 微调 8B 替代 72B
- Qwen2.5-72B 画像提取：1 亿条数据需 58 天，精准率约 60%
- 通过 SFT + GRPO 强化学习微调 Qwen3-8B：评测 89.52（vs 72B 的 90.42）
- GPU 成本从 2×X40 降至 1×X40（-50%），推理速度 6x 加速
- 训练数据构建：交叉模型验证（3 模型投票），逐字段一致性判定
- 奖励函数：逐字段比对 8 种身体特征，归一化奖励

## 亮点 2：覆盖率匹配算法
- 零模型调用的规格推荐：用户画像区间 × 商品画像区间
- 8 种身体特征：体重/身高/腰围/胸围/脚长/上装尺码/下装尺码/鞋码
- 特征优先级加权：height > weight > bust > waistline > footLength
- 覆盖率 = 区间重叠 / 用户画像区间，选最优 SKU

## 亮点 3：声明式 Workflow 图引擎
- 参考 LangGraph 的状态机模式：节点 + 条件边 + 共享状态
- 内置 4 个 Workflow：商品咨询 / 售后 / 物流 / 投诉
- IntentRouter 双模式：规则快速路由（零延迟）+ LLM 意图分类
- 支持循环、回溯、人工介入

## 亮点 4：三层安全护栏（Guardrails）
- 输入层：Prompt 注入检测（中英文模式）+ 敏感词过滤 + 用户身份绑定
- 执行层：工具调用权限白名单（按 Workflow 隔离）+ 金额/频率限制
- 输出层：PII 脱敏（手机号/身份证/银行卡）+ 未授权承诺拦截

## 亮点 5：数据飞轮（BadCase-AutoPrompt）
- 多信号 BadCase 识别：用户否定/规格退回/超时/转人工
- 分阶段触发阈值：冷启动 N=10 → 稳定期 N=50
- Human-in-the-Loop 审核队列
- A/B 统计检验：Z-test + 最小样本量 ≥1000

## 亮点 6：四级冷启动策略
- L0 零画像：群体画像 Fallback
- L1 主动探索：引导问题（身高/体重/尺码）
- L2 渐进积累：降低推荐置信度
- L3 成熟画像：正常画像驱动

## 亮点 7：模型槽位热切换
- cockatiel 弹性封装：断路器（连续 5 次失败开启）+ 指数退避重试 + 超时
- 自动 fallback：8B 失败 → 72B
- A/B 流量路由：确定性 hash 分桶
- EventBus 指标广播：每次推理记录延迟/模型/fallback

## 亮点 8：充血领域模型 + Plugin 扩展
- UserProfileEntity 封装 applyDelta/summarizeForPrompt/冷启动阶段转换
- ProfileDimensionPlugin：新增画像维度无需修改现有代码
- 手动 Composition Root DI：零框架依赖，测试友好
