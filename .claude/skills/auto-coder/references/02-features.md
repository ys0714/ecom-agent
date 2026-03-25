## 2. 核心特点

### 2.1 用户特征画像引擎

系统根据用户历史下单记录，实时构建多维结构化画像，为客服对话中的商品推荐、规格默选、话术策略提供决策依据。

#### 2.1.1 画像领域实体（Rich Domain Model）

`UserProfile` 采用**充血领域模型**（Rich Domain Model）设计，不仅包含数据结构，还封装画像更新、冲突仲裁等核心业务行为。Application 层只负责流程编排，不包含业务规则。

**画像数据模型（`UserProfileEntity`）**：

```typescript
class UserProfileEntity {
  readonly userId: string;
  private version: number;
  private createdAt: string;
  private updatedAt: string;
  private dimensions: Map<string, DimensionData>;
  private meta: ProfileMeta;

  applyDelta(delta: ProfileDelta): Result<void, ConflictResult> {
    // 核心业务逻辑：检测冲突 → 仲裁 → 合并
  }

  resolveConflict(existing: DimensionData, incoming: DimensionDelta): ArbitrationResult {
    // 加权置信度仲裁算法（数据源×时间衰减×订单支撑×表达强度）
  }

  decayConfidence(now: Date): void {
    // 时间衰减：对所有维度的置信度执行 e^(-λt) 衰减
  }

  getDimension<T extends DimensionData>(dimensionId: string): T | undefined {
    return this.dimensions.get(dimensionId) as T | undefined;
  }

  summarizeForPrompt(): string {
    // 聚合所有维度生成 LLM 可读的画像摘要
  }

  getCompleteness(): number {
    // 计算画像完整度 0~1
  }
}

interface ProfileMeta {
  totalOrders: number;
  profileCompleteness: number;        // 0~1
  lastOrderAt: string;
  dataFreshness: number;              // 0~1（时间衰减）
  coldStartStage: 'cold' | 'warm' | 'hot';
}
```

**画像维度类型定义**（内置维度 + 可扩展自定义维度）：

```typescript
interface CategoryScore {
  category: string;
  score: number;                      // 0~1 偏好分
  confidence: number;                 // 0~1 置信度
  orderCount: number;                 // 支撑订单数
  lastOrderAt: string;
}

interface SpecScore {
  value: string;                      // 规格值（如 "XL", "红色"）
  score: number;                      // 0~1 偏好分
  confidence: number;                 // 0~1 置信度
  source: 'order_history' | 'explicit' | 'inferred' | 'conversation';
  updatedAt: string;
}
```

**内置画像维度**：

| 维度 ID | 说明 | 数据结构 |
|---------|------|---------|
| `spending` | 消费能力（客单价、价格区间、敏感度、优惠券使用率） | `SpendingDimension` |
| `categoryPreference` | 品类偏好（Top-K、近 30 天、季节性） | `CategoryDimension` |
| `specPreference` | 规格偏好（尺码/体重/身高/腰围/胸围/脚长等 8 种身体特征区间） | `SpecDimension` |
| `behavior` | 行为特征（购买频率、决策时长、退货率、活跃时段） | `BehaviorDimension` |
| `interaction` | 交互偏好（沟通风格、响应期望、投诉敏感度） | `InteractionDimension` |

**用户尺码画像数据结构（`UserSpecProfile`）**：

系统针对服饰类目实现了精细化的身体特征画像。画像由大模型从用户历史购买订单中提取，以增量滚动 T+1 方式持续更新，存储于 Redis（key: `profile:{userId}`）。区间类特征采用 `[min, max]` 表示，尽可能扩大匹配范围——如用户曾购买身高 120-150 的女装 A 和身高 160-180 的女装 B，则画像中女性身高为 `[120.0, 180.0]`。

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

#### 2.1.2 画像维度 Plugin 机制

为满足不同品类（服装 vs 数码 vs 食品）的差异化画像需求，系统采用**画像维度插件**（ProfileDimensionPlugin）架构。新增画像维度无需修改 `UserProfileEntity` 或已有代码，只需实现 Plugin 接口并注册。

