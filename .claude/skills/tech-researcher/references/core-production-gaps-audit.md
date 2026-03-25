# 调研报告：核心模块生产级差距审计

> 调研时间：2026-03-25
> 来源：代码审计 + Etsy LLM Buyer Profiles (2025) + NVIDIA MAPE Flywheel (2025) + Airbnb AITL (2025)

## 一、审计结果摘要（9 个核心文件）

| 文件 | 判定 |
|------|------|
| spec-inference.ts | needs work: range/audience 校验 + 平局处理 |
| order-analyzer.ts | needs work: 正则脆弱，应用 LLM 提取（与 SPEC 2.2 一致） |
| evaluator.ts | needs work: 内存计数器，Agent 未调用 |
| tuning-advisor.ts | needs work: 只建议不执行，placeholder 当前值 |
| preference-detector.ts | needs work: Agent 未传 LLM client，深度路径是死代码 |
| explanation-generator.ts | needs work: Agent 传空 featureCoverages |
| agent.ts | needs work: MVP 循环，多处断裂 |
| order-service.ts | mock/placeholder |
| product-service.ts | mock/placeholder |

## 二、P0 修复（串通核心价值链）

1. Agent 传真实 `SpecMatchResult`（含 featureCoverages）给 explanation-generator
2. Agent 中 `PreferenceDetector` 接入 LLM client 启用混合路由
3. 订单解析从正则改为调 LLM（`profile_extraction` 槽位）

## 三、P1 修复（飞轮从死代码变闭环）

4. 飞轮触发入口：定时器 + API 真正执行
5. TuningAdvisor 增加 apply() 通过 ConfigWatchSubscriber 写入
6. 评估器接入 Agent 主循环（推荐后 recordOutcome）

## 四、P2 修复

7. 覆盖率算法增加输入校验（min<=max, audience 一致性）
