# Developer Specification (PROJECT_SPEC)

> 版本：3.1 — 电商客服 Agent 用户特征画像系统深度技术规范

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 核心特点](#2-核心特点)
  - [2.1 用户特征画像引擎](#21-用户特征画像引擎)（含领域实体、维度 Plugin、冷启动策略、构建流程）
  - [2.2 轻量模型推理](#22-轻量模型推理--sftgrpo-微调-8b-替代-72b)（含 SFT/GRPO 全流程、评测、对话呈现）
  - [2.3 会话记忆与上下文管理](#23-会话记忆与上下文管理)（画像 Store + 滑动窗口）
  - [2.4 EventBus + Subscriber 运行时解耦](#24-eventbus--subscriber-运行时解耦)（含事件分级、错误隔离）
  - [2.5 数据飞轮](#25-数据飞轮--analyzemeasureimprove-闭环)（Trace 采集 → 评估器 → 根因归因 → 旋钮调优）
  - [2.6 Agent Workflow 路由](#26-agent-workflow-路由)（声明式图结构）
  - [2.7 Agent Guardrails 安全护栏](#27-agent-guardrails-安全护栏)（输入/执行/输出三层防护）
- [3. 技术选型](#3-技术选型)
- [4. 测试与评估方案](#4-测试与评估方案)（含在线评估指标、SLO、LLM-as-Judge）
- [5. 系统架构与模块设计](#5-系统架构与模块设计)（含 DI、错误处理、可观测性、配置管理、容量规划）
- [6. 项目排期](#6-项目排期)（纵向切片 MVP 交付）
- [7. 可扩展性与未来展望](#7-可扩展性与未来展望)

---

## 1. 项目概述

本项目是一个 **电商客服智能 Agent 系统**，核心能力是根据用户历史下单记录构建实时用户特征画像，服务于电商客服与用户的多轮对话场景。系统不是简单的检索+回复 pipeline，而是一个具备画像推理、冲突仲裁、分层记忆、可观测运维的完整智能客服平台，包含以下核心能力：

- **用户特征画像引擎**：基于历史订单数据实时构建多维用户画像（消费能力、品类偏好、规格偏好、价格敏感度、购买周期等），为客服对话提供精准上下文。
- **轻量模型推理（SFT/GRPO 微调 8B）**：通过 SFT/GRPO 微调 Qwen 8B 模型替代 72B，在商品默选规格等画像推理任务上保持效果持平，推理耗时缩减 83%。系统预留标准模型槽位，支持热切换。
- **画像冲突仲裁机制**：针对多轮对话中用户偏好信息冲突问题（如"喜欢红色"后又说"不要红色"），引入置信度打分+时间衰减仲裁机制，解决长对话震荡问题。
- **会话记忆与上下文管理**：画像 Store（Redis 持久化）+ 滑动窗口（最近 K 轮），简洁高效，避免过度工程。
- **EventBus + Subscriber 解耦**：运行时与监控采集完全解耦，支持会话回放、日志追踪、指标采集的可插拔扩展。
- **数据飞轮（BadCase-AutoPrompt）**：基于 badcase 自动识别 → prompt 优化 → A/B 验证的闭环迭代机制，持续提升推荐精确度。
- **Agent Workflow 路由**：基于意图识别的多场景工作流路由（商品咨询、售后、物流、投诉），声明式图结构定义，每个场景独立的工具集与策略。
- **Agent Guardrails 安全护栏**：输入注入检测、执行权限校验、输出 PII 脱敏与合规检查三层防护，生产必备。

### 设计理念

| 原则 | 说明 |
|------|------|
| **Profile-Centric** | 所有对话决策以用户画像为核心驱动，画像质量直接决定推荐精准度 |
| **Vertical Slice Delivery** | 每个迭代交付可运行的端到端功能切片，而非横向分层建设；先跑通业务闭环，再按需演进 |
| **Rich Domain Model** | 核心业务规则封装在领域实体中，Application 层纯编排不含业务逻辑 |
| **Event-Driven Architecture** | 运行与采集解耦的发布-订阅模型，事件分级（Critical/Normal/Low），模块间零耦合 |
| **Plugin-Oriented Extension** | 画像维度、对话场景通过 Plugin 注册扩展，新增能力无需修改现有代码，符合开闭原则（OCP） |
| **Declarative Workflow Graph** | 多场景对话通过声明式图结构路由（节点+条件边），状态转换可视化、支持回溯和人工介入 |
| **Model-Agnostic Slot** | 标准模型槽位接口，支持 72B→8B 热切换，不侵入业务逻辑 |
| **Safety-First Guardrails** | 输入/执行/输出三层安全护栏，防注入、防幻觉承诺、防 PII 泄露，生产上线的前置条件 |
| **Data Flywheel** | BadCase 驱动的自动优化闭环，含 Human-in-the-Loop 审核，系统越用越准 |

---

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

系统采用**画像 Store + 滑动窗口**的简洁记忆架构。用户画像是结构化确定性数据，始终通过 `summarizeForPrompt()` 注入 System Prompt，不需要复杂的分层记忆检索。

- **画像 Store**：Redis（RedisJSON）+ JSON 文件落盘，跨会话持久
- **滑动窗口**：最近 K 轮对话（默认 K=10），FIFO 淘汰，超出直接丢弃
- **会话持久化**：SessionManager + JSONL append-only 写入，支持重建

Prompt 拼接使用 TypeScript 模板字面量（画像摘要 + 场景指令 + Guardrails 约束 + 滑动窗口消息）。

### 2.4 EventBus + Subscriber 运行时解耦

所有核心行为通过 `InMemoryEventBus<AgentEvent>` 发布-订阅，实现运行时与监控采集的完全解耦。事件按 Critical/Normal/Low 三级分发，每个 Subscriber 运行在独立错误边界内。

**六大 Subscriber**：SessionLogSubscriber（JSONL 日志）、MetricsSubscriber（推理延迟/降级率）、AlertSubscriber（连续降级告警）、AutoPromptSubscriber（飞轮触发）、ConfigWatchSubscriber（配置审计+回滚）、ReplaySubscriber（会话回放，预留）。

新增 Subscriber 只需实现 `EventSubscriber` 接口并调用 `registry.register()`。

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
| 其他 Workflow | 售后/物流/投诉（骨架实现） | 见 `application/workflow/*.ts` |

### 2.7 Agent Guardrails 安全护栏

电商客服 Agent 实现**输入/执行/输出三层防护**：

| 层 | 防护项 | 方法 |
|----|--------|------|
| 输入 | Prompt 注入检测 | 中英文正则模式匹配 |
| 输入 | 敏感词过滤 | 可配置关键词库 |
| 输入 | 用户身份绑定 | Session 校验 |
| 执行 | 工具调用权限 | Workflow 白名单 |
| 执行 | 金额/频率限制 | 阈值校验 |
| 输出 | PII 脱敏 | 手机号/身份证/银行卡正则替换 |
| 输出 | 承诺合规检查 | "保证退全款"等未授权承诺拦截 |

触发时通过 `EventBus.publish('guardrail:blocked')` 广播，AlertSubscriber 记录告警。

## 3. 技术选型

### 3.1 核心语言与运行时

| 技术 | 选型 | 版本 | 选型理由 |
|------|------|------|---------|
| 语言 | TypeScript | 5.7+ | 强类型保障画像数据模型的正确性、优秀的 IDE 支持 |
| 运行时 | Node.js | ≥ v18 | 异步 IO 模型适合事件驱动 + 多路推理并发 |
| HTTP 框架 | Fastify | ≥ 5.0 | 原生 TypeScript 支持、Schema-based validation（配合 Zod）、性能是 Express 2-3x、插件体系成熟 |
| 编译目标 | ES2022 | - | 支持 top-level await、class fields |
| 模块系统 | ESM | - | 面向未来的模块标准，更好的 tree-shaking |
| 严格模式 | `strict: true` | - | 启用全量 TS 严格检查 |

### 3.2 LLM / 推理服务集成

| 技术 | 选型 | 版本 | 选型理由 |
|------|------|------|---------|
| 对话模型 | Qwen-72B / Qwen-8B-SFT | - | 72B 作为 fallback + prompt 优化；8B-SFT 作为主推理模型 |
| 推理协议 | OpenAI-Compatible API | v1 | `/v1/chat/completions` 兼容格式，适配 vLLM / TGI / Ollama |
| 模型服务 | vLLM | ≥ 0.4 | 高性能推理引擎，支持 continuous batching，适合 8B 模型部署 |
| SDK | openai (npm) | ≥ 4.0 | 官方 OpenAI 兼容 SDK，支持 OpenAI API 兼容端点 |
| 微调框架 | LLaMA-Factory | - | SFT + GRPO 训练，导出 vLLM 可加载的权重（离线环节，不在运行时） |

**模型部署架构**：

```
┌────────────────────────────────────────────┐
│  Model Deployment (运维侧)                  │
│                                              │
│  vLLM Server (GPU)                          │
│  ├── Qwen-8B-SFT   @ :8001 (主推理)        │
│  ├── Qwen-72B       @ :8002 (fallback/优化) │
│  └── Health Check   @ :8003/health          │
│                                              │
│  微调产物路径：                               │
│  $MODEL_DIR/qwen-8b-sft-spec-v{N}/         │
│    ├── config.json                          │
│    ├── tokenizer.json                       │
│    └── model-*.safetensors                  │
└────────────────────────────────────────────┘
```

### 3.3 数据存储

| 技术 | 选型 | 用途 | 选型理由 |
|------|------|------|---------|
| 缓存 | Redis（含 RedisJSON 模块） | L1 画像缓存、推理结果缓存、会话状态 | 低延迟读写，支持 TTL 自动淘汰 |
| 事件流 | Redis Streams | 事件持久化、未来分布式消费者组预留 | 天然支持消费者组，为分布式 Subscriber 铺路 |
| 持久化 | JSON / JSONL 文件 | 会话日志、画像归档、BadCase 记录 | 简单可靠，append-only 天然防丢失 |
| 订单数据 | 外部 API / MySQL | 历史订单查询 | 通过 OrderService 适配器接入，不直连 |
| 商品数据 | 外部 API / Elasticsearch | 商品信息查询 | 通过 ProductService 适配器接入 |

**Redis 使用精细化**：

| 数据 | Redis 类型 | Key 设计 | 说明 |
|------|-----------|---------|------|
| 用户画像 | RedisJSON | `profile:{userId}` | 支持 JSONPath 级别的部分更新（`JSON.SET key $.spending.avgOrderAmount`），避免全量序列化 |
| 推理结果缓存 | String | `inference:{userId}:{productId}:{profileVersion}` | 关联 profileVersion，画像更新后缓存自动失效 |
| 模型健康状态 | String | `model_health:{slotId}` TTL=60s | 短 TTL 自动过期 |
| 会话状态 | Hash | `session:{sessionId}` TTL=7200s | 会话元数据（非完整消息） |
| 事件流 | Stream | `events:{eventType}` | 预留分布式消费，当前仅作为持久化 backup |

### 3.4 核心依赖

| 技术 | 选型 | 版本 | 用途 |
|------|------|------|------|
| **运行时** | | | |
| openai | npm | ≥ 4.0 | OpenAI-compatible API 调用 |
| fastify | npm | ≥ 5.0 | HTTP 服务框架 |
| fastify-type-provider-zod | npm | latest | Fastify + Zod 类型集成 |
| ioredis | npm | ≥ 5.0 | Redis 客户端 |
| zod | npm | ≥ 3.22 | 画像数据模型运行时校验 |
| uuid | npm | ≥ 9.0 | 唯一标识生成（sessionId, traceId） |
| dotenv | npm | ≥ 16.0 | 环境变量管理 |
| commander | npm | ≥ 12.0 | CLI 工具框架 |
| **架构基础设施** | | | |
| neverthrow | npm | ≥ 8.0 | Result<T, E> 模式，替代 throw/catch 的显式错误处理 |
| cockatiel | npm | ≥ 3.2 | 弹性策略库（断路器、重试、超时、限流、Bulkhead） |
| **可观测性** | | | |
| @opentelemetry/sdk-node | npm | ≥ 0.52 | OpenTelemetry Node.js SDK（统一 Metrics/Traces/Logs） |
| @opentelemetry/auto-instrumentations-node | npm | latest | 自动插桩（HTTP、Redis、LLM 调用） |
| @opentelemetry/exporter-prometheus | npm | latest | Prometheus 指标导出 |
| @opentelemetry/exporter-trace-otlp-http | npm | latest | OTLP Trace 导出（Jaeger/Zipkin） |
| **测试** | | | |
| vitest | npm | ≥ 1.0 | 测试框架 |

### 3.5 持久化策略

> **路径变量说明**：
> - `$DATA_DIR` = `$ECOM_AGENT_HOME` 环境变量 || `~/.ecom-agent/`
> - `$PROJECT_DIR` = `$CWD/.ecom-agent/`

| 数据类型 | 存储格式 | 存储路径 | 作用域 |
|---------|---------|---------|--------|
| 用户画像 | JSON | `$DATA_DIR/profiles/{userId}.json` | 全局 |
| 用户画像缓存 | RedisJSON | `profile:{userId}` （支持 JSONPath 部分更新）| 全局 |
| 会话日志 | JSONL (append-only) | `$DATA_DIR/sessions/{sessionId}.jsonl` | 全局 |
| 推理结果缓存 | Redis String | `inference:{userId}:{productId}:{profileVersion}` TTL=3600s | 全局 |
| Prompt 模板 | JSON (versioned) | `$PROJECT_DIR/prompts/prompt_{version}.json` | 项目级 |
| BadCase 记录 | JSONL (daily rolling) | `$DATA_DIR/badcases/{date}.jsonl` | 全局 |
| A/B 实验 | JSON | `$DATA_DIR/experiments/exp_{id}.json` | 全局 |
| AutoPrompt 日志 | JSONL | `$DATA_DIR/autoprompt/optimization_log.jsonl` | 全局 |
| 模型健康状态 | Redis String | `model_health:{slotId}` TTL=60s | 全局 |

---

## 4. 测试与评估方案

### 4.1 单元测试

| 测试模块 | 框架 | 覆盖范围 | 优先级 |
|---------|------|---------|--------|
| **画像领域实体** | Vitest | `UserProfileEntity.applyDelta()` / `resolveConflict()` / `decayConfidence()` / `summarizeForPrompt()` | P0 |
| **画像构建** | Vitest | `OrderAnalyzer` 聚合逻辑、`ProfileBuilder` 特征工程、`SpecScore` 计算 | P0 |
| **画像维度 Plugin** | Vitest | `ProfileDimensionPlugin` 注册/注销、Plugin `extract`/`update`/`arbitrate` 方法、品类过滤 | P0 |
| **冲突仲裁** | Vitest | `ConflictDetector` 冲突分类、置信度计算、时间衰减、震荡抑制 | P0 |
| **模型槽位** | Vitest + Mock | `ModelSlotManager` 注册/切换/健康检查/fallback、`ModelProvider` 重试逻辑 | P0 |
| **分层记忆** | Vitest | L3 窗口滑动、L3→L2 溢出事件、L2 摘要生成、L1 画像合并 | P0 |
| **EventBus** | Vitest | 事件分级分发、Request/Notification 模式、Subscriber 错误隔离、死信队列 | P0 |
| **Workflow 路由** | Vitest + Mock | `IntentRouter` 意图分类、Workflow 状态转换、跨 Workflow 上下文继承 | P0 |
| **Prompt Template Engine** | Vitest | SegmentCondition 评估、变量类型校验、缺失必填变量报错、条件渲染 | P1 |
| **冷启动策略** | Vitest | 四级冷启动阶段判定、群体画像 fallback、`coldStartStage` 转换 | P1 |
| **数据校验** | Vitest | Zod schema 验证 `UserProfile`、`SpecScore`、`ConflictResult` 等类型 | P1 |
| **Result 模式** | Vitest | `Result<T, E>` 链式调用、错误传播、与 cockatiel 弹性策略集成 | P1 |

### 4.2 集成测试

| 测试场景 | 框架 | 覆盖范围 | 优先级 |
|---------|------|---------|--------|
| **画像构建端到端** | Vitest + Mock API | 订单数据 → 画像生成 → 对话更新 → 冲突仲裁 → 持久化 | P0 |
| **冷启动 → 成熟画像** | Vitest | 模拟新用户从 L0（零画像）经过多轮对话 + 下单逐步升级到 L3（成熟画像） | P0 |
| **模型推理链路** | Vitest + Mock vLLM | 画像输入 → prompt 渲染 → 模型调用 → 结果解析 → 缓存写入 | P0 |
| **多轮对话冲突** | Vitest | 模拟 10 轮对话，包含 3 次冲突，验证仲裁结果和画像稳定性 | P0 |
| **Workflow 切换** | Vitest + Mock LLM | 模拟"商品咨询"→"物流查询"→"售后"的意图切换，验证上下文继承和工具集切换 | P0 |
| **会话持久化恢复** | Vitest | 写入 JSONL → 进程重启 → 重建会话 → 验证画像状态一致 | P1 |
| **数据飞轮流程** | Vitest + Mock LLM | BadCase 注入 → 聚类 → Prompt 生成 → 人工审核 mock → 离线评估 → 模拟 A/B | P1 |
| **DI 容器集成** | Vitest | 验证所有服务的依赖注入正确性，mock 替换不影响其他服务 | P1 |

### 4.3 性能测试

| 测试目标 | 方法 | 验收标准 |
|---------|------|---------|
| 8B 模型推理延迟 | 1000 次规格推理 benchmark | P50 < 150ms, P99 < 500ms |
| 画像构建耗时 | 1000 用户画像构建 | P50 < 50ms (纯 CPU) |
| 冲突仲裁耗时 | 10000 次仲裁计算 | P50 < 5ms |
| 上下文压缩耗时 | 200 轮对话压缩 | < 100ms (零 LLM 调用层) |
| Redis 画像读取 | 10000 次随机读 | P50 < 2ms |

### 4.4 回归测试

| 测试目标 | 方法 | 说明 |
|---------|------|------|
| 规格推荐准确率 | 标注数据集 (≥500 case) | 8B-SFT 准确率 ≥ 72B 基线的 95% |
| Prompt 优化效果 | A/B 实验离线回放 | 优化后 badcase 率下降 ≥ 10% |

### 4.5 在线评估指标（生产监控）

传统离线测试数据集反映的是构建者预期，无法覆盖真实用户的拼写错误、模糊表达、多语言输入等情况。系统定义**四维在线评估指标**：

| 维度 | 指标 | 采集方式 | 目标 |
|------|------|---------|------|
| **Quality** | 规格推荐首次接受率 | 用户行为埋点 | ≥ 70% |
| | 用户满意度（点赞/踩） | 对话末尾反馈 | ≥ 4.0/5.0 |
| | LLM-as-Judge 质量分 | 独立评估模型每日采样打分 | ≥ 0.8 |
| **Reliability** | 端到端延迟 P99 | OTel Tracing | ≤ 3s |
| | 模型降级率 | EventBus `model:fallback` | ≤ 2% |
| | 工具调用成功率 | EventBus `tool:result` | ≥ 98% |
| **Cost** | 每次对话平均 token 数 | OTel Metrics | 趋势监控 |
| | 每次成功推荐成本（GPU 时间） | 基础设施指标 | 趋势监控 |
| **Safety** | Guardrail 拦截率 | EventBus `guardrail:blocked` | 趋势监控 |
| | PII 暴露事件数 | 输出层检测 | = 0 |
| | 未授权承诺次数 | 输出层检测 | = 0 |

**LLM-as-Judge 评估**：使用独立的评估模型（如 72B）对每日采样的对话进行自动打分，评估 helpfulness / correctness / safety 三个维度，比人工标注更 scalable：

```
每日采样 100 条对话 → 评估模型逐条打分（0~1）→ 聚合为质量趋势 → 低于阈值触发告警
```

### 4.6 SLO 定义（Service Level Objectives）

| SLO | 目标值 | 测量周期 | 违反后果 |
|-----|--------|---------|---------|
| 规格推荐首次接受率 | ≥ 70% | 每周 | 触发飞轮分析 |
| 端到端对话延迟 P99 | ≤ 3s | 实时 | 告警 + 排查 |
| 模型可用性 | ≥ 99.5% | 每月 | fallback 到 72B |
| PII 泄露事件 | = 0 | 实时 | 立即停服排查 |
| Guardrail 误拦率 | ≤ 5% | 每周 | 调整规则阈值 |

---

## 5. 系统架构与模块设计

### 5.1 四层架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│  Presentation Layer (表现层 / API 层) — Fastify                      │
│  src/presentation/                                                   │
│  ├── api/                     → Fastify 路由 + Zod 请求校验          │
│  │   ├── conversation-handler.ts  → 对话入口：接收用户消息，           │
│  │   │                              路由到 IntentRouter → Workflow   │
│  │   ├── profile-handler.ts       → 画像查询 API：                   │
│  │   │                              GET /profile/{userId}           │
│  │   ├── admin-handler.ts         → 运维 API：模型切换、画像锚定、    │
│  │   │                              实验管理、配置热更新             │
│  │   ├── review-handler.ts        → Prompt 审核 API：审核队列管理    │
│  │   └── metrics-handler.ts       → 指标暴露：GET /metrics (OTel)   │
│  └── cli/                                                            │
│      ├── agent-cli.ts             → CLI 工具：手动画像查询、会话回放  │
│      └── model-cli.ts             → 模型管理 CLI：切换、健康检查      │
├─────────────────────────────────────────────────────────────────────┤
│  Application Layer (应用层) — 纯编排，不含业务规则                     │
│  src/application/                                                    │
│  ├── agent.ts                → Agent 核心：Workflow 调度、上下文构建  │
│  ├── tools.ts                → Tool Schema 定义（按 Workflow 分组）  │
│  ├── workflow/               → Workflow 路由与场景实现                │
│  │   ├── intent-router.ts         → 意图路由器（LLM + 规则双模式）  │
│  │   ├── product-consult.ts       → 商品咨询 Workflow               │
│  │   ├── after-sale.ts            → 售后 Workflow                   │
│  │   ├── logistics.ts             → 物流查询 Workflow               │
│  │   ├── complaint.ts             → 投诉处理 Workflow               │
│  │   └── workflow-registry.ts     → Workflow 注册中心               │
│  ├── services/                                                       │
│  │   ├── profile-engine/                                             │
│  │   │   ├── order-analyzer.ts        → 历史订单统计聚合             │
│  │   │   ├── profile-builder.ts       → 特征工程，画像构建           │
│  │   │   ├── conversation-updater.ts  → 对话中实时画像更新           │
│  │   │   ├── spec-inference.ts        → 规格推理（覆盖率匹配+模型）  │
│  │   │   ├── cold-start-manager.ts    → 冷启动策略管理              │
│  │   │   └── dimension-registry.ts    → 画像维度 Plugin 注册中心    │
│  │   ├── model-slot/                                                 │
│  │   │   ├── model-slot-manager.ts    → 模型槽位管理（注册/切换/路由）│
│  │   │   ├── model-provider.ts        → 模型提供者（HTTP + cockatiel │
│  │   │   │                              断路器/重试/超时）           │
│  │   │   ├── inference-cache.ts       → 推理结果缓存（Redis）        │
│  │   │   ├── ab-router.ts            → A/B 流量路由                  │
│  │   │   └── prompt-builder.ts          → Prompt 拼接（TS 模板字面量）│
│  │   ├── memory/                                                     │
│  │   │   ├── preference-memory.ts     → L1 用户偏好记忆（RedisJSON） │
│  │   │   ├── session-memory.ts        → L2 完整会话记忆             │
│  │   │   ├── window-memory.ts         → L3 滑动窗口记忆             │
│  │   │   └── context-builder.ts       → LLM 上下文构建（滑动窗口）   │
│  │   ├── data-flywheel/                                              │
│  │   │   ├── badcase-collector.ts     → BadCase 收集器              │
│  │   │   ├── badcase-analyzer.ts      → BadCase 聚类（规则+Embedding│
│  │   │   │                              语义聚类）                   │
│  │   │   ├── prompt-optimizer.ts      → Prompt 自动优化生成         │
│  │   │   ├── prompt-review-queue.ts   → Prompt 人工审核队列          │
│  │   │   ├── offline-evaluator.ts     → 离线评估                    │
│  │   │   └── ab-experiment.ts         → A/B 实验管理（含统计检验）   │
│  │   ├── session-manager.ts           → 会话管理                    │
│  │   └── profile-store.ts            → 画像持久化                    │
│  └── subscribers/                                                    │
│      ├── index.ts                     → Subscriber 注册入口         │
│      ├── session-log-subscriber.ts    → 会话日志持久化 (Normal)     │
│      ├── metrics-subscriber.ts        → OTel 指标采集 (Normal)      │
│      ├── tracing-subscriber.ts        → OTel 链路追踪 (Normal)      │
│      ├── replay-subscriber.ts         → 会话回放 (Low)              │
│      ├── alert-subscriber.ts          → 异常告警 (Critical)         │
│      ├── auto-prompt-subscriber.ts    → 数据飞轮触发 (Low)          │
│      └── config-watch-subscriber.ts   → 配置热更新推送 (Normal)     │
├─────────────────────────────────────────────────────────────────────┤
│  Domain Layer (领域层) — 核心业务规则                                  │
│  src/domain/                                                         │
│  ├── entities/               → 领域实体（充血模型，含行为方法）       │
│  │   └── user-profile.entity.ts  → UserProfileEntity                │
│  │       ├── applyDelta()         → 画像增量合并                    │
│  │       ├── resolveConflict()    → 冲突仲裁算法                    │
│  │       ├── decayConfidence()    → 时间衰减                        │
│  │       └── summarizeForPrompt() → LLM 摘要生成                    │
│  ├── services/               → 领域服务（跨实体的业务规则）          │
│  │   └── conflict-arbitration.service.ts                             │
│  │       ├── 加权置信度仲裁算法                                      │
│  │       ├── 震荡抑制（窗口冷却 + 回弹检测）                         │
│  │       └── 人工介入阈值判定                                        │
│  ├── types.ts                → 全局类型定义                          │
│  │   ├── CategoryScore, SpecScore, DimensionData  → 画像核心类型    │
│  │   ├── ConflictResult, Evidence                 → 冲突仲裁类型    │
│  │   ├── ModelSlot, ModelProvider, ModelConfig     → 模型槽位类型    │
│  │   ├── Message, AgentSession, WorkflowContext    → 会话/Workflow   │
│  │   ├── BadCase, PromptVersion, ABExperiment     → 数据飞轮类型    │
│  │   ├── PromptSegment, SegmentCondition          → Prompt 模板类型 │
│  │   ├── ProfileDimensionPlugin                   → 画像维度插件    │
│  │   └── MemoryLayer, SessionSummaryBlock         → 记忆层类型      │
│  ├── event-bus.ts            → 事件总线                              │
│  │   ├── AgentEvent (22 种联合类型 + 事件分级)                       │
│  │   ├── InMemoryEventBus<T> (Request + Notification 双模式)        │
│  │   ├── EventSubscriber 接口（含 priority + onError）              │
│  │   └── EventBusRegistry + 错误隔离策略                             │
│  ├── errors.ts               → 领域错误层级                          │
│  │   ├── DomainError (业务错误基类)                                  │
│  │   ├── ProfileConflictError, ColdStartError     → 画像领域错误    │
│  │   ├── InferenceError, ModelHealthError         → 推理领域错误    │
│  │   └── WorkflowTransitionError                  → Workflow 错误   │
│  ├── schemas/                → Zod 运行时校验 Schema                 │
│  │   ├── profile.schema.ts   → UserProfile Zod 校验                 │
│  │   ├── conflict.schema.ts  → ConflictResult Zod 校验              │
│  │   ├── inference.schema.ts → SpecRecommendation Zod 校验          │
│  │   └── prompt.schema.ts    → PromptSegment Zod 校验               │
│  └── constants.ts            → 业务常量（运行时可热更新）             │
│      ├── 仲裁权重（SOURCE_WEIGHTS, DECAY_LAMBDA, OVERRIDE_THRESHOLD）│
│      ├── 记忆层参数（L3_WINDOW_SIZE=10, L2_MAX_ROUNDS=200）         │
│      ├── 冷启动阈值（COLD_THRESHOLD=0.3, WARM_THRESHOLD=0.7）       │
│      └── BadCase 信号权重                                            │
├─────────────────────────────────────────────────────────────────────┤
│  Infrastructure Layer (基础设施层)                                    │
│  src/infra/                                                          │
│  ├── config.ts               → 分层配置中心                          │
│  │   ├── 路径常量：DATA_DIR, PROJECT_DIR, SESSIONS_DIR, PROFILES_DIR│
│  │   ├── 模型配置：MODEL_SLOTS, DEFAULT_SLOT_CONFIG                 │
│  │   ├── Redis 配置：REDIS_URL, CACHE_TTL                           │
│  │   ├── 业务参数：AB_TRAFFIC_RATIO, BADCASE_BATCH_SIZE             │
│  │   └── RuntimeConfigStore：运行时可热更新的参数层                  │
│  ├── di/                     → 依赖注入配置                          │
│  │   └── container.ts        → 手动 Composition Root（无框架）     │
│  ├── observability/          → 可观测性基础设施                       │
│  │   ├── otel-setup.ts       → OpenTelemetry SDK 初始化              │
│  │   ├── tracer.ts           → Tracer 工厂（OTel Tracing API）      │
│  │   └── meter.ts            → Meter 工厂（OTel Metrics API）       │
│  └── adapters/                                                       │
│      ├── llm.ts              → OpenAI-compatible 客户端              │
│      ├── redis.ts            → Redis 客户端（ioredis + RedisJSON）   │
│      ├── order-service.ts    → 外部订单服务适配器                    │
│      ├── product-service.ts  → 外部商品服务适配器                    │
│      ├── file-system.ts      → 文件操作（路径安全校验）              │
│      ├── compression.ts      → 上下文压缩策略                        │
│      └── logger.ts           → 结构化日志（接入 OTel Logs API）      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 核心数据流

#### 对话主循环（`Agent.conversationLoop()`）

```
┌────────────────────────────────────────────────────────────┐
│ 用户消息到达                                                 │
│                                                              │
│ 1. EventBus.publish('message:user', msg)                    │
│                                                              │
│ 2. L3-Window.append(msg)                                    │
│    → L3 溢出？→ EventBus.publish('memory:l3_overflow')      │
│    → (L2/L1 通过事件订阅自动响应，见 2.4 层间协议)           │
│                                                              │
│ 3. ConversationProfileUpdater.extract(msg)                  │
│    → 从消息中提取偏好信号 → ProfileDelta                     │
│                                                              │
│ 4. UserProfileEntity.applyDelta(delta)                      │
│    → 冲突检测 → 仲裁（领域实体内部逻辑）                     │
│    → EventBus.publish('profile:updated' | 'conflict_*')     │
│                                                              │
│ 5. IntentRouter.classify(msg, context)                      │
│    → 意图识别 → 路由到对应 Workflow                          │
│    → 意图切换？→ currentWorkflow.onExit() → newWorkflow.onEnter()
│                                                              │
│ 6. 构建 System Prompt（TypeScript 模板字面量）               │
│    → 画像摘要 + 场景指令 + Guardrails 约束 + 滑动窗口上下文 │
│                                                              │
│ 7. currentWorkflow.onMessage(msg, workflowContext)          │
│    → Workflow 状态机执行 → 调用 ModelSlotManager.infer()     │
│    → 回复中包含商品推荐？                                    │
│      → SpecInferenceEngine.infer(profile, product)          │
│      → 覆盖率匹配优先，fallback 到模型推理                   │
│      → 注入推荐规格到回复                                    │
│                                                              │
│ 8. EventBus.publish('message:assistant', response)          │
│                                                              │
│ 9. BadCaseCollector.evaluate(msg, response, profile)        │
│    → 冷启动阶段跳过（样本质量不够）                          │
│    → 疑似 badcase？→ EventBus.publish('badcase:detected')   │
│                                                              │
│ 10. 返回客服回复给用户                                       │
└────────────────────────────────────────────────────────────┘
```

#### 数据飞轮循环（`AutoPromptPipeline.run()`）

```
┌──────────────────────────────────────────────────────┐
│  触发条件：BadCase 池累积 ≥ BADCASE_BATCH_SIZE (50)   │
│                                                        │
│  1. BadCaseAnalyzer.cluster(badcases)                 │
│     → 规则分组 + Embedding 语义聚类                     │
│                                                        │
│  2. PromptOptimizer.analyze(clusters)                 │
│     → 定位 prompt 缺陷                                  │
│     → 调用 72B 生成 ≤3 个候选 prompt                    │
│                                                        │
│  3. PromptReviewQueue.submit(candidates)              │
│     → 候选进入人工审核队列                               │
│     → 审核通过后继续                                     │
│                                                        │
│  4. OfflineEvaluator.evaluate(approved, testset)      │
│     → 历史数据集回归测试                                │
│     → 选出最优候选                                      │
│                                                        │
│  5. ABExperiment.create(winner, baselinePrompt)       │
│     → 灰度 10% 流量，最小样本量 ≥1000                   │
│     → 统计检验（Z-test / 贝叶斯 AB）                    │
│                                                        │
│  6. ABExperiment.evaluate()                           │
│     → 统计显著优于基线 → 全量切换                        │
│     → 不显著/劣于基线 → 回滚/延长实验                    │
│                                                        │
│  7. EventBus.publish('badcase:prompt_optimized')      │
└──────────────────────────────────────────────────────┘
```

### 5.3 模块依赖关系

```
                    ┌────────────────────────────┐
                    │   domain/ (零外部依赖)       │
                    │   ├── entities/             │ ← 领域实体（充血模型）
                    │   │   └── UserProfileEntity │
                    │   ├── services/             │ ← 领域服务
                    │   │   └── ConflictArbitration│
                    │   ├── types.ts              │ ← 纯类型定义
                    │   ├── event-bus.ts          │ ← 零外部依赖
                    │   ├── errors.ts             │ ← 错误层级
                    │   ├── schemas/              │ ← 仅依赖 zod
                    │   └── constants.ts          │ ← 零依赖
                    └──────────┬─────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌────────────┐  ┌──────────────┐  ┌──────────────────┐
       │ infra/     │  │ infra/       │  │ application/     │
       │ config.ts  │  │ adapters/    │  │ workflow/        │
       │ di/        │  │   llm.ts     │  │   intent-router  │
       │  container │  │   redis.ts   │  │   product-consult│
       │ observ-    │  │   order-svc  │  │   after-sale     │
       │  ability/  │  │   product-svc│  │ services/        │
       │  otel-setup│  │   fs.ts      │  │   profile-engine/│
       │  tracer.ts │  │   compress   │  │   model-slot/    │
       │  meter.ts  │  │   logger     │  │   memory/        │
       │            │  │              │  │   data-flywheel/ │
       │            │  │              │  │ subscribers/     │
       └────────────┘  └──────────────┘  └────────┬─────────┘
                                                  │
                                        ┌─────────┴─────────┐
                                        ▼                   ▼
                                 ┌────────────┐      ┌──────────┐
                                 │presentation│      │  cli/    │
                                 │ Fastify API│      │ agent-cli│
                                 │ handlers   │      │ model-cli│
                                 └────────────┘      └──────────┘

依赖规则：
  domain/ → 不依赖任何其他层（仅依赖 zod）
  infra/  → 仅依赖 domain/（类型 + 接口）
  application/ → 依赖 domain/ + infra/
  presentation/ → 依赖 application/（通过 DI 容器注入）
```

### 5.4 依赖注入与组装

系统采用**手动 Composition Root** 模式（无框架），在入口文件统一组装所有依赖。对于本项目的规模（~20 个服务类），手动组装完全可控且零额外依赖，避免了 tsyringe 等装饰器库在 ESM + strict 模式下的兼容性问题。

**Composition Root**（`src/main.ts`）：

```typescript
// src/main.ts — 手动组装所有依赖
const config = loadConfig();
const redis = createRedisClient(config.redis);
const eventBus = new InMemoryEventBus();

const profileStore = new ProfileStore(redis);
const dimensionRegistry = new ProfileDimensionRegistry();
const modelSlotManager = new ModelSlotManager(config.models, eventBus);
const intentRouter = new IntentRouter(modelSlotManager);
const sessionManager = new SessionManager(config.dataDir);

const agent = new Agent({
  profileStore, dimensionRegistry, modelSlotManager,
  intentRouter, sessionManager, eventBus,
});

// 注册 Subscribers
eventBus.register(new SessionLogSubscriber(config.dataDir));
eventBus.register(new MetricsSubscriber());
eventBus.register(new AlertSubscriber(config.alert));

// 启动 Fastify
const server = buildServer(agent, profileStore, config);
server.listen({ port: config.port });
```

**设计原则**：
- 所有服务通过构造函数注入依赖，不使用全局单例或 Service Locator
- 测试时直接在测试文件中 `new Service(mockDep)` 替换依赖，无需框架
- 组装逻辑集中在一个文件，依赖关系一目了然

### 5.5 错误处理架构

系统定义统一的**错误层级**（Error Hierarchy），并采用 `Result<T, E>` 模式替代 throw/catch 的隐式控制流。

**错误层级**：

```typescript
abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly isRetryable: boolean;
}

class ProfileConflictError extends DomainError { code = 'PROFILE_CONFLICT'; isRetryable = false; }
class ColdStartError extends DomainError { code = 'COLD_START'; isRetryable = false; }
class InferenceError extends DomainError { code = 'INFERENCE_FAILED'; isRetryable = true; }
class ModelHealthError extends DomainError { code = 'MODEL_UNHEALTHY'; isRetryable = true; }
class WorkflowTransitionError extends DomainError { code = 'WORKFLOW_TRANSITION'; isRetryable = false; }

class InfrastructureError extends Error {
  constructor(readonly cause: Error, readonly service: string) { super(); }
}
```

**Result 模式**（基于 neverthrow）：

```typescript
type InferenceResult = Result<SpecRecommendation, InferenceError>;
type ProfileUpdateResult = Result<void, ProfileConflictError>;

const result = await specInference.infer(profile, product);
result.match(
  (recommendation) => { /* 成功处理 */ },
  (error) => { /* 错误处理，类型安全 */ }
);
```

**弹性策略**（基于 cockatiel）：

| 策略 | 应用场景 | 配置 |
|------|---------|------|
| **重试** | LLM 调用、Redis 操作 | 指数退避，max 3 次，初始 200ms |
| **断路器** | 模型推理端点 | 失败率 > 50% 开启，冷却 30s |
| **超时** | 所有外部调用 | LLM: 10s, Redis: 2s, 外部 API: 5s |
| **Bulkhead** | 并发推理请求 | 最大并发 10，队列 50 |
| **Fallback** | 模型推理 | 8B 失败 → 72B → 规则引擎兜底 |

### 5.6 配置管理架构

系统采用**分层配置**设计，支持运行时热更新业务参数，无需重启服务。

**配置分层**（优先级从低到高）：

```
┌──────────────────────────────────────────────┐
│  Layer 4: Experiment Override (A/B 实验参数)   │ ← 最高优先级
│  → 实验期间临时覆盖，实验结束自动清除          │
├──────────────────────────────────────────────┤
│  Layer 3: Runtime Override (运行时热更新)      │
│  → 通过 Admin API 修改，存储在 Redis          │
│  → EventBus.publish('config:updated') 通知    │
├──────────────────────────────────────────────┤
│  Layer 2: Config File (应用默认值)            │
│  → $PROJECT_DIR/config.json                   │
│  → 部署时确定，进程启动时加载                  │
├──────────────────────────────────────────────┤
│  Layer 1: Environment Variables (部署环境)     │ ← 最低优先级
│  → .env / 容器环境变量                         │
│  → 仅存放基础设施地址、密钥等部署相关配置       │
└──────────────────────────────────────────────┘
```

**可热更新的参数**：

| 参数 | 默认值 | 热更新 | 说明 |
|------|--------|--------|------|
| `SLIDING_WINDOW_SIZE` | 10 | 支持 | 对话滑动窗口大小 |
| `BADCASE_BATCH_SIZE` | 50 | 支持 | 飞轮触发批次 |
| `AB_TRAFFIC_RATIO` | 0.1 | 支持 | A/B 灰度比例 |
| `MIN_RECOMMEND_CONFIDENCE` | 0.5 | 支持 | 推荐最低置信度阈值 |
| `FEATURE_PRIORITY` | `[height,weight,bust,waistline,footLength]` | 支持 | 覆盖率匹配特征优先级 |
| `REDIS_URL` | - | 不支持 | 需重启 |
| `LLM_BASE_URL` / `LLM_MODEL_ID` | - | 不支持 | 需重启（通过模型热切换替代） |

配置变更通过 `ConfigWatchSubscriber` 推送到相关模块，模块自行响应更新。

---

## 6. 项目排期（纵向切片 MVP 交付）

> 采用**纵向切片**（Vertical Slice）交付模式：每个阶段交付可运行的端到端功能，而非横向分层建设。
> 原则：**先跑通业务闭环，再按需演进**。
> **状态说明**：✅ 已完成 | 🔧 需优化 | 📋 待实现

### MVP-1：最小可运行对话（周 1-2）

> **交付物**：一个可 demo 的端到端对话，用户输入商品 → 返回规格推荐。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| M1-1 | 项目初始化、TypeScript 配置、ESM 模块、依赖管理（fastify, neverthrow, cockatiel, @opentelemetry/*） | ✅ | `package.json`, `tsconfig.json` |
| M1-2 | Domain 层核心类型定义（UserProfile, SpecScore, ModelSlot, WorkflowType 等） | ✅ | `domain/types.ts` |
| M1-3 | UserProfileEntity 领域实体（applyDelta, summarizeForPrompt，**不含**冲突仲裁） | ✅ | `domain/entities/user-profile.entity.ts` |
| M1-4 | 硬编码覆盖率匹配算法（用户画像 × 商品画像 → 最优规格） | ✅ | `services/profile-engine/spec-inference.ts` |
| M1-5 | 简单 CLI 对话循环（stdin/stdout，单模型调用，滑动窗口 K=10） | ✅ | `presentation/cli/agent-cli.ts` |
| M1-6 | OpenAI-compatible LLM 客户端封装 | ✅ | `infra/adapters/llm.ts` |
| M1-7 | 基本 EventBus（发布-订阅，无分级，仅日志 Subscriber） | ✅ | `domain/event-bus.ts` |

### MVP-2：真实画像驱动推荐（周 3-4）

> **交付物**：真实订单数据构建画像，Redis 持久化，推荐准确率可量化。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| M2-1 | Redis 客户端封装（ioredis + RedisJSON） | ✅ | `infra/adapters/redis.ts` |
| M2-2 | 订单服务适配器（外部 API mock + 接口定义） | ✅ | `infra/adapters/order-service.ts` |
| M2-3 | 商品服务适配器（外部 API mock + 接口定义） | ✅ | `infra/adapters/product-service.ts` |
| M2-4 | OrderAnalyzer + ProfileBuilder（订单 → 画像构建） | ✅ | `services/profile-engine/order-analyzer.ts` |
| M2-5 | ProfileDimensionRegistry + 内置维度 Plugin | ✅ | `services/profile-engine/dimension-registry.ts` |
| M2-6 | ProfileStore（RedisJSON 部分更新 + JSON 文件落盘） | ✅ | `services/profile-store.ts` |
| M2-7 | ColdStartManager（四级冷启动策略） | ✅ | `services/profile-engine/cold-start-manager.ts` |
| M2-8 | 画像构建单元测试 + 集成测试 | ✅ | `tests/profile-engine.test.ts` |

### MVP-3：模型槽位 + Workflow 路由（周 5-6）

> **交付物**：多模型热切换、多场景 Workflow 路由、A/B 路由能力。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| M3-1 | ModelProvider（HTTP + cockatiel 断路器/重试/超时） | ✅ | `services/model-slot/model-provider.ts` |
| M3-2 | ModelSlotManager（注册/注销/热切换/fallback） | ✅ | `services/model-slot/model-slot-manager.ts` |
| M3-3 | InferenceCache（Redis 缓存） | ✅ | `services/model-slot/inference-cache.ts` |
| M3-4 | ABRouter（确定性 hash 分桶） | ✅ | `services/model-slot/ab-router.ts` |
| M3-5 | IntentRouter（规则 + LLM 双模式） | ✅ | `application/workflow/intent-router.ts` |
| M3-6 | WorkflowGraph 声明式图引擎 | ✅ | `application/workflow/workflow-graph.ts` |
| M3-7 | ProductConsultWorkflow | ✅ | `application/workflow/product-consult.ts` |
| M3-8 | Agent 主循环（Workflow 调度） | ✅ | `application/agent.ts` |
| M3-9 | 模型槽位 + Workflow 测试 | ✅ | `tests/model-slot.test.ts`, `tests/workflow.test.ts` |

### Phase 4：安全护栏 + API 层（周 7-8）

> **交付物**：HTTP API 可用，安全护栏上线，可进入灰度测试。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P4-1 | Guardrails 输入层（注入检测 + 敏感词 + 身份绑定） | ✅ | `application/guardrails/input-guard.ts` |
| P4-2 | Guardrails 执行层（工具权限白名单 + 金额/频率限制） | ✅ | `application/guardrails/execution-guard.ts` |
| P4-3 | Guardrails 输出层（PII 脱敏 + 承诺合规） | ✅ | `application/guardrails/output-guard.ts` |
| P4-4 | Fastify 服务初始化 | ✅ | `presentation/server.ts` |
| P4-5 | ConversationHandler（对话 API + Guardrails 集成） | ✅ | `presentation/api/conversation-handler.ts` |
| P4-6 | ProfileHandler + AdminHandler | ✅ | `presentation/api/*.ts` |
| P4-7 | API 集成测试 | ✅ | `tests/presentation/api.test.ts` |

### Phase 5：EventBus 加固 + Subscriber 体系（周 9-10）

> **交付物**：完整的事件分级、可观测性、告警能力。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P5-1 | EventBus 事件分级（Critical/Normal/Low）+ 错误隔离 + 死信队列 | ✅ | `domain/event-bus.ts` |
| P5-2 | SessionLogSubscriber（JSONL 持久化） | ✅ | `subscribers/session-log-subscriber.ts` |
| P5-3 | MetricsSubscriber（推理延迟/降级率/拦截率） | ✅ | `subscribers/metrics-subscriber.ts` |
| P5-4 | AlertSubscriber（连续降级告警） | ✅ | `subscribers/alert-subscriber.ts` |
| P5-5 | ConfigWatchSubscriber（配置热更新） | ✅ | `subscribers/config-watch-subscriber.ts` |
| P5-6 | OTel SDK 初始化（可选依赖，graceful skip） | ✅ | `infra/observability/otel-setup.ts` |

### Phase 6：数据飞轮重构（周 11-12）

> **交付物**：Trace 采集 → 自动评估器 → 根因归因 → 旋钮调优 → A/B 验证闭环。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P6-1 | BadCase Trace 采集重构（携带完整决策上下文） | ✅ | `services/data-flywheel/badcase-collector.ts` |
| P6-2 | SpecRecommendationEvaluator（推荐准确率、首次接受率、覆盖率有解率、fallback 率） | ✅ | `services/data-flywheel/evaluator.ts` |
| P6-3 | 多维根因归因引擎（基于 Trace 上下文自动归因 6 种失败模式） | ✅ | `services/data-flywheel/badcase-analyzer.ts` |
| P6-4 | 旋钮调优器（定位失败模式 → 对应参数旋钮 → 生成调优方案） | ✅ | `services/data-flywheel/tuning-advisor.ts` |
| P6-5 | A/B 实验增强（明确 success 定义：spec_accepted / session_purchase） | ✅ | `services/data-flywheel/ab-experiment.ts` |
| P6-6 | 飞轮闭环集成测试（Trace→评估→归因→调优→A/B→回流） | ✅ | `tests/data-flywheel.test.ts` |

### Phase 7：更多 Workflow + 生产加固（周 13+）

> **交付物**：覆盖售后/物流/投诉场景，性能优化，在线评估闭环。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P7-1 | AfterSale / Logistics / Complaint Workflow | ✅ | `application/workflow/*.ts` |
| P7-2 | LLM-as-Judge 对话质量评估 | ✅ | `services/evaluation/llm-judge.ts` |

### Phase 8：核心闭环集成（Last Mile Integration）

> **交付物**：用户说话 → 画像匹配 → 返回推荐规格的端到端闭环真正跑通。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P8-1 | Agent.trySpecRecommendation 接通 ProductService + matchSpecs | ✅ | `application/agent.ts` |
| P8-2 | Composition Root（main.ts 串联全部模块） | ✅ | `src/main.ts` |
| P8-3 | CLI 接通真实画像构建流程 | ✅ | `presentation/cli/agent-cli.ts` |
| P8-4 | SessionManager + JSONL 会话持久化 | ✅ | `application/services/session-manager.ts` |
| P8-5 | 端到端闭环集成测试 | ✅ | `tests/e2e/last-mile.test.ts` |

### Phase 9：推荐解释性 + 对话偏好仲裁（混合方案）

> **交付物**：三层结构化解释 + 规则快速路径 + LLM 深度路径 + 置信度打分仲裁。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P9-1 | ExplanationGenerator（三层结构化解释） | ✅ | `services/profile-engine/explanation-generator.ts` |
| P9-2 | PreferenceDetector 规则快速路径（4 种覆写类型识别） | ✅ | `services/profile-engine/preference-detector.ts` |
| P9-3 | ConfidenceArbitrator（置信度打分仲裁） | ✅ | `services/profile-engine/confidence-arbitrator.ts` |
| P9-4 | Agent 集成（解释+覆写+仲裁接入主循环） | ✅ | `application/agent.ts` |
| P9-5 | 规则路径测试（解释质量+覆写识别+仲裁决策） | ✅ | `tests/application/explanation.test.ts`, `tests/application/preference.test.ts` |
| P9-6 | ModelPreferenceAnalyzer LLM 深度路径（隐式偏好+主体判断+scope 识别） | ✅ | `services/profile-engine/model-preference-analyzer.ts` |
| P9-7 | PreferenceDetector 混合路由（规则未匹配 → 调 LLM 路径） | ✅ | `services/profile-engine/preference-detector.ts` |
| P9-8 | 混合路径测试（隐式偏好、主体判断、scope 判断、规则+LLM 路由） | ✅ | `tests/application/preference-hybrid.test.ts` |

### Phase 10：监控运维（Monitoring & Observability）

> **交付物**：指标 API、深度健康检查、结构化日志、配置审计——不引入新依赖。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P10-1 | `/api/metrics` 端点（暴露 MetricsSubscriber 业务指标） | ✅ | `presentation/api/metrics-handler.ts` |
| P10-2 | 深度健康检查 `/health`（Redis 连通 + LLM 可用 + 磁盘可写） | ✅ | `presentation/server.ts` |
| P10-3 | 结构化日志 Logger（JSON 格式 + level + timestamp + module） | ✅ | `infra/adapters/logger.ts` |
| P10-4 | 配置审计日志（ConfigWatchSubscriber 记录参数变更到 JSONL） | ✅ | `subscribers/config-watch-subscriber.ts` |
| P10-5 | 监控测试（健康检查 + 指标 + Logger + 配置审计） | ✅ | `tests/presentation/monitoring.test.ts` |

### Phase 11：Web Chat UI + 调试面板（Next.js）

> **交付物**：浏览器对话窗口 + 实时调试面板（画像/匹配/偏好检测/仲裁过程可视化）。
> 回退了原 Phase 11 的 OTel/prom-client/Streamlit（偏离项目焦点），改为聚焦核心的对话交互体验。

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P11-1 | Next.js 项目初始化（`web/` 目录，TypeScript，Tailwind CSS） | ✅ | `web/package.json`, `web/next.config.ts` |
| P11-2 | ChatPanel 组件（消息列表 + 输入框 + 发送，调 `/api/conversation`） | ✅ | `web/app/page.tsx`, `web/components/ChatPanel.tsx` |
| P11-3 | DebugPanel 组件（画像快照 + 覆盖率匹配 + 偏好检测 + 仲裁决策） | ✅ | `web/components/DebugPanel.tsx` |
| P11-4 | 后端 `/api/conversation` 增加 `debug` 字段（画像/匹配/偏好/仲裁中间数据） | ✅ | `presentation/api/conversation-handler.ts`, `application/agent.ts` |
| P11-5 | ProfilePanel 组件（当前画像状态 + 冷启动阶段 + 维度完整度） | ✅ | `web/components/ProfilePanel.tsx` |
| P11-6 | CORS 支持 + Fastify 代理配置（Next.js dev server 跨域访问） | ✅ | `presentation/server.ts` |
| P11-7 | Web UI 集成测试 | 📋 | `web/` 内部测试 |

### Phase 12：核心深度修复（Production Hardening）

> **交付物**：三个聚焦点从 MVP 升级到生产级——消除死代码、串通断裂链路、闭合飞轮。
> 详细审计见 `.claude/skills/tech-researcher/references/core-production-gaps-audit.md`

| 模块 | 任务 | 状态 | 关键文件 |
|------|------|------|---------|
| P12-1 | Agent 传真实 SpecMatchResult（含 featureCoverages）给 ExplanationGenerator | ✅ | `application/agent.ts` |
| P12-2 | Agent 中 PreferenceDetector 接入 LLM client（启用混合路由） | ✅ | `application/agent.ts`, `src/main.ts` |
| P12-3 | 订单解析从正则改为调 LLM（profile_extraction 槽位，与 SPEC 2.2 对齐） | ✅ | `services/profile-engine/order-analyzer.ts` |
| P12-4 | 飞轮触发入口（定时器 + POST /api/admin/flywheel/trigger 真正执行） | ✅ | `application/agent.ts`, `presentation/api/admin-handler.ts` |
| P12-5 | TuningAdvisor.apply()（通过 ConfigWatchSubscriber 自动写入参数变更） | ✅ | `services/data-flywheel/tuning-advisor.ts` |
| P12-6 | 评估器接入 Agent 主循环（推荐后 recordOutcome 追踪结果） | ✅ | `application/agent.ts`, `services/data-flywheel/evaluator.ts` |
| P12-7 | 覆盖率算法输入校验（min<=max, audience 一致性, 平局处理） | ✅ | `services/profile-engine/spec-inference.ts` |
| P12-8 | 深度修复测试（解释真实数据 + 混合偏好 + 飞轮闭环 + 校验） | ✅ | `tests/` |

---

## 7. 可扩展性与未来展望

> 仅保留与三个核心技术点（画像引擎、数据飞轮、上下文管理与仲裁）直接相关的演进方向。

### 7.1 短期演进

| 方向 | 当前状态 | 目标 | 触发条件 |
|------|---------|------|---------|
| **外部服务对接** | Mock 适配器 | 对接真实订单 API + 商品 API | 进入灰度 |
| **Redis 生产部署** | InMemoryRedisClient | 对接真实 Redis | 部署到测试环境 |
| **飞轮自动回流** | TuningAdvisor 只建议 | 参数调优自动生效 | 500+ badcase |
| **解释性社会证明** | 三层结构化解释 | "相似体型用户 80% 选了 M 码" | 有反馈数据后 |

### 7.2 中期演进

| 方向 | 说明 | 触发条件 |
|------|------|---------|
| **微调数据飞轮** | BadCase 自动生成 SFT 数据，增量微调 8B | 旋钮调优收益递减 |
| **群体画像** | 冷启动用户 fallback 到聚类群体画像 | cold_start 占比 > 30% |

### 7.3 长期演进

| 方向 | 演进路径 |
|------|---------|
| **画像存储** | RedisJSON → PostgreSQL |
| **事件持久化** | InMemory EventBus → Redis Streams |