```typescript
interface ProfileDimensionPlugin {
  dimensionId: string;
  displayName: string;
  schema: ZodSchema;                  // 该维度的数据运行时校验
  applicableCategories?: string[];    // 适用品类（空 = 全品类）

  extractFromOrders(orders: Order[]): DimensionData;
  updateFromConversation(msg: Message, current: DimensionData): DimensionDelta;
  arbitrate(existing: DimensionData, delta: DimensionDelta): DimensionData;
  summarize(data: DimensionData): string;
}

class ProfileDimensionRegistry {
  register(plugin: ProfileDimensionPlugin): void;
  unregister(dimensionId: string): void;
  getPlugin(dimensionId: string): ProfileDimensionPlugin | undefined;
  getPluginsForCategory(category: string): ProfileDimensionPlugin[];
  listAll(): ProfileDimensionPlugin[];
}
```

**扩展示例**：新增"售后偏好"维度只需编写一个 Plugin：

```typescript
const afterSalePlugin: ProfileDimensionPlugin = {
  dimensionId: 'afterSalePreference',
  displayName: '售后偏好',
  schema: AfterSaleSchema,
  extractFromOrders: (orders) => { /* 从退货/换货记录提取 */ },
  updateFromConversation: (msg, current) => { /* 从对话中识别售后诉求 */ },
  arbitrate: (existing, delta) => { /* 仲裁逻辑 */ },
  summarize: (data) => `退货倾向: ${data.returnTendency}, 偏好方式: ${data.preferredMethod}`,
};
dimensionRegistry.register(afterSalePlugin);
```

#### 2.1.3 冷启动策略

新用户（无历史订单或订单数不足）的画像构建采用**四级渐进式冷启动策略**：

| 阶段 | 触发条件 | 策略 | 画像来源 |
|------|---------|------|---------|
| **L0 — 零画像** | 无任何数据 | 使用群体画像 Fallback | 基于注册信息（年龄/性别/地区）匹配最近似用户群体的聚合画像 |
| **L1 — 主动探索** | `profileCompleteness < 0.3` | 对话前 N 轮主动引导用户表达偏好 | 引导问题如"您平时穿什么尺码？"、"预算大概多少？" |
| **L2 — 渐进积累** | `0.3 ≤ profileCompleteness < 0.7` | 每次交互补充画像，降低推荐置信度 | 订单 + 对话信号混合 |
| **L3 — 成熟画像** | `profileCompleteness ≥ 0.7` | 正常画像驱动推荐 | 完整多维画像 |

**冷启动特殊处理**：
- 画像置信度低于阈值时，推荐结果附加"热门商品"兜底，避免低质量个性化推荐
- `coldStartStage` 字段存入 `ProfileMeta`，各模块可据此调整行为（如 SpecInferenceEngine 在冷启动阶段跳过个性化规格推理）
- 冷启动阶段的 BadCase 不进入数据飞轮（样本质量不够）

#### 2.1.4 画像构建流程

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

**核心处理器**：

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| `OrderAnalyzer` | 历史订单统计聚合 | `Order[]` | `RawProfileFeatures` |
| `ProfileBuilder` | 特征工程，将原始统计转化为结构化画像 | `RawProfileFeatures` | `UserProfileEntity` |
| `ConversationProfileUpdater` | 从对话中提取实时偏好更新 | `Message[]`, `UserProfileEntity` | `ProfileDelta` |
| `SpecInferenceEngine` | 基于覆盖率算法匹配规格，fallback 调用模型 | `UserProfileEntity`, `ProductInfo` | `SpecRecommendation` |
| `ColdStartManager` | 冷启动策略管理：群体画像查询、引导问题生成 | `UserProfileEntity` | `ColdStartAction` |
| `ProfileDimensionRegistry` | 画像维度插件注册中心 | `ProfileDimensionPlugin` | 注册/注销确认 |

### 2.2 轻量模型推理 — SFT/GRPO 微调 8B 替代 72B

#### 2.2.1 业务背景与核心痛点

电商提单页是用户下单的必经之路，对于多 SKU 商品，当前规格默选策略基本为"默选最低价"，但服饰类目有尺码等个性化信息，无法适用该策略。为提升服饰类目的默选渗透率，需要解决三大难题：**用户角色识别不准**、**尺码推荐偏差大**、**规格匹配率低**。

