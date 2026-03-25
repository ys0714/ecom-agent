# 调研报告：画像解释性 + 画像冲突仲裁

> 调研时间：2026-03-25
> 搜索来源：arxiv 2025 论文、Amazon/Stitch Fix 工程博客、Sizebay/AiFitFinder 行业报告、Stanford/DeepMind 研究

---

## 一、画像解释性

### 1.1 问题定义

- 当前 `formatReasoning()` 输出"身高匹配100%，体重匹配95%"——机器语言，用户无法理解
- 缺少画像锚点（不知道"我的画像是什么"）、缺少比较（不知道"为什么 M 比 L 好"）
- 推荐接受率直接受解释质量影响：33% 的购物者因尺码不确定放弃购物车（Sizebay 2025）

### 1.2 业界实践

**Amazon Fashion**：
- 基于"数百万商品细节和数十亿匿名购买记录"推荐尺码
- 核心话术："相似体型的顾客买了 M 码并保留了"——社会证明（Social Proof）
- 来源：https://www.aboutamazon.com/news/retail/how-amazon-is-using-ai-to-help-customers-shop

**Stitch Fix**：
- 用 IRT（Item Response Theory）建模，用户反馈"太大/太小/刚好"持续校准
- 解释性来自反馈闭环——"根据您之前对 X 品牌 M 码的评价（刚好合适）"
- 来源：https://multithreaded.stitchfix.com/blog/2017/12/13/latentsize/

**FIRE（arxiv 2025）**：
- 用 SHAP 特征归因做忠实解释——解释必须反映模型的真实决策依据
- 核心原则：**解释不能让 LLM 自由编造**，必须锚定在实际计算结果上
- 来源：https://arxiv.org/html/2508.05225v1

**Prism（arxiv 2025）**：
- 推荐和解释解耦：先推荐，再用轻量模型生成解释
- 24x 加速，10x 内存节省，解释质量优于大模型
- 来源：https://arxiv.org/html/2511.16543v1

**行业数据**：
- AI 尺码推荐提升转化率 20-40%（AiFitFinder 2025）
- 50% 的服饰退货是尺码问题（Sizebay 2025）
- 每次收到错尺码，复购概率下降 2 倍（Sizebay 2025）

### 1.3 方案对比

| 方案 | 核心思路 | 优势 | 劣势 | 适用性 |
|------|---------|------|------|--------|
| LLM 自由生成解释 | 把推荐结果交给 LLM 生成自然语言 | 语言流畅 | 可能编造理由，不忠实于算法 | ❌ 不适合 |
| SHAP 特征归因 + 模板 | 用算法归因确定哪些特征贡献最大，填入模板 | 忠实、可控 | 语言较机械 | ✅ 适合当前阶段 |
| 三层结构化解释 | 结论层 + 依据层（画像×商品） + 信心层 | 兼顾忠实性和自然度 | 需要精心设计模板 | ✅ 推荐 |
| Prism 解耦式 | 大模型教师生成高质量解释，蒸馏到小模型 | 高质量 + 低延迟 | 需要额外训练 | 部分（远期） |

### 1.4 推荐方案：三层结构化解释

```
Layer 1: 结论层（一句话）
  "根据您的购买记录，这款羽绒服推荐 M 码"

Layer 2: 依据层（画像锚点 + 匹配关系）
  "您近3个月购买的女装多为 M 码（身高约 160-170cm，体重约 105-115斤），
   该商品 M 码适合身高 155-168cm、体重 95-115斤，与您的画像高度匹配"

Layer 3: 信心层（根据置信度调整语气）
  高(≥0.7)：不加修饰
  中(0.3~0.7)："如果您近期体型有变化，可以告诉我调整"
  低(<0.3)："您也可以参考商品详情页的尺码表"
```

实现复杂度：**低**——只改 `formatReasoning()` + Agent 回复拼接。

关键原则（FIRE 论文）：解释必须忠实于覆盖率算法的实际计算结果，不能让 LLM 编造理由。当前系统的覆盖率算法天然可解释（每个特征匹配度透明），这是优势。

---

## 二、画像冲突仲裁

### 2.1 问题定义

- 当前画像的核心数据（体重/身高/尺码）来自历史订单客观数据，不会在对话中自相矛盾
- 但以下场景确实会发生：为他人购买（角色切换）、明确纠正、主观偏好修饰（宽松/修身）
- SPEC 7.2 中的完整仲裁系统（置信度 + 时间衰减 + 震荡抑制）对当前场景过重

### 2.2 业界实践

**ContraSolver（arxiv 2024）**：
- 偏好图（Preference Graph）检测矛盾，最大生成树保留高置信度偏好
- 来源：https://arxiv.org/html/2406.08842v1

