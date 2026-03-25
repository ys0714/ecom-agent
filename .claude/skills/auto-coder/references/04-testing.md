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
