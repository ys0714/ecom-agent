# ecom-agent — 电商客服 Agent 用户特征画像系统

基于用户历史下单记录构建实时特征画像，驱动服饰类目规格默选推荐的智能客服 Agent。

## 核心能力

| 能力 | 说明 |
|------|------|
| **用户画像引擎** | 从订单历史提取 8 种身体特征（体重/身高/腰围/胸围/脚长/尺码/鞋码），支持多性别角色（女装/男装/童装） |
| **覆盖率匹配** | 零模型调用的规格推荐——用户画像区间 × 商品画像区间，按特征优先级加权选最优 SKU |
| **模型槽位** | 标准化接口支持 8B/72B 热切换，cockatiel 断路器/重试/超时，自动 fallback |
| **Workflow 路由** | 声明式图结构（LangGraph 模式），内置商品咨询/售后/物流/投诉 4 个 Workflow |
| **安全护栏** | 输入层（注入检测）+ 执行层（权限白名单）+ 输出层（PII 脱敏 + 承诺合规） |
| **数据飞轮** | BadCase 收集 → 聚类 → Prompt 优化 → A/B 统计检验 → 自动上线/回滚 |
| **冷启动策略** | 四级渐进式：零画像兜底 → 主动探索 → 渐进积累 → 成熟画像 |

## 快速开始

### 安装

```bash
npm install
```

### 配置

复制 `.env.example` 为 `.env`，填入 LLM 服务地址和 API Key：

```bash
cp .env.example .env
```

```env
LLM_BASE_URL=https://api.deepseek.com/v1   # 或本地 vLLM 地址
LLM_API_KEY=your-api-key
LLM_MODEL_ID=deepseek-chat                  # 或 qwen3-8b-rl
```

### 启动 CLI 对话

```bash
npm run cli
```

```
=== 电商客服 Agent CLI ===
画像: 女装：体重105-115斤，身高160-170cm，上装M/L，下装M，鞋码37/38
输入 /quit 退出, /profile 查看画像

用户> 这件羽绒服哪个码合适我？
客服> 根据您的购买记录（身高160-170cm，体重105-115斤），推荐 M 码...
```

### 启动 HTTP API

```bash
npm run dev
```

```bash
# 对话
curl -X POST http://localhost:3000/api/conversation \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"s1","userId":"u1","message":"推荐一件外套"}'

# 查询画像
curl http://localhost:3000/api/profile/u1

# 健康检查
curl http://localhost:3000/health
```

### 运行测试

```bash
npm test           # 运行全部 123 个测试
npm run test:watch # 监听模式
npm run lint       # 类型检查
```

## 项目结构

