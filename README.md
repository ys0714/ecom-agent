# Multi-Agent Automation Framework (TypeScript)

一个面向软件工程场景的多智能体自动化框架。不是简单的 LLM REPL，而是具备 Lead-Teammate 协作、事件驱动可观测、安全守卫、会话持久化、Git Worktree 沙箱隔离、自适应上下文管理的完整自主编程智能体平台。

## 核心特性

| 特性 | 说明 |
|------|------|
| **多智能体协作** | Lead 主控 + Teammate 子进程 + Subagent 轻量探索，通过 MessageBus 通信，支持任务自动认领、计划审批、MapReduce 结构化输出 |
| **事件驱动架构** | 18 种事件类型的 `InMemoryEventBus`，4 个 Subscriber（安全守卫、代码审查、会话日志、用户画像）全链路解耦 |
| **交互式 TUI** | 基于 React + Ink 的终端 UI，实时对话渲染、工具执行状态指示、内置命令支持 |
| **安全守卫** | 三道防线：路径沙箱（`safePath`）+ 危险命令拦截（10 种模式）+ 未读写保护 |
| **代码审查器** | 文件修改后自动异步语法检查（JS/Python/JSON），错误自动反馈给 Agent 驱动自修复 |
| **会话持久化** | JSONL append-only 日志，支持 `--resume` 跨进程恢复完整对话状态（含压缩摘要） |
| **上下文管理** | 四层递进压缩：微压缩 → 工具输出卸载 → 滚动摘要 → LLM 深度压缩 |
| **Git Worktree** | 7 个专用工具管理隔离 Git 分支，与 TaskManager 联动，防止代码污染主工作区 |
| **任务管理** | 双轨制：内存 TodoManager（即时清单）+ 磁盘 TaskManager（持久化依赖图），连续 3 轮未更新自动催促 |
| **用户画像** | 被动学习用户偏好（语言、环境、交互风格），跨项目持久化到全局配置 |
| **技能系统** | 递归扫描 `skills/` 目录的 SKILL.md，支持 YAML Front Matter 元数据，动态注入 Agent 上下文 |

## 项目结构

```
src/
├── domain/                  # 领域层（零外部依赖）
│   ├── types.ts             #   全局类型：Message, AgentSession, Task, TodoItem 等 12 个接口
│   ├── event-bus.ts         #   InMemoryEventBus<AgentEvent>，18 种事件的发布-订阅
│   └── user-profile.ts      #   StableUserProfile，跨项目用户画像读写
├── application/             # 应用层（业务逻辑）
│   ├── agent.ts             #   Agent 主循环：上下文构建 → LLM 调用 → 工具分发 → 压缩
│   ├── tools.ts             #   18 个 Tool Schema 定义（Anthropic Tool Use 格式）
│   ├── services/            #   垂直能力模块
│   │   ├── todo-manager.ts  #     即时清单（内存，20 条上限，单 in_progress）
│   │   ├── task-manager.ts  #     持久化任务（JSON 文件，blockedBy/blocks 依赖图）
│   │   ├── background.ts    #     后台进程管理（UUID 追踪，异步通知队列）
│   │   ├── message-bus.ts   #     智能体间通信（JSONL 收件箱，drain 语义）
│   │   ├── teammate.ts      #     Teammate 管理（spawn 子进程，状态追踪）
│   │   ├── teammate-loop.ts #     Teammate 独立循环（Work → Idle → 自动认领）
│   │   ├── worktree.ts      #     Git Worktree 管理 + WorktreeEventBus 日志
│   │   ├── skill-loader.ts  #     技能加载（递归扫描 SKILL.md，YAML 解析）
│   │   ├── session-manager.ts #   会话管理（创建/加载/恢复最新/列出）
│   │   └── profile-manager.ts #   本地用户配置（$GLOBAL_DIR）
│   └── subscribers/         #   EventBus 订阅者
│       ├── security-guard-subscriber.ts   # 命令拦截 + 未读写保护
│       ├── code-inspector-subscriber.ts   # 异步语法检查 + drain 队列
│       ├── session-log-subscriber.ts      # append-only JSONL 持久化
│       └── user-profile-subscriber.ts     # 被动用户画像学习
├── infra/                   # 基础设施层（OS/外部服务交互）
│   ├── config.ts            #   配置中心：APP_NAME, 所有路径常量, 模型配置
│   └── adapters/
│       ├── llm.ts           #     Anthropic SDK 客户端
│       ├── shell.ts         #     Shell 执行器（危险命令拦截，120s 超时）
│       ├── file-system.ts   #     文件操作（safePath 沙箱，EventBus 集成）
│       ├── compression.ts   #     四层上下文压缩策略
│       └── logger.ts        #     控制台彩色日志（EventBus 订阅）
├── presentation/            # 表现层（终端 UI）
│   ├── index.tsx            #   应用入口：服务初始化、Session 创建、Ink 渲染
│   └── ui/
│       ├── App.tsx          #     主容器：EventBus 订阅、输入路由、Agent 循环
│       ├── Chat.tsx         #     对话渲染：最近 20 条、三种 block 类型
│       ├── Input.tsx        #     用户输入框（受控 TextInput）
│       └── Status.tsx       #     Spinner + 当前工具名指示
├── cli/                     # 命令行工具
│   ├── agent-cli.ts         #   14 个子命令（消息、任务、团队管理）
│   ├── run-teammate.ts      #   Teammate 独立进程入口
│   └── generate-schema.ts   #   LLM → JSON Schema 生成器
└── skills/                  # 技能定义目录
    ├── auto-coder/          #   Spec 驱动的自动开发技能
    ├── setup/               #   交互式项目配置向导
    ├── qa-tester/           #   全自动 QA 测试技能
    ├── package/             #   项目清理打包技能
    └── skill-creator/       #   技能创建指南
```

