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