**DPO + Chain-of-Thought（Stanford 2025）**：
- 6 类偏好矛盾分类，训练模型"先推理矛盾类型，再采用最新偏好"
- 核心：让模型先解释冲突再处理，而非自动覆盖

**AWARE-US（arxiv 2025）**：
- 当约束互相矛盾导致无解时，自动放松最不重要的约束
- 3 种方法推断约束优先级：局部加权、全局加权、两两排序
- 来源：https://arxiv.org/html/2601.02643v2

**Conversational Recommendation with Memory Graph（ACL 2020）**：
- 用用户记忆知识图谱管理离线画像（历史）+ 在线画像（当前对话）
- 在线偏好覆写离线画像，但不永久修改
- 来源：https://aclanthology.org/2020.coling-main.463/

### 2.3 方案对比

| 方案 | 核心思路 | 优势 | 劣势 | 适用性 |
|------|---------|------|------|--------|
| 完整冲突仲裁（置信度+衰减+震荡抑制） | 每次偏好更新都做加权计算 | 精细 | 身体特征不会冲突，过度设计 | ❌ 当前不需要 |
| 偏好图（ContraSolver） | 构建偏好节点+冲突边 | 理论完备 | 实现复杂，场景不匹配 | ❌ 过重 |
| DPO 矛盾训练 | 微调模型识别矛盾 | 模型原生能力 | 需要训练数据 | 部分（远期） |
| **轻量级对话覆写规则** | 4 条确定性规则处理高频场景 | 简单、可控、覆盖 80% 场景 | 不处理复杂冲突 | ✅ 推荐 |

### 2.4 推荐方案：轻量级对话偏好覆写

4 条确定性规则，不需要置信度或时间衰减：

| 规则 | 触发条件 | 处理 |
|------|---------|------|
| **明确纠正** | "我要 L 码"、"不要 M" | 本次推荐锁定用户指定规格 |
| **为他人购买** | "帮我老公买"、"给孩子选" | 切换到对应性别角色画像 |
| **主观偏好** | "要宽松的"、"要修身的" | 匹配参数向大/小一码偏移 |
| **画像纠正** | "我现在 165cm，55kg" | applyDelta() 更新画像 |

实现复杂度：**低**（明确纠正 + 画像纠正） / **中**（角色切换 + 偏好修饰）

### 2.5 解释性 × 冲突处理的协同

两者在以下场景形成闭环：

```
用户："帮我老公买一件外套，他 180cm 80kg"
  ① 角色切换检测 → 切换到 maleClothing
  ② 对话画像提取 → applyDelta(height:[180,180], weight:[160,160])
  ③ 覆盖率匹配 → 用男装画像匹配
  ④ 结构化解释（依据层使用临时画像）→
     "根据您提供的信息（身高 180cm，体重 80kg），
      这款外套推荐 XL 码，适合身高 175-185cm、体重 150-170斤。"
  ⑤ 信心层（低置信度，首次为他人选购）→
     "由于是首次为他选购，建议参考商品详情页确认。"
```

---

## 三、优先级建议

| 优化项 | 业务价值 | 实现复杂度 | 建议 |
|--------|---------|-----------|------|
| 解释性重构（三层结构） | 高 | 低 | **P0** |
| 明确纠正识别 | 高 | 低 | **P0** |
| 画像纠正识别 | 中 | 低 | **P0** |
| 为他人购买检测 | 中高 | 中 | **P1** |
| 主观偏好修饰 | 中 | 中 | **P1** |
| 完整冲突仲裁系统 | 低 | 高 | 保持在 7.2 远期 |

---

## 四、参考链接

- [Amazon Fashion AI Size Recommendation](https://www.aboutamazon.com/news/retail/how-amazon-is-using-ai-to-help-customers-shop)
- [Stitch Fix Latent Size Model](https://multithreaded.stitchfix.com/blog/2017/12/13/latentsize/)
- [FIRE: Faithful Interpretable Recommendation Explanations (2025)](https://arxiv.org/html/2508.05225v1)
- [The Prism: Decoupled Recommendation Explanation (2025)](https://arxiv.org/html/2511.16543v1)
- [ContraSolver: Preference Contradiction Resolution (2024)](https://arxiv.org/html/2406.08842v1)
- [AWARE-US: Preference-Aware Infeasibility Resolution (2025)](https://arxiv.org/html/2601.02643v2)
- [User Memory Reasoning for Conversational Recommendation (ACL 2020)](https://aclanthology.org/2020.coling-main.463/)
- [AI Size Recommendation Guide (AiFitFinder 2025)](https://aifitfinderapp.com/blog/e-commerce/complete-guide-to-ecommerce-size-recommendation/)
- [Size Doubts Impact on Fashion E-Commerce (Sizebay 2025)](https://sizebay.com/en/blog/size-doubts-and-customer-experience/)