系统引入 AI 大模型，根据用户历史下单记录构建用户特征画像，同时智能清洗商品规格，根据用户画像计算商品规格的匹配度和权重，推荐期望值最高的尺码和规格。但在实践中发现关键瓶颈：

| 痛点 | 现状 | 影响 |
|------|------|------|
| **更新周期过长** | 采用 Qwen2.5-72B 提取画像，平均每天 173 万条，1 亿条数据需 58 天 | 画像时效性差，严重影响业务效果 |
| **精准率不足** | 画像提取准确率从业务 AB 来看约 60% | 默选命中率低，用户体验差 |
| **资源成本高** | 72B 模型需 2×X40 GPU | 无法大规模部署 |

**目标**：将 Qwen2.5-72B 替换为轻量级 Qwen3-8B，通过 SFT + GRPO 强化学习 + Prompt 优化保证效果持平或更优，同时大幅降低推理延迟和资源成本。

#### 2.2.2 技术演进路线

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
│  └── 成果：Qwen3-8B(SFT) 评测 84.53，与 72B 仅差 6 分             │
│                                                                    │
│  第三阶段：数据重构 + GRPO 强化学习                                │
│  ├── 交叉模型验证重建高质量数据集                                  │
│  ├── GRPO 算法训练（组内相对优势 + 自定义奖励函数）               │
│  └── 成果：Qwen3-8B(RL) 评测 89.52，接近 72B 的 90.42             │
└──────────────────────────────────────────────────────────────────┘
```

#### 2.2.3 Prompt 优化

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

#### 2.2.4 训练数据集构建

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

#### 2.2.5 SFT 监督微调

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

#### 2.2.6 GRPO 强化学习

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

#### 2.2.7 评测结果

| 指标 | Qwen2.5-72B（旧 Prompt，线上） | Qwen2.5-72B（新 Prompt） | Qwen3-8B(SFT) | Qwen3-8B(RL) |
|------|------|------|------|------|
| **部署规格** | 1×2 X40 | 1×2 X40 | 1×1 X40 | 1×1 X40 |
| **评测得分** | 71.59 | 90.42 | 84.53 | **89.52** |
| **推理耗时（450 条）** | 11min | 42min | 6.66min | ~7min |
| **资源成本** | 2 GPU | 2 GPU | **1 GPU** | **1 GPU** |

**关键结论**：

- **Prompt 优化效果显著**：72B 模型从 71.59 → 90.42（+26%），说明提取规则清晰化和输出标准化是基础且高效的优化手段
- **GRPO 强化学习显著优于纯 SFT**：8B(RL) 89.52 vs 8B(SFT) 84.53（+5.9%），接近 72B 新 Prompt 的 90.42
- **成本降低 50%+**：从 2×X40 GPU 降至 1×X40 GPU，推理耗时从 42min 降至 ~7min（6x 加速）
- 最终业务效果以线上 A/B 数据为准

#### 2.2.8 模型槽位架构

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
  │   │             P50: ~7min/450条 (1×X40)          │
  │   └── 不健康？→ fallback Qwen2.5-72B              │
  │                 P50: ~42min/450条 (2×X40)         │
  └─────────────┬───────────────────────────────────┘
                ↓
  推理结果解析 → SpecRecommendation
        ↓
  结果缓存 → Redis (key=userId:productId:profileVersion)
        ↓
  EventBus.publish('model:inference')
```

#### 2.2.9 推荐解释性（三层结构化解释）

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

#### 2.2.10 对话偏好覆写与置信度仲裁（混合方案）

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

### 2.3 会话记忆与上下文管理

系统采用**画像 Store + 滑动窗口**的简洁记忆架构，避免过度工程。核心洞察：用户画像是结构化的确定性数据（体重/身高/尺码），始终注入 System Prompt，不需要复杂的分层记忆检索。

> 参考 Mem0 的实证结论："90% 的 token 节省来自只注入相关记忆到 Prompt，而非复杂的分层流转。"
> 参考 Letta(MemGPT) 的 Core Memory 设计："始终可见的结构化数据直接 prepend 到 Prompt，不需要检索。"

#### 2.3.1 画像 Store（长期持久化）