## 环境要求

- **Node.js** ≥ v16
- **npm**
- **Git**（Worktree 功能需要）
- **Anthropic API Key**

## 快速开始

### 1. 克隆并安装

```bash
git clone <repo-url>
cd learn-claude-code
npm install
```

### 2. 配置 API Key

创建 `.env` 文件：

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here

# 可选配置
# MODEL_ID=claude-3-5-sonnet-20241022    # 默认模型
# ANTHROPIC_BASE_URL=https://proxy.example.com  # 自定义端点
# APP_NAME=my-agent                      # 自定义数据目录名（默认 multi-auto-agent）
# AGENT_HOME=/custom/path                # 自定义全局数据目录
```

### 3. 启动

```bash
npm start
```

恢复上次会话：

```bash
npm start -- --resume
```

## TUI 内置命令

| 命令 | 功能 |
|------|------|
| `/compact` | 手动触发上下文深度压缩（调用 LLM 生成摘要） |
| `/tasks` | 列出所有持久化任务及状态 |
| `/team` | 列出所有 Teammate 及其状态 |
| `/inbox` | 查看 Lead 智能体的收件箱 |
| `q` / `exit` / `quit` | 退出程序 |

## Agent 工具集

Agent 在与 LLM 交互时拥有 **18 个工具**：

| 工具 | 功能 |
|------|------|
| `bash` | 执行 Shell 命令（自动安全拦截） |
| `read_file` / `write_file` / `edit_file` | 文件操作（路径沙箱保护） |
| `TodoWrite` | 更新即时 Todo 清单 |
| `task` | 衍生子智能体（Explore / general-purpose） |
| `load_skill` | 动态加载技能知识 |
| `compress` | 手动压缩对话上下文 |
| `background_run` / `check_background` | 后台任务管理 |
| `worktree_*`（7 个） | Git Worktree 生命周期管理 |
| `idle` | Teammate 进入空闲等待 |

## CLI 工具

除 TUI 主界面外，项目还提供独立的 CLI 工具：

```bash
# 任务管理
npx ts-node src/cli/agent-cli.ts task_create --subject "实现新功能"
npx ts-node src/cli/agent-cli.ts task_list
npx ts-node src/cli/agent-cli.ts task_update --id 1 --status completed

# 团队通信
npx ts-node src/cli/agent-cli.ts send_message --to lead --content "任务完成"
npx ts-node src/cli/agent-cli.ts spawn_teammate --name dev1 --role developer --prompt "请完成任务 #1"

# JSON Schema 生成
npx ts-node src/cli/generate-schema.ts --description "包含姓名和年龄的用户列表"
```

## 数据存储

| 数据 | 路径 | 说明 |
|------|------|------|
| 项目级数据 | `.multi-auto-agent/` | 任务、团队配置、消息收件箱、转录归档、工具输出 |
| 全局数据 | `~/.multi-auto-agent/` | 会话日志、用户画像（跨项目共享） |
| 技能 | `skills/` | SKILL.md 技能定义文件 |
| Worktree | `../{repo}-worktrees/` | Git 隔离工作区 |

路径可通过环境变量自定义：`APP_NAME`（数据目录名）、`AGENT_HOME`（全局数据目录）。

## 技能系统

项目内置 5 个技能，Agent 可通过 `load_skill` 工具按需加载：

| 技能 | 说明 |
|------|------|
| `auto-coder` | Spec 驱动的自动开发：同步 PROJECT_SPEC.md → 识别任务 → 实现代码 → 测试 → 提交 |
| `setup` | 交互式配置向导：检查环境 → 配置 API → 安装依赖 → 构建 → 启动 |
| `qa-tester` | 全自动 QA 测试：85 个测试用例，覆盖所有模块，自动修复 + 记录结果 |
| `package` | 项目清理打包：移除 node_modules/dist/数据目录，清理密钥 |
| `skill-creator` | 技能创建指南：新技能初始化、编写规范、迭代流程 |

## 开发

```bash
# 编译
npm run build

# 类型检查（不输出文件）
npx tsc --noEmit

# Lint
npm run lint

# 编译后运行（跳过 ts-node）
npm run start:node
```

## 技术栈

| 技术 | 用途 |
|------|------|
| TypeScript 5.7 | 主语言，严格模式 |
| React 18 + Ink 3 | 终端 UI 渲染 |
| @anthropic-ai/sdk | LLM 交互（Tool Use） |
| Commander | CLI 工具框架 |
| dotenv | 环境变量管理 |
| uuid | 唯一标识生成 |
| zod | 输入验证（预留） |

## 架构设计

项目采用 **Clean Architecture / DDD** 四层分离：

```
Domain（零依赖）→ Application（业务逻辑）→ Infrastructure（外部交互）→ Presentation（UI）
```

核心架构模式：
- **EventBus 发布-订阅**：所有状态变更通过事件广播，模块间零耦合
- **Agent Loop**：`压缩上下文 → 收集通知 → 调用 LLM → 分发工具 → 检查 Todo → 循环`
- **Teammate Loop**：`工作阶段(50轮) → 空闲阶段(轮询收件箱 + 自动认领任务) → 循环`

详细技术规范参见 [PROJECT_SPEC.md](PROJECT_SPEC.md)。