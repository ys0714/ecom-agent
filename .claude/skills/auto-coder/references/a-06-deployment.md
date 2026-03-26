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
