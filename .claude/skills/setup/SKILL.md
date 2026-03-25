---
name: setup
description: "Interactive project setup wizard for ecom-agent (电商客服 Agent). Guides user through LLM API configuration, dependency installation, build verification, and first run (CLI, HTTP API, Dashboard). Auto-diagnoses and fixes startup failures with up to 3 retry rounds. Use when user says 'setup', 'configure', 'init', '初始化', '环境配置', '项目配置', 'first run', 'get started', 'quick start'."
---

# Setup

Interactive wizard: check env → configure LLM → install deps → build → validate → run.

---

## Pipeline

```
Preflight → Configure → Install → Validate → Run → Usage Guide
```

> Auto-fix loop: if any step fails, diagnose → fix → retry (≤3 rounds).

### Step 1: Preflight

```bash
node --version          # Require >=v18
npm --version
python3 --version       # For Streamlit Dashboard (optional)
```

### Step 2: Configure LLM

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Ask user for:
1. **LLM API endpoint** — `LLM_BASE_URL` (e.g. `https://api.deepseek.com/v1` or local vLLM)
2. **API Key** — `LLM_API_KEY`
3. **Model ID** — `LLM_MODEL_ID` (e.g. `deepseek-chat`, `qwen3-8b-rl`)

Optional:
- Redis URL (`REDIS_URL`, defaults to `redis://localhost:6379`)
- OTel enable (`OTEL_ENABLED=true`, auto-instruments HTTP/Redis)

### Step 3: Install

```bash
npm install

# Optional: Streamlit Dashboard
pip install -r dashboard/requirements.txt
```

### Step 4: Validate

```bash
npx tsc --noEmit        # Type check
npx vitest run           # All 195 tests should pass
```

### Step 5: Run

CLI mode:
```bash
npm run cli
```

HTTP API mode:
```bash
npm run dev              # Fastify on :3000 + Prometheus on :9464
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```

Dashboard:
```bash
streamlit run dashboard/app.py    # Streamlit on :8501
```

### Step 6: Usage Guide

```
Setup Complete!

Node.js Services:
  CLI:       npm run cli             (interactive dialog)
  API:       npm run dev             (Fastify :3000 + OTel Prometheus :9464)
  Test:      npm test                (Vitest, 195 tests)
  Build:     npm run build           (tsc → dist/)

Dashboard:
  streamlit run dashboard/app.py    (Streamlit :8501)

API Endpoints:
  GET  /health                      — 深度健康检查（Redis/LLM/disk）
  GET  /metrics                     — Prometheus 格式指标
  POST /api/conversation            — 对话（Guardrails + 解释性 + 偏好仲裁）
  GET  /api/profile/:userId         — 查询画像
  GET  /api/metrics                 — JSON 业务指标
  GET  /api/admin/status            — 系统状态
  GET  /api/admin/config/audit      — 配置审计日志
  POST /api/admin/config/rollback   — 配置回滚
  POST /api/admin/flywheel/trigger  — 手动触发飞轮

Config:  .env
Data:    ~/.ecom-agent/ (auto-created)
Spec:    PROJECT_SPEC.md
```
