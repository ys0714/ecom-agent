# ecom-agent — 电商客服 Agent 用户特征画像系统

基于用户历史下单记录构建实时特征画像，驱动服饰类目规格默选推荐的智能客服 Agent。

## 项目聚焦点

这个项目不是通用聊天机器人，而是一个**围绕“服饰尺码决策”做深做透**的电商客服 Agent。

- **主问题**：降低“尺码不确定”导致的咨询成本、试错成本和退换货风险
- **主能力**：画像驱动推荐、对话中偏好纠偏、可解释推荐、可追踪决策链路
- **主场景**：商品咨询中的规格推荐（女装/男装/童装）
- **主原则**：宁可保守追问，也不编造结论；宁可解释不足，也不做越权承诺

### 非目标（刻意不做）

- 不做开放域百科问答型 Assistant
- 不做通用 Agent 平台编排器
- 不追求“看起来聪明”，优先“推荐可靠、可解释、可回放”
- 不在核心链路中引入不可控的黑盒策略

## 核心能力

| 能力 | 说明 |
|------|------|
| **用户画像引擎** | 从订单历史提取 8 种身体特征（体重/身高/腰围/胸围/脚长/尺码/鞋码），支持多性别角色（女装/男装/童装） |
| **覆盖率匹配** | 零模型调用的规格推荐——用户画像区间 × 商品画像区间，按特征优先级加权选最优 SKU |
| **三层结构化解释** | 结论层（推荐 M 码）+ 依据层（画像 × 商品匹配关系）+ 信心层（根据置信度调整语气） |
| **对话偏好仲裁** | 混合方案：规则快速路径（"我要L码"）+ LLM 深度路径（"太小了"）+ 置信度打分仲裁 |
| **上下文意图保护** | 意图降级重估 + 基于商品受众的隐式角色自动推断（如童装自动切儿童画像）+ LLM 幻觉文案清洗 |
| **模型槽位** | 标准化接口支持 8B/72B 热切换，cockatiel 断路器/重试/超时，自动 fallback |
| **Workflow 路由** | 声明式图结构（LangGraph 模式），内置商品咨询/售后/物流/投诉 4 个 Workflow |
| **安全护栏** | 输入层（注入检测）+ 执行层（权限白名单）+ 输出层（PII 脱敏 + 承诺合规） |
| **数据飞轮** | Trace 采集 → 评估器 → 根因归因 → 旋钮调优 → A/B 统计检验 → 回流 |
| **可观测性** | Prometheus 指标 + OTel 自动插桩 + Streamlit Dashboard + 配置回滚 |
| **冷启动策略** | 四级渐进式：零画像兜底 → 主动探索 → 渐进积累 → 成熟画像 |

## 快速开始

### 安装

```bash
npm install

# 可选：Streamlit Dashboard
pip install -r dashboard/requirements.txt
```

### 配置

```bash
cp .env.example .env
```

```env
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your-api-key
LLM_MODEL_ID=deepseek-chat
```

### 启动

```bash
# CLI 对话
npm run cli

# HTTP API（:3000）+ OTel Prometheus（:9464）
npm run dev

# Streamlit Dashboard（:8501）
streamlit run dashboard/app.py
```

### 测试