| 属性 | 说明 |
|------|------|
| 存储介质 | Redis（RedisJSON 支持部分更新）+ JSON 文件落盘 |
| 生命周期 | 跨会话持久，随订单 T+1 增量更新 + 对话实时补充 |
| 内容 | `UserProfileEntity` 完整画像（见 2.1.1） |
| 使用方式 | 每轮对话开始时读取，通过 `summarizeForPrompt()` 注入 System Prompt |
| 更新方式 | 对话中提取到新偏好信号时直接 `applyDelta()` 并写回 Redis |

#### 2.3.2 滑动窗口（会话上下文）

| 属性 | 说明 |
|------|------|
| 存储介质 | 纯内存 |
| 生命周期 | 当前会话，会话结束后归档到 JSONL |
| 内容 | 最近 K 轮对话（默认 K=10），含 user/assistant/tool_call/tool_result |
| 淘汰策略 | FIFO 滑动，超出 K 轮的消息直接丢弃（不压缩、不摘要） |
| 大小约束 | 固定 K 条消息（约 5KB） |

**LLM 上下文构建**：

```
System Prompt:
  ├── 角色人设（静态）
  ├── 用户画像摘要（UserProfileEntity.summarizeForPrompt()）
  ├── 当前场景指令（基于 WorkflowType 条件拼接）
  └── 安全约束（Guardrails 指令）
+
滑动窗口内的最近 K 轮对话消息
```

> Prompt 拼接使用 TypeScript 模板字面量 + 条件表达式，简洁直接，不引入额外模板引擎：
> ```typescript
> const systemPrompt = `你是一个电商客服。
> ${profile.getCompleteness() >= 0.7
>   ? `用户画像：${profile.summarizeForPrompt()}`
>   : '请先询问用户的基本信息（身高/体重/常穿尺码）'}
> ${workflow === 'complaint' ? '请以安抚为优先策略。' : ''}
> ${GUARDRAIL_INSTRUCTIONS}`;
> ```

**会话持久化与重建**：

- **持久化格式**：JSONL（每行一个 JSON 记录），append-only 写入
- **记录类型**：`session_start`, `session_end`, `message`, `tool_call`, `tool_result`, `profile_update`
- **重建流程**：`SessionManager.rebuild(sessionId)` → 解析 JSONL → 恢复滑动窗口最近 K 轮 → 从 Redis 加载画像 → 继续追加

### 2.4 EventBus + Subscriber 运行时解耦

所有核心行为通过 `InMemoryEventBus<AgentEvent>` 发布-订阅，实现运行时与监控采集的完全解耦。

#### 2.4.1 事件分级与消息模式

事件按**业务影响**分为三个等级，不同等级采用不同的分发策略：

| 等级 | 分发策略 | 事件示例 | 说明 |
|------|---------|---------|------|
| **Critical** | 同步分发，失败触发 fallback | `model:fallback`, `system:error`, `guardrail:blocked` | 影响业务流程正确性的事件 |
| **Normal** | 异步分发，独立错误边界 | `profile:updated`, `model:inference`, `message:*` | 标准业务事件 |
| **Low** | 异步分发，批量/延迟处理 | `session:summary`, `badcase:prompt_optimized` | 运维/分析类事件 |

#### 2.4.2 事件类型定义

| 事件类型 | 等级 | 触发时机 | 消费者 |
|---------|------|---------|--------|
| `agent:start` / `agent:stop` | Normal | 会话开始/结束 | SessionLogSubscriber, MetricsSubscriber |
| `message:user` / `message:assistant` | Normal | 用户/客服消息到达 | SessionLogSubscriber, ReplaySubscriber |
| `tool:call` / `tool:result` | Normal | 工具调用前/后 | MetricsSubscriber, TracingSubscriber |
| `profile:updated` | Normal | 用户画像更新 | SessionLogSubscriber, MetricsSubscriber |
| `model:inference` | Normal | 模型推理完成 | MetricsSubscriber, TracingSubscriber |
| `model:fallback` | Critical | 模型降级触发 | AlertSubscriber, MetricsSubscriber |
| `model:health_check` | Low | 模型健康检查 | MetricsSubscriber |
| `session:summary` | Low | 会话归档 | SessionLogSubscriber |
| `badcase:detected` | Normal | BadCase 识别 | AutoPromptSubscriber, AlertSubscriber |
| `badcase:prompt_optimized` | Low | Prompt 自动优化 | MetricsSubscriber |
| `guardrail:blocked` | Critical | 安全护栏拦截 | AlertSubscriber, SessionLogSubscriber |
| `system:error` | Critical | 系统异常 | AlertSubscriber, SessionLogSubscriber |

