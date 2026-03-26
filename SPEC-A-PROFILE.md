# SPEC-A: 画像提取系统（Profile Extraction System）

> 版本：1.0 — 服饰类目用户/商品画像离线提取与在线匹配系统
> 本系统与客服 Agent 系统（[SPEC-B-AGENT.md](./SPEC-B-AGENT.md)）通过 `UserSpecProfile` / `ProductSpecProfile` 数据契约连接。

## 目录

- [1. 系统概述](#1-系统概述)
- [2. 画像数据结构](#2-画像数据结构)
- [3. 离线清洗流程](#3-离线清洗流程)
- [4. 覆盖率匹配算法](#4-覆盖率匹配算法)
- [5. SFT/GRPO 微调全流程](#5-sftgrpo-微调全流程)
  - [5.1 业务背景与核心痛点](#51-业务背景与核心痛点)
  - [5.2 技术演进路线](#52-技术演进路线)
  - [5.3 Prompt 优化](#53-prompt-优化)
  - [5.4 训练数据集构建](#54-训练数据集构建)
  - [5.5 SFT 监督微调](#55-sft-监督微调)
  - [5.6 GRPO 强化学习](#56-grpo-强化学习)
  - [5.7 评测方案](#57-评测方案)
- [6. 模型部署与路由](#6-模型部署与路由)
- [7. 评测方案](#7-评测方案)
- [附录 A: 真实训练数据格式](#附录-a-真实训练数据格式)

---

## 1. 系统概述

本系统是一个**独立的用户/商品画像提取与匹配系统**，专注于从用户历史订单数据中提取结构化身体特征画像，并基于覆盖率算法实现商品规格的精准推荐。系统与客服 Agent 系统（SPEC-B）解耦，通过 `UserSpecProfile` / `ProductSpecProfile` 数据契约对接。

**两大核心模型**：

| 模型 | 用途 | 部署规格 |
|------|------|---------|
| **Qwen3-8B（SFT/RL）** | 用户画像提取（替代 72B） | 1×X40 GPU |
| **Qwen3-30B-A3B-AWQ** | 商品画像提取 | 量化部署 |

**核心能力**：

1. **离线清洗**：T+1 增量更新用户画像与商品画像，基于大模型从订单记录/商品标题中提取 8 种身体特征（体重、身高、腰围、胸围、脚长、上装尺码、下装尺码、鞋码），存储于 Redis
2. **在线匹配**：基于覆盖率的规格推荐算法——遍历商品各规格值，按配置化的特征优先级依次计算区间重叠率，选择覆盖率最高的规格；全部无解时 Fallback 到 72B 模型推理
3. **SFT/GRPO 微调**：通过 Prompt 优化 → SFT 监督微调 → GRPO 强化学习三阶段迭代，预期 8B 模型评测得分逼近 72B 水平，大幅降低推理成本与耗时

---

## 2. 画像数据结构

系统针对服饰类目实现了精细化的身体特征画像。画像由大模型从用户历史购买订单中提取，以增量滚动 T+1 方式持续更新，存储于 Redis（key: `profile:{userId}`）。区间类特征采用 `[min, max]` 表示，尽可能扩大匹配范围——如用户曾购买身高 120-150 的女装 A 和身高 160-180 的女装 B，则画像中女性身高为 `[120.0, 180.0]`。

**用户尺码画像数据结构（`UserSpecProfile`）**：

```typescript
interface UserSpecProfile {
  userId: string;

  // 按性别/角色分组的身体特征（同一用户可能为自己和家人购买）
  femaleClothing?: GenderSpecProfile;   // 女装画像
  maleClothing?: GenderSpecProfile;     // 男装画像
  childClothing?: GenderSpecProfile;    // 童装画像

  defaultRole: 'female' | 'male' | 'child'; // 无法判断时的默认角色
  updatedAt: string;
}

interface GenderSpecProfile {
  weight: [number, number] | null;      // 体重区间（斤），如 [105, 115]
  height: [number, number] | null;      // 身高区间（cm），如 [160, 170]
  waistline: [number, number] | null;   // 腰围区间（cm），如 [66, 70]
  bust: [number, number] | null;        // 胸围区间（cm），如 [80, 90]
  footLength: [number, number] | null;  // 脚长区间（mm），如 [235, 245]
  size: string[] | null;                // 上装尺码集合，如 ["M", "L"]
  bottomSize: string[] | null;          // 下装尺码集合，如 ["M", "L"]
  shoeSize: string[] | null;            // 鞋码集合，如 ["37", "38"]
}
```

**商品规格画像数据结构（`ProductSpecProfile`）**：

商品画像由大模型从商品标题、规格数据中提取，按 `propValueId`（规格值 ID）粒度存储。每个规格值对应一组身体特征区间，用于与用户画像进行覆盖率匹配。

```typescript
interface ProductSpecProfile {
  propValueId: string;                  // 规格值 ID（如某个 SKU 的尺码 ID）
  productId: string;
  category: string;                     // 商品类目（femaleClothing / maleClothing / ...）
  targetAudience: 'adult_female' | 'adult_male' | 'child';

  // 该规格值对应的身体特征区间
  weight: [number, number] | null;      // 适合体重区间（斤）
  height: [number, number] | null;      // 适合身高区间（cm）
  waistline: [number, number] | null;   // 适合腰围区间（cm）
  bust: [number, number] | null;        // 适合胸围区间（cm）
  footLength: [number, number] | null;  // 适合脚长区间（mm）
  size: string | null;                  // 上装尺码，如 "XL"
  bottomSize: string | null;            // 下装尺码，如 "XL"
  shoeSize: string | null;              // 鞋码，如 "40"
}
```

**Redis 存储示例**：

```json
// 商品画像：key = product_spec:{propValueId}
{
  "propValueId": "105217133",
  "shoeSize": "40",
  "size": "2XL",
  "weight": [80, 110],
  "height": [160, 165],
  "bust": [80, 110]
}

// 用户画像：key = profile:{userId} → femaleClothing
{
  "weight": [105, 115],
  "height": [160, 170],
  "size": ["M"],
  "bottomSize": ["M"],
  "shoeSize": ["37", "38"],
  "footLength": [235, 245],
  "waistline": null,
  "bust": null
}
```

---

## 3. 离线清洗流程

**离线清洗流程**（T+1 增量更新）：

```
┌─────────────────────────────────────────────────────────────┐
│ 商品画像构建（离线）                                           │
│                                                               │
│ 服饰类目商品标题 + 规格数据                                    │
│        ↓                                                      │
│ 大模型特征提取（Qwen3-30B-A3B-AWQ）                           │
│   → 8 种身体特征：体重区间、身高区间、尺码、鞋码等             │
│        ↓                                                      │
│ 商品画像（规格维度）→ Redis 存储（propValueId → 特征）         │
│                                                               │
│ 用户画像构建（离线）                                           │
│                                                               │
│ 用户历史购买订单记录                                           │
│        ↓                                                      │
│ 大模型特征提取（Qwen2.5-72B-Instruct）                        │
│   → 尺码推断、体重区间、身高区间等                             │
│        ↓                                                      │
│ 用户尺码画像 → Redis 存储（userId → 特征区间集合）             │
│                                                               │
│ 增量滚动 T+1 更新商品画像 / 用户画像                          │
└─────────────────────────────────────────────────────────────┘
```

**核心处理器**：

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `OrderAnalyzer` | 历史订单统计聚合 | `Order[]` | `RawProfileFeatures` |
| `ProfileBuilder` | 特征工程，将原始统计转化为结构化画像 | `RawProfileFeatures` | `UserProfileEntity` |
| `ConversationProfileUpdater` | 从对话中提取实时偏好更新 | `Message[]`, `UserProfileEntity` | `ProfileDelta` |
| `SpecInferenceEngine` | 基于覆盖率算法匹配规格，fallback 调用模型 | `UserProfileEntity`, `ProductInfo` | `SpecRecommendation` |
| `ColdStartManager` | 冷启动策略管理：群体画像查询、引导问题生成 | `UserProfileEntity` | `ColdStartAction` |
| `ProfileDimensionRegistry` | 画像维度插件注册中心 | `ProfileDimensionPlugin` | 注册/注销确认 |

---

## 4. 覆盖率匹配算法

**在线匹配流程**（实时规格推荐）：

```
┌─────────────────────────────────────────────────────────────┐
│ 在线匹配                                                      │
│                                                               │
│ 用户画像（8 种特征区间）+ 商品画像（8 种特征维度）            │
│        ↓                                                      │
│ 特征匹配顺序配置化（支持动态调整）                             │
│ 遍历各规格值，依次算覆盖率                                     │
│   覆盖率 = 区间重叠范围 / 用户画像区间范围                     │
│        ↓                                                      │
│ 存在覆盖率 > 0 的规格？                                       │
│   → True: 选择覆盖率最高的规格 → 匹配成功                     │
│   → False: 继续处理下一个特征 → 全部失败则 Fallback 到 72B    │
└─────────────────────────────────────────────────────────────┘
```

**覆盖率计算公式**：

```
覆盖率 = 区间重叠范围 / 用户画像区间范围
```

对于用户画像区间 `[u_min, u_max]` 和商品规格区间 `[p_min, p_max]`：
- 重叠区间 = `[max(u_min, p_min), min(u_max, p_max)]`
- 重叠范围 = `min(u_max, p_max) - max(u_min, p_min)`（若 ≤ 0 则无重叠）
- 覆盖率 = 重叠范围 / `(u_max - u_min)`

**特征匹配优先级**（配置化，支持热更新）：

```
FEATURE_PRIORITY = [height, weight, bust, waistline, footLength]
```

按优先级从高到低依次尝试匹配，首个有解的特征即作为匹配依据。优先级顺序可通过 `RuntimeConfig` 动态调整。

**Fallback 策略**：当所有特征维度均无覆盖率 > 0 的规格时，Fallback 到 Qwen2.5-72B 模型进行推理。

---

## 5. SFT/GRPO 微调全流程

### 5.1 业务背景与核心痛点

电商提单页是用户下单的必经之路，对于多 SKU 商品，当前规格默选策略基本为"默选最低价"，但服饰类目有尺码等个性化信息，无法适用该策略。为提升服饰类目的默选渗透率，需要解决三大难题：**用户角色识别不准**、**尺码推荐偏差大**、**规格匹配率低**。

系统引入 AI 大模型，根据用户历史下单记录构建用户特征画像，同时智能清洗商品规格，根据用户画像计算商品规格的匹配度和权重，推荐期望值最高的尺码和规格。但在实践中发现关键瓶颈：

| 痛点 | 现状 | 影响 |
|------|------|------|
| **更新周期过长** | 采用 Qwen2.5-72B 提取画像，平均每天 173 万条，1 亿条数据需 58 天 | 画像时效性差，严重影响业务效果 |
| **精准率不足** | 画像提取准确率从业务 AB 来看约 60% | 默选命中率低，用户体验差 |
| **资源成本高** | 72B 模型需 2×X40 GPU | 无法大规模部署 |

**目标**：将 Qwen2.5-72B 替换为轻量级 Qwen3-8B，通过 SFT + GRPO 强化学习 + Prompt 优化保证效果持平或更优，同时大幅降低推理延迟和资源成本。

### 5.2 技术演进路线

整体经历了 **Prompt 调优 → SFT 微调 → 数据重构 + GRPO 强化学习** 三轮迭代：

```
┌──────────────────────────────────────────────────────────────────┐
│  第一阶段：Prompt 调优                                            │
│  ├── 提取规则清晰化（将行业标准尺码换算写入 Prompt）              │
│  ├── 输出格式标准化（XXL→2XL, 鞋码去单位, 体重统一斤）           │
│  └── 成果：提取质量提升，数据质量标准化                           │
│                                                                    │
│  第二阶段：SFT 微调                                               │
│  ├── 基于 Qwen3-8B (base) 进行 LoRA SFT                          │
│  ├── 1W 条全量目标数据集                                          │
│  ├── 数据来源：KAFKA + HIVE → Qwen3-30B/72B/7B 交叉验证          │
│  └── 成果：验证 8B(SFT) 提取能力，并构建初步评测基线              │
│                                                                    │
│  第三阶段：数据重构 + GRPO 强化学习                                │
│  ├── 交叉模型验证重建高质量数据集                                  │
│  ├── GRPO 算法训练（组内相对优势 + 自定义奖励函数）               │
│  └── 预期：8B(RL) 评测得分接近 72B，兼顾性能与部署成本            │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 Prompt 优化

Prompt 优化是微调前的基础工作，核心方向是**制定明确的提取规则**，使轻量模型（8B）也能准确执行特征提取。

**提取规则清晰化**：将行业标准尺码换算规则直接写入 Prompt，避免依赖模型隐式理解：

| 特征 | 换算规则 | 示例 |
|------|---------|------|
| 胸围（内衣） | 国际码/下胸围码 → 区间；中国标准码 → 区间 | `32/XX → [68.0, 72.0]`；`70A/B/C → [68.0, 72.0]`；`M(85-110) → [85.0, 110.0]` |
| 腰围（下装） | 直接数值 / 尺换算 / W码换算 | `腰围66-70cm → [66.0, 70.0]`；`2.6尺 → [86.7]`（×33.33）；`W26 → [66.0]`（×2.54） |
| 脚长（鞋类） | 公式：`(鞋码+10)×5` mm；优先提取商品描述中的内长 | `35码 → 225mm`；`内长23.5cm → [235.0]`（优先） |
| 童装尺码 | 与成人完全不同，`130码 → 身高 [120.0, 130.0]` | `120码 → [110.0, 120.0]` |

**输出格式标准化**：

- 上下装尺码统一：`XXL → 2XL`，`XXXL → 3XL`
- 鞋码不加单位：`35码 → 35`
- 脚长统一毫米：`[34, 35] → [340.0, 350.0]`
- 体重统一为斤，身高统一为厘米
- 无法判断角色时默认 `female`（女装销量最高）

### 5.4 训练数据集构建

高质量训练数据是模型效果的基石。系统采用**交叉模型验证**（Cross-Model Validation）构建标注数据集。

**方法选择**：

| 方案 | 原理 | 适用场景 | 选择 |
|------|------|---------|------|
| 自一致性（Self-Consistency） | 单模型多次推理 + 多数投票 | 推理任务、开放问题 | |
| 交叉模型验证（Cross-Model Validation） | 多模型单次推理 + 聚合比对 | **信息抽取、封闭问题** | **选用** |

> 本任务是信息抽取（从商品描述/订单中提取尺码特征），答案相对确定，主要是识别和转换，推理较少，因此选择交叉模型验证。

**标注流程**：

```
输入数据（商品标题+规格 / 用户订单记录）
        ↓
  三模型并行推理：
  ├── Qwen2.5-72B
  ├── Qwen3-30B-A3B-AWQ（量化 30B）
  └── Qwen3-32B-AWQ
        ↓
  反序列化为 UserSpecProfile / ProductSpecProfile 对象
        ↓
  逐字段一致性判定：
  ├── 2/3 模型一致 → 采纳为标准值
  ├── 3 模型均不一致 → 打日志，人工判定
  └── 构建最终标注输出
        ↓
  质量检查（长度分层 3:5:2，难度分布均衡）
        ↓
  输出高质量训练集 + 测试集
```

**数据质量要求**：

| 维度 | 要求 |
|------|------|
| 准确性 | 答案事实准确，逻辑推理无误，引用信息可验证 |
| 相关性 | 问答高度相关，回答直接解决问题，控制信息冗余 |
| 多样性 | 长度分层（短:中:长 = 3:5:2），难度分布合理（简单:中等:困难） |

### 5.5 SFT 监督微调

**训练配置**：

| 参数 | 值 | 说明 |
|------|-----|------|
| 基础模型 | Qwen3-8B (base) | |
| 训练方式 | LoRA | 仅训练适配器权重，基础模型冻结 |
| LoRA rank (r) | 32 | |
| LoRA alpha | 32 | |
| 数据集规模 | ~1W 条 | 全量目标数据（instruction/input/output 格式） |
| Learning Rate | 5e-5 | |
| Epochs | 3~5 | |
| Batch Size | 8 | |
| Dropout | 0.05 | |

**SFT 数据格式**：

```json
{
  "instruction": "根据以下商品信息，提取商品的身体特征画像...",
  "input": "商品标题：秋冬圆领短款卫衣L 160-165\n规格：尺码L, 身高区间160-165cm",
  "output": "{\"height\": [160.0, 165.0], \"weight\": [80.0, 110.0], \"size\": \"L\", ...}"
}
```

**SFT 产出**：导出 LoRA adapter 权重（`LoRA_adapter_sft`），合并到基础模型得到 `Qwen3-8B(SFT)`。

### 5.6 GRPO 强化学习

在 SFT 基础上，进一步使用 GRPO（Group Relative Policy Optimization）强化学习优化模型，让模型在"试错"中学习更好的输出，而非仅模仿标注答案。

**GRPO vs PPO**：

| 维度 | PPO | GRPO（选用） |
|------|-----|------|
| Value Model | 需要，用于估计 V(s) | **不需要** |
| 优势估计 | `A = R - V(s)` | **组内相对比较**，天然基线 |
| 显存占用 | 较高 | **较低** |
| 每 prompt 采样数 | 通常 1 | G 个（4-16） |
| 典型应用 | ChatGPT, GPT-4 | **DeepSeek-R1, DeepSeek-Math** |

**GRPO 核心算法**：

```
对每个 prompt q，生成 G 个回答 {o₁, o₂, ..., o_G}
每个回答获得奖励 {r₁, r₂, ..., r_G}

基线 baseline = mean(r₁, ..., r_G)
标准差 std = std(r₁, ..., r_G)
优势 Aᵢ = (rᵢ - baseline) / (std + ε)

→ Aᵢ > 0：该回答优于组内平均，强化其生成概率
→ Aᵢ < 0：该回答劣于组内平均，抑制其生成概率
→ 加入 KL 散度惩罚，防止策略偏离参考模型过远
```

**训练配置**：

| 参数 | 值 | 说明 |
|------|-----|------|
| 基础模型 | Qwen3-8B(SFT) | SFT 产出作为 RL 起点 |
| 算法 | GRPO | |
| Group Size (G) | 8 | 每个 prompt 生成 8 个候选回答 |
| Learning Rate | 1e-6 | 比 SFT 更小 |
| KL 系数 (β) | 0.04 | 控制策略偏离程度 |
| Clip Range (ε) | 0.2 | 策略比率裁剪 |
| Temperature | 0.7 | 保证采样多样性 |
| LoRA Rank | 16 | |
| LoRA Target | `q_proj, v_proj, k_proj, o_proj` | |

**奖励函数设计**：

奖励函数是强化学习的核心，决定训练方向。系统将业务评测脚本改造为 Python 奖励函数，主要目标是让模型提取特征覆盖更广、更精准：

```python
class SpecExtractionReward(ORM):
    """逐字段比对模型输出与标准答案，计算归一化奖励"""

    def __call__(self, completions: List[str], **kwargs) -> List[float]:
        scores = []
        for i, completion in enumerate(completions):
            solution = json.loads(completion.strip()) if completion.strip() else {}
            field_scores = []
            for field in ['weight', 'height', 'waistline', 'bust',
                          'footLength', 'size', 'bottomSize', 'shoeSize']:
                predicted = solution.get(field)
                expected = kwargs.get(field, [None])[i]
                field_scores.append(self._compare_field(predicted, expected, field))
            scores.append(sum(field_scores) / len(field_scores))
        return scores

    def _compare_field(self, predicted, expected, field_name):
        if expected is None:
            return 1.0 if predicted is None else 0.0
        if isinstance(expected, list) and len(expected) == 2:
            # 区间类字段：计算重叠率
            return self._interval_overlap_score(predicted, expected)
        # 集合/单值字段：严格匹配
        return 1.0 if str(predicted).lower() == str(expected).lower() else 0.0
```

**GRPO 训练数据格式**：

```json
{
  "system": "你是一个专业的电商商品特征提取专家...",
  "prompt": "请从以下商品信息中提取身体特征画像...\n商品标题：连帽羽绒服S（80-110斤）",
  "response": "{\"weight\": [80.0, 110.0], \"size\": \"S\", ...}"
}
```

**训练监控**：核心关注 `eval/loss`（逐渐降低 = 拟合效果好）和 `eval/reward`（逐渐提升 = 提取质量提高）。

### 5.7 评测方案与预期目标

由于当前处于开发阶段，具体评测数据将在正式跑通全量数据后补充。

**预期演进目标**：

- **基线建立**：评估 72B 模型（旧 Prompt 与新 Prompt）在测试集上的表现，验证 Prompt 优化带来的效果提升（预期大幅提升）。
- **微调效果验证**：评估 8B(SFT) 与 8B(RL) 模型。预期 8B(RL) 显著优于纯 SFT，并逼近 72B（新 Prompt）的水平。
- **性能与成本评估**：验证部署规格从多卡降至单卡后，推理耗时是否达到预期的量级降低（预期数倍加速）。
- 最终业务效果需结合线上 A/B 实验的转化率数据综合判定。

---

## 6. 模型部署与路由

系统实现**标准化模型槽位架构**，允许在不修改业务逻辑的前提下切换底层推理模型（72B ↔ 8B-SFT ↔ 8B-RL），支持 A/B 流量路由和自动降级。

**模型槽位接口（`ModelSlot`）**：

```typescript
interface ModelSlot {
  slotId: string;
  modelType: 'spec_inference' | 'profile_extraction' | 'conversation' | 'intent_classify';
  provider: ModelProvider;
  config: ModelConfig;
  healthCheck(): Promise<HealthStatus>;
  warmup(): Promise<void>;
}

interface ModelProvider {
  name: string;                       // e.g. "qwen3-8b-rl", "qwen2.5-72b"
  endpoint: string;                   // 推理服务地址
  modelId: string;
  maxTokens: number;
  temperature: number;
  timeout: number;                    // 推理超时 ms
}

interface ModelConfig {
  batchSize: number;
  enableFallback: boolean;
  fallbackProvider?: ModelProvider;
  cacheTTL: number;
  maxRetries: number;
  retryDelay: number;
}

interface HealthStatus {
  healthy: boolean;
  latencyP50: number;
  latencyP99: number;
  errorRate: number;
  lastCheckAt: string;
}
```

**模型管理器（`ModelSlotManager`）**：

| 能力 | 说明 |
|------|------|
| **注册/注销** | `registerSlot(slot: ModelSlot)` / `unregisterSlot(slotId)` 动态管理 |
| **热切换** | `switchProvider(slotId, newProvider)` 零停机切换底层模型 |
| **健康检查** | 定时探活（每 30s），不健康自动 fallback |
| **指标收集** | 每次推理记录耗时、token 数、成功/失败，通过 EventBus 广播 |
| **A/B 路由** | `routeByABTest(slotId, abConfig)` 按流量百分比分流到不同模型 |

**模型部署与路由**：

```
用户画像 + 商品信息
        ↓
  SpecInferenceEngine.infer(profile, product)
        ↓
  ┌─────────────────────────────────────────────────┐
  │ Step 1: 覆盖率算法匹配（零模型调用）              │
  │   → 遍历商品各规格值，按配置顺序计算覆盖率       │
  │   → 覆盖率 = 区间重叠 / 用户画像区间              │
  │   → 存在覆盖率 > 0 的规格？→ 选覆盖率最高 → 命中 │
  └─────────────┬───────────────────────────────────┘
                ↓ 未命中（所有特征均无重叠）
  ┌─────────────────────────────────────────────────┐
  │ Step 2: 模型推理 Fallback                        │
  │   ModelSlotManager.infer('spec_inference', prompt)│
  │                                                   │
  │   路由决策：                                       │
  │   ├── A/B 测试？→ 按比例分流                       │
  │   ├── 健康？  → 主模型 Qwen3-8B(RL)               │
  │   │             (预期低延迟，单卡部署)            │
  │   └── 不健康？→ fallback Qwen2.5-72B              │
  │                 (兜底模型，多卡部署)              │
  └─────────────┬───────────────────────────────────┘
                ↓
  推理结果解析 → SpecRecommendation
        ↓
  结果缓存 → Redis (key=userId:productId:profileVersion)
        ↓
  EventBus.publish('model:inference')
```

---

## 7. 评测方案

### 7.1 性能测试

| 测试目标 | 方法 | 验收标准 |
|---------|------|---------|
| 8B 模型推理延迟 | 1000 次规格推理 benchmark | P50 < 150ms, P99 < 500ms |
| 画像构建耗时 | 1000 用户画像构建 | P50 < 50ms (纯 CPU) |
| 冲突仲裁耗时 | 10000 次仲裁计算 | P50 < 5ms |
| 上下文压缩耗时 | 200 轮对话压缩 | < 100ms (零 LLM 调用层) |
| Redis 画像读取 | 10000 次随机读 | P50 < 2ms |

### 7.2 回归测试

| 测试目标 | 方法 | 说明 |
|---------|------|------|
| 规格推荐准确率 | 标注数据集 (≥500 case) | 8B-SFT 准确率 ≥ 72B 基线的 95% |
| Prompt 优化效果 | A/B 实验离线回放 | 优化后 badcase 率下降 ≥ 10% |

---

## 附录 A: 真实训练数据格式

### A.1 用户画像提取训练数据

```json
[
  {
    "instruction": "提取用户特征......",
    "input": "{\"女装\":[{\"item_title\":\"拼色长袖衬衫女士2025新款春秋洋气时尚宽松假两件衬衣休闲上衣潮\",\"sku_desc\":\"红色,XL  (建议115-125斤)\"},{\"item_title\":\"2025休闲裤女春夏新款梨形身材小个子宽松显瘦九分裤(气球裤)\",\"sku_desc\":\"白色,M  (80-105斤)\"}]}",
    "output": "{\"userProfileMap\":{\"female\":{\"weight\":[80.0,125.0],\"clothingSize\":[\"XL\"],\"plantsSize\":[\"M\"]}},\"defaultRole\":\"female\"}"
  },
  {
    "instruction": "提取用户特征......",
    "input": "{\"内衣/家居服/袜子\":[{\"item_title\":\"【透气  防臭 吸汗】精品男士防臭运动袜  不闷脚不臭脚！10双13.9\",\"sku_desc\":\"防滑耐磨不掉跟！吸汗透气【10双】13.9包邮\"}]}",
    "output": "{\"userProfileMap\":{},\"defaultRole\":\"male\"}"
  }
]
```

### A.2 模型输出画像结构

```json
{
  "userProfileMap": {
    "male":   {"weight": "[number, number] | null", "height": "[number, number] | null", "waist": "[number, number] | null", "bust": "[number, number] | null", "footLength": "[number, number] | null", "clothingSize": "string[] | null", "plantsSize": "string[] | null", "shoeSize": "string[] | null"},
    "female": {"weight": "[number, number] | null", "height": "[number, number] | null", "waist": "[number, number] | null", "bust": "[number, number] | null", "footLength": "[number, number] | null", "clothingSize": "string[] | null", "plantsSize": "string[] | null", "shoeSize": "string[] | null"},
    "child":  {"weight": "[number, number] | null", "height": "[number, number] | null", "waist": "[number, number] | null", "bust": "[number, number] | null", "footLength": "[number, number] | null", "clothingSize": "string[] | null", "plantsSize": "string[] | null", "shoeSize": "string[] | null"}
  },
  "defaultRole": "female | male | child"
}
```

### A.3 字段映射（模型输出 → 代码字段）

模型输出的字段名与代码中 `types.ts` 定义的字段名存在差异，映射在 `order-analyzer.ts` 中完成：

| 模型输出字段 | 代码字段 (types.ts) | 说明 |
|-------------|-------------------|------|
| `userProfileMap.female` | `femaleClothing` | 女装画像 |
| `userProfileMap.male` | `maleClothing` | 男装画像 |
| `userProfileMap.child` | `childClothing` | 童装画像 |
| `waist` | `waistline` | 腰围 |
| `clothingSize` | `size` | 上装尺码 |
| `plantsSize` | `bottomSize` | 下装尺码 |
