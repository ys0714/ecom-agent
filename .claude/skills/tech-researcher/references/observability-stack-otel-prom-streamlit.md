# 调研报告：OTel + Prometheus + Streamlit 可观测性全栈

> 调研时间：2026-03-25
> 搜索来源：OpenTelemetry 官方文档、prom-client npm、Streamlit-extras Prometheus 插件、OneUptime

---

## 一、问题定义

SPEC 7.4 列出的远期增强：
- Prometheus 格式指标暴露
- OTel 全链路追踪（HTTP/Redis/LLM）
- Dashboard（Grafana 或自建）
- 配置回滚

用户要求：引入 OTel、prom-client、Streamlit，避免重复造轮子。

## 二、技术方案

### OTel 接入（Tracing + Metrics 自动插桩）
- 安装：`@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node`
- 自动插桩覆盖：HTTP（Fastify）、ioredis、Node.js 进程指标
- LLM 调用需手动 Span（openai SDK 无自动插桩）
- 导出：OTLP → Jaeger（Tracing）、Prometheus Exporter（Metrics）

### Prometheus 指标（prom-client）
- `prom-client` v15.x，TypeScript 原生支持
- 自定义业务指标：Counter/Histogram/Gauge
- `/metrics` 端点暴露 Prometheus 文本格式
- 与现有 MetricsSubscriber 集成：EventBus 事件 → prom-client 指标更新

### Streamlit Dashboard
- Python 独立进程，通过 HTTP 轮询 `/api/metrics` 和 `/health` 获取数据
- `st.metric` 组件展示 KPI + delta 变化
- `streamlit-extras` 的 Prometheus 集成可直接查询 Prometheus
- 不侵入 Node.js 主进程，部署独立

### 配置回滚
- 基于现有 ConfigWatchSubscriber 审计日志
- 新增 rollback API：`POST /api/admin/config/rollback`
- 从审计日志中读取历史值，applyChange 回退

## 三、依赖清单

| 包 | 版本 | 用途 | 必需 |
|----|------|------|------|
| prom-client | ^15.1 | Prometheus 指标 | 是 |
| @opentelemetry/sdk-node | ^0.52 | OTel SDK | 可选（已在 package.json） |
| @opentelemetry/auto-instrumentations-node | latest | 自动插桩 | 可选 |
| @opentelemetry/exporter-prometheus | latest | OTel→Prometheus 桥接 | 可选 |
| streamlit (Python) | >=1.31 | Dashboard | 独立部署 |

## 四、推荐实现顺序

1. prom-client + `/metrics` 端点（替换现有 JSON 格式）
2. 配置回滚 API
3. Streamlit Dashboard（独立 Python 应用）
4. OTel 自动插桩（可选，生产部署时启用）
