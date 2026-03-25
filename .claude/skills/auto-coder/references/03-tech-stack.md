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