```
src/
├── domain/                          # 领域层（零外部依赖）
│   ├── types.ts                     #   20+ 接口：UserSpecProfile, ProductSpecProfile, ModelSlot 等
│   ├── entities/
│   │   └── user-profile.entity.ts   #   充血领域实体：applyDelta, summarizeForPrompt, 冷启动阶段
│   └── event-bus.ts                 #   EventBus：事件分级 Critical/Normal/Low，错误隔离，死信队列
├── application/                     # 应用层（编排，不含业务规则）
│   ├── agent.ts                     #   Agent 主循环：意图路由 → Workflow → 模型调用
│   ├── workflow/                    #   声明式 Workflow 图引擎
│   │   ├── workflow-graph.ts        #     WorkflowGraph<TState> + CompiledWorkflow + Registry
│   │   ├── intent-router.ts         #     规则快速路由 + LLM 意图分类
│   │   ├── product-consult.ts       #     商品咨询 Workflow
│   │   ├── after-sale.ts            #     售后 Workflow
│   │   ├── logistics.ts             #     物流 Workflow
│   │   └── complaint.ts             #     投诉 Workflow
│   ├── guardrails/                  #   三层安全护栏
│   │   ├── input-guard.ts           #     Prompt 注入检测 + 敏感词 + 身份绑定
│   │   ├── execution-guard.ts       #     工具权限白名单 + 金额限制 + 频率限制
│   │   └── output-guard.ts          #     PII 脱敏 + 未授权承诺拦截
│   ├── services/
│   │   ├── profile-engine/          #   画像引擎
│   │   │   ├── spec-inference.ts    #     覆盖率匹配算法
│   │   │   ├── order-analyzer.ts    #     订单 → 画像构建
│   │   │   ├── dimension-registry.ts#     画像维度 Plugin 注册
│   │   │   └── cold-start-manager.ts#     冷启动策略
│   │   ├── model-slot/              #   模型管理
│   │   │   ├── model-slot-manager.ts#     注册/切换/fallback/健康检查
│   │   │   ├── model-provider.ts    #     cockatiel 弹性封装
│   │   │   ├── inference-cache.ts   #     Redis 推理缓存
│   │   │   └── ab-router.ts         #     A/B 流量路由
│   │   ├── data-flywheel/           #   数据飞轮
│   │   │   ├── badcase-collector.ts #     多信号 BadCase 收集
│   │   │   ├── badcase-analyzer.ts  #     失败模式聚类
│   │   │   ├── prompt-optimizer.ts  #     Prompt 优化候选生成
│   │   │   └── ab-experiment.ts     #     A/B 实验 + Z-test 统计检验
│   │   ├── evaluation/
│   │   │   └── llm-judge.ts         #     LLM-as-Judge 对话质量评估
│   │   └── profile-store.ts         #   画像持久化（Redis + JSON 文件）
│   └── subscribers/                 #   EventBus Subscriber
│       ├── session-log-subscriber.ts#     JSONL 会话日志
│       ├── metrics-subscriber.ts    #     推理延迟/冲突率/降级率
│       ├── alert-subscriber.ts      #     连续降级/错误率告警
│       └── config-watch-subscriber.ts#    配置热更新
├── infra/                           # 基础设施层
│   ├── config.ts                    #   分层配置（env → defaults）
│   ├── adapters/
│   │   ├── llm.ts                   #     OpenAI-compatible 客户端
│   │   ├── redis.ts                 #     ioredis + InMemory mock
│   │   ├── order-service.ts         #     订单服务适配器
│   │   └── product-service.ts       #     商品服务适配器
│   └── observability/
│       └── otel-setup.ts            #     OpenTelemetry SDK 初始化
└── presentation/                    # 表现层
    ├── server.ts                    #   Fastify HTTP 服务
    ├── api/
    │   ├── conversation-handler.ts  #     POST /api/conversation
    │   ├── profile-handler.ts       #     GET /api/profile/:userId
    │   └── admin-handler.ts         #     GET /api/admin/status
    └── cli/
        └── agent-cli.ts             #     交互式 CLI 对话
```

## 技术栈

| 技术 | 用途 |
|------|------|
| TypeScript 5.7 (strict, ESM) | 主语言 |
| Fastify 5 | HTTP API 框架 |
| OpenAI SDK | LLM 调用（兼容 vLLM/DeepSeek/Ollama） |
| ioredis | Redis 客户端（画像缓存 + 推理缓存） |
| cockatiel | 弹性策略（断路器/重试/超时） |
| neverthrow | Result<T, E> 显式错误处理 |
| Zod | 运行时数据校验 |
| Vitest | 测试框架（123 tests） |

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/api/conversation` | 对话（含 Guardrails） |
| GET | `/api/profile/:userId` | 查询用户画像 |
| GET | `/api/admin/status` | 系统状态 |
| POST | `/api/admin/flywheel/trigger` | 手动触发飞轮 |

## 设计理念

- **Profile-Centric** — 所有推荐决策以用户画像为核心驱动
- **Vertical Slice Delivery** — 每个迭代交付端到端功能，先跑通再演进
- **Safety-First Guardrails** — 输入/执行/输出三层防护，生产上线前置条件
- **Declarative Workflow** — 声明式图结构定义对话流程，可视化、可回溯
- **Data Flywheel** — BadCase 驱动的自动优化闭环

详细技术规范参见 [PROJECT_SPEC.md](PROJECT_SPEC.md)。
