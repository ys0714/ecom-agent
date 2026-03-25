# 调研报告：置信度仲裁引入模型 — 混合方案

> 调研时间：2026-03-25
> 触发背景：用户提问"ConfidenceArbitrator 是否可以引入模型完成仲裁"

---

## 一、问题定义

当前仲裁机制分两步：
1. **PreferenceDetector**：纯正则匹配 → 识别覆写类型 + 硬编码置信度
2. **ConfidenceArbitrator**：两个标量数字比值 → accept/merge/ignore

核心局限：正则漏检（"太小了"等隐式偏好）、误检（"朋友165cm"当成自己）、置信度不考虑语境。

## 二、方案对比

| 方案 | 核心思路 | 优势 | 劣势 | 适用性 |
|------|---------|------|------|--------|
| 方案 1：模型做信号识别 | LLM 替代正则做偏好提取 | 解决漏检/误检/语境 | 每轮 +200ms | 部分 |
| 方案 2：模型做仲裁决策 | LLM 替代数值比较做决策 | 能考虑语义微妙差异 | 延迟高、不确定性大 | ❌ 杀鸡用牛刀 |
| **方案 3：混合方案** | 规则快速路径 + 模型深度路径 | 高确定性零延迟，低确定性用模型 | 需要维护两条路径 | ✅ 推荐 |

## 三、推荐方案：混合方案（方案 3）

```
            用户消息
               │
    ┌──────────┴──────────┐
    ▼                     ▼
规则快速路径            模型深度路径
(正则匹配)             (LLM 偏好分析)
延迟: 0ms              延迟: ~200ms
    │                     │
    ▼                     ▼
高确定性？             返回结构化信号
YES → 直接用规则结果    (含 confidence + scope + subject)
NO  → 使用模型结果
    │                     │
    └──────────┬──────────┘
               ▼
     ConfidenceArbitrator
     (数值仲裁逻辑不变)
```

**规则处理的**（零延迟）：明确纠正（"我要L码"）、明确数字（"我165cm"）
**模型处理的**（需语义理解）：隐式偏好（"太小了"）、主体判断（"朋友165cm"）、范围判断（"一般穿M" vs "这件要M"）

## 四、模型输出 schema

```typescript
interface LLMPreferenceSignal {
  type: OverrideType;
  confidence: number;        // 0~1，基于表达确定性
  value: Record<string, unknown>;
  scope: 'this_turn' | 'session' | 'permanent';
  subject: 'self' | 'other';
  reasoning: string;         // 模型的推理过程
}
```

## 五、关键决策

- 问题出在**输入信号质量**，不在**决策逻辑** → 改 PreferenceDetector，不改 ConfidenceArbitrator
- 仲裁逻辑（accept/merge/ignore 的数值比较）已经足够
- 混合方案的路由判断用 PreferenceDetector 的正则结果：匹配到 → 用规则，匹配不到 → 调模型
