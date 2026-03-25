# 调研报告：监控运维（Monitoring & Observability）

> 调研时间：2026-03-25
> 搜索来源：OneUptime LLM Observability (2026)、@promster/fastify、fastify-healthcheck、OpenLLMetry-JS

---

## 一、问题定义

当前系统监控能力：
- `MetricsSubscriber`：内存聚合 5 项指标，无 HTTP 暴露
- `/health`：返回 `{status: ok}`，不检查依赖健康
- `/api/admin/status`：只有 uptime + memory
- OTel：占位代码，未实际接入
- 日志：全部是 `console.log/warn/error`，无结构化

## 二、业界实践

**LLM 应用核心监控指标**（OneUptime 2026）：
- Latency：TTFT、总完成时间、嵌入延迟
- Token Usage：输入/输出 token、token/秒吞吐
- Cost：每请求成本
- Reliability：错误率、超时率、限流率
- Quality：guardrail 触发率、重试率

**Fastify 生产监控**：
- `@promster/fastify`：Prometheus 格式指标导出
- `fastify-healthcheck`：依赖 `@fastify/under-pressure` 的深度健康检查
- OpenTelemetry 自动插桩：HTTP span + Redis + LLM 调用

## 三、推荐方案

不引入新依赖（prom-client / OTel 包），用现有模块实现 MVP 级监控：

| 能力 | 实现方式 | 复杂度 |
|------|---------|--------|
| `/api/metrics` | MetricsSubscriber.getSnapshot() 通过 API 暴露 | 低 |
| 深度健康检查 | `/health` 增加 Redis/LLM 连通性测试 | 低 |
| 结构化日志 | Logger 类（JSON 格式 + level + timestamp） | 低 |
| 配置审计日志 | ConfigWatchSubscriber 记录变更到 JSONL | 低 |

后续可选引入 prom-client 做 Prometheus 格式暴露，或 OTel 做全链路追踪。
