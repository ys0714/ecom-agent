---
name: setup
description: "Interactive project setup wizard for ecom-agent (电商客服 Agent). Guides user through LLM API configuration, dependency installation, build verification, and first run (CLI or HTTP API). Auto-diagnoses and fixes startup failures with up to 3 retry rounds. Use when user says 'setup', 'configure', 'init', '初始化', '环境配置', '项目配置', 'first run', 'get started', 'quick start'."
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

Optional: Redis URL (`REDIS_URL`, defaults to `redis://localhost:6379`).

### Step 3: Install

```bash
npm install
```

### Step 4: Validate

```bash
npx tsc --noEmit        # Type check
npx vitest run           # All 123 tests should pass
```

### Step 5: Run

CLI mode:
```bash
npm run cli
```

HTTP API mode:
```bash
npm run dev
curl http://localhost:3000/health
```

### Step 6: Usage Guide

```
Setup Complete!

CLI:     npm run cli          (interactive dialog)
API:     npm run dev          (Fastify on :3000)
Test:    npm test             (Vitest, 123 tests)
Build:   npm run build        (tsc → dist/)

Endpoints:
  POST /api/conversation    — 对话
  GET  /api/profile/:userId — 查询画像
  GET  /health              — 健康检查

Config:  .env
Data:    ~/.ecom-agent/ (auto-created)
Spec:    PROJECT_SPEC.md
```
