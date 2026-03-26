# 调研报告：会话记忆架构方案决策

> 调研时间：2026-03-26
> 来源：arxiv 2603.07670（Memory for Autonomous LLM Agents）、LangGraph 双层记忆、Mem0 记忆层、用户讨论

## 决策结论

采用**画像 Store + 滑动窗口 + 分段压缩**方案。

## 关键发现

1. **画像引擎 = 长期记忆**：用户尺码/体重/偏好的结构化数据跨会话持久存储在 Redis + JSON，等价于 Mem0 的 fact extraction
2. **唯一缺口**：单会话超过 K 轮后，窗口外消息被 FIFO 丢弃，角色切换/尺码纠正等关键上下文丢失
3. **分段压缩是最高性价比补丁**：每次溢出调一次 8B LLM 生成 ~100 tokens 摘要，被动注入 system prompt

## 排除的方案

| 方案 | 排除原因 |
|------|---------|
| L1/L2/L3 三层分层记忆 | 画像 Store 已覆盖长期记忆，分层检索是过度设计 |
| Mem0 式向量记忆 | 与结构化画像引擎功能重复，引入向量数据库依赖 |
| 主动检索（tool use） | 当前 Agent 无 ReAct 循环，作为中期演进方向保留 |

## 分段策略

- 固定 5 轮一段（fallback）
- 角色切换时强制分段（`role_switch` 信号）
- 不依赖 IntentRouter 准确率（当前为纯关键词匹配，覆盖不全）

## SPEC 更新

- 2.3 节重写（画像 Store + 滑动窗口 + 分段压缩）
- 5.1 架构图中 `memory/` 目录改为 `context/segment-compressor.ts`
- types.ts 中 `MemoryLayer` 改为 `CompressedSegment`
- constants.ts 中记忆层参数改为 `SLIDING_WINDOW_SIZE=10, SEGMENT_SIZE=5`
- 7.2 中期演进加入主动上下文检索（需先实现 ReAct 循环）