```bash
npm test           # 195 个测试
npm run lint       # 类型检查
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 深度健康检查（Redis/LLM/disk） |
| GET | `/metrics` | Prometheus 格式指标 |
| POST | `/api/conversation` | 对话（Guardrails + 解释性 + 偏好仲裁） |
| GET | `/api/profile/:userId` | 查询用户画像 |
| GET | `/api/metrics` | JSON 业务指标 |
| GET | `/api/admin/status` | 系统状态 |
| GET | `/api/admin/config/audit` | 配置审计日志 |
| POST | `/api/admin/config/rollback` | 配置回滚 |
| POST | `/api/admin/flywheel/trigger` | 手动触发飞轮 |

## 项目结构

```
src/
├── domain/                          # 领域层（零外部依赖）
│   ├── types.ts                     #   30+ 接口（含 BadCaseTrace, FailureMode, SuccessSignal）
│   ├── entities/
│   │   └── user-profile.entity.ts   #   充血实体：applyDelta, summarizeForPrompt, 冷启动
│   └── event-bus.ts                 #   EventBus：分级 Critical/Normal/Low，死信队列
├── application/                     # 应用层
│   ├── agent.ts                     #   主循环：偏好检测 → 意图路由 → Workflow → 解释生成
│   ├── workflow/                    #   声明式 Workflow 图引擎（4 个 Workflow）
│   ├── guardrails/                  #   三层安全护栏
│   ├── services/
│   │   ├── profile-engine/          #   画像引擎
│   │   │   ├── spec-inference.ts    #     覆盖率匹配
│   │   │   ├── explanation-generator.ts  # 三层结构化解释
│   │   │   ├── preference-detector.ts    # 混合偏好检测（规则+LLM）
│   │   │   ├── confidence-arbitrator.ts  # 置信度打分仲裁
│   │   │   ├── model-preference-analyzer.ts # LLM 深度偏好分析
│   │   │   ├── dimension-registry.ts#     画像维度 Plugin
│   │   │   └── cold-start-manager.ts#     冷启动策略
│   │   ├── model-slot/              #   模型管理（槽位/缓存/A-B路由）
│   │   ├── data-flywheel/           #   数据飞轮（Trace→评估→归因→调优→A/B）
│   │   ├── evaluation/              #   LLM-as-Judge
│   │   ├── profile-store.ts         #   画像持久化
│   │   ├── profile-provider.ts      #   外部画像接入接口
│   │   └── session-manager.ts       #   会话管理 + JSONL 持久化
│   └── subscribers/                 #   EventBus Subscriber（6 个）
├── infra/                           # 基础设施层
│   ├── config.ts                    #   分层配置
│   ├── adapters/
│   │   ├── llm.ts                   #     OpenAI-compatible
│   │   ├── redis.ts                 #     ioredis + InMemory mock
│   │   ├── logger.ts                #     JSON 结构化日志
│   │   ├── mock-profile-provider.ts #     画像系统 Mock 提供者
│   │   └── product-service.ts       #     商品适配器
│   └── observability/
│       └── otel-setup.ts            #     OTel SDK + 自动插桩 + Prometheus Exporter
├── presentation/                    # 表现层
│   ├── server.ts                    #   Fastify（深度健康检查）
│   ├── api/
│   │   ├── conversation-handler.ts  #     对话 API
│   │   ├── profile-handler.ts       #     画像 API
│   │   ├── admin-handler.ts         #     管理 API（含配置回滚）
│   │   └── metrics-handler.ts       #     Prometheus + JSON 指标
│   └── cli/
│       └── agent-cli.ts             #     交互式 CLI
└── dashboard/                       # Streamlit 监控面板
    ├── app.py                       #   健康/指标/审计/回滚/护栏统计
    └── requirements.txt
```

## 技术栈

| 技术 | 用途 |
|------|------|
| TypeScript 5.7 (strict, ESM) | 主语言 |
| Fastify 5 | HTTP API |
| OpenAI SDK | LLM 调用（兼容 vLLM/DeepSeek/Ollama） |
| ioredis | Redis 画像/推理缓存 |
| prom-client | Prometheus 指标 |
| OpenTelemetry | 自动插桩（HTTP/Redis）+ Prometheus Exporter |
| cockatiel | 断路器/重试/超时 |
| neverthrow | Result<T, E> 错误处理 |
| Vitest | 测试（195 tests） |
| Streamlit | 监控 Dashboard |

## 设计理念

### 2026 版（可靠性优先）

- **可靠性优先于自治**：先保证稳定可控，再提升自主度
- **确定性编排优先**：主链路由工作流和显式状态驱动，减少随机漂移
- **有界 Agent 循环**：每轮推理和工具调用都受超时/重试/回退约束
- **Trace 优先工程化**：每次对话都可回放“输入→推理→工具→输出”
- **评测驱动迭代**：能力评测 + 回归评测双轨，防止“越改越差”
- **记忆分层按需加载**：Bootstrap/History/Tool Results/Current，控制 token 成本
- **Guardrails 作为运行时闸门**：输入、执行、输出三层拦截与留痕

### 反模式（避免）

- 用 prompt 堆砌替代流程控制
- 无上限自治循环导致延迟和成本失控
- 只有日志没有结构化 trace
- 只做离线 benchmark 不做线上回归

详细技术规范参见 [PROJECT_SPEC.md](PROJECT_SPEC.md)。