#### 2.4.3 Subscriber 错误隔离

每个 Subscriber 运行在**独立错误边界**内：

```typescript
interface EventSubscriber {
  name: string;
  subscribedEvents: AgentEventType[];
  priority: 'critical' | 'normal' | 'low';
  handle(event: AgentEvent): void | Promise<void>;
  onError?(error: Error, event: AgentEvent): void;
}
```

**错误处理策略**：Critical 重试 3 次 → 死信队列 → 告警；Normal 重试 1 次 → 日志；Low 不重试 → 静默。

#### 2.4.4 六大 Subscriber 实现

1. **`SessionLogSubscriber`** (Normal) — JSONL 会话日志持久化
2. **`MetricsSubscriber`** (Normal) — 通过 OTel Metrics API 暴露指标
3. **`TracingSubscriber`** (Normal) — 通过 OTel Tracing API 导出 span
4. **`AlertSubscriber`** (Critical) — 规则告警（连续降级/错误率/BadCase 率），Webhook 预留
5. **`AutoPromptSubscriber`** (Low) — BadCase 事件触发数据飞轮 Pipeline
6. **`ConfigWatchSubscriber`** (Normal) — 配置热更新推送

新增 Subscriber 只需实现接口并调用 `registry.register()`，无需修改任何现有代码。

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
| `AfterSaleWorkflow` | 查询订单、退款策略、工单创建 | `issue_identify → order_lookup → solution_propose → execute` |
| `LogisticsWorkflow` | 物流查询、配送状态 | `order_identify → tracking → eta_notify` |
| `ComplaintWorkflow` | 工单创建、优惠补偿、转人工 | `issue_collect → severity_assess → resolution → followup` |

### 2.7 Agent Guardrails 安全护栏

电商客服 Agent 必须具备安全防护能力。参考业界实践（Google Cloud Agent KPI 框架、Strands Evals），系统实现**输入/执行/输出三层防护**：

```
用户消息 → [输入层] → LLM 推理 → [执行层] → 生成回复 → [输出层] → 返回用户
```

#### 2.7.1 输入层防护

| 防护项 | 方法 | 说明 |
|--------|------|------|
| **Prompt 注入检测** | 规则匹配 + LLM 分类 | 检测"忽略上面的指令"、角色扮演攻击等注入模式 |
| **敏感词过滤** | 关键词库 + 正则 | 过滤违禁词、竞品名称等（可配置词库） |
| **用户身份绑定** | Session 校验 | 确保用户只能查询自己的订单/画像，防止越权 |

#### 2.7.2 执行层防护

| 防护项 | 方法 | 说明 |
|--------|------|------|
| **工具调用权限** | 白名单 + Workflow 上下文 | 每个 Workflow 只能调用其声明的工具集 |
| **操作幂等性** | 幂等 key 校验 | 退款等敏感操作防止重复执行 |
| **金额/频率限制** | 阈值校验 | 单次补偿金额上限、每日操作次数限制 |

#### 2.7.3 输出层防护

| 防护项 | 方法 | 说明 |
|--------|------|------|
| **PII 脱敏** | 正则检测 + 脱敏替换 | 手机号、地址、身份证号等在回复中自动脱敏 |
| **承诺合规检查** | 关键词 + LLM 二次校验 | 检测"保证退全款"等未授权承诺，替换为合规表述 |
| **事实校验** | 与工具调用结果比对 | 确保回复中的价格、库存等信息与实际查询结果一致 |

**Guardrail 触发时**：

- 拦截的消息通过 `EventBus.publish('guardrail:blocked', details)` 广播
- AlertSubscriber 记录并按规则触发告警
- 被拦截的回复替换为安全的兜底话术（如"抱歉，我无法处理该请求，已为您转接人工客服"）

```typescript
interface GuardrailResult {
  passed: boolean;
  blockedBy?: 'input' | 'execution' | 'output';
  reason?: string;
  sanitizedContent?: string;          // 脱敏/修正后的安全内容
}
```


---

---
