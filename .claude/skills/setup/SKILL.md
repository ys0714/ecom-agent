---
name: setup
description: "Interactive project setup wizard for the Multi-Agent Automation Framework (TypeScript). Guides user through Anthropic API key configuration, dependency installation, build verification, and first run. Auto-diagnoses and fixes startup failures with up to 3 retry rounds. Use when user says 'setup', 'set up', 'configure', 'init project', '初始化', '环境配置', '项目配置', 'first run', 'get started', 'quick start', or wants to configure and launch the project from scratch."
---

# Setup

Interactive wizard: check env → configure API → install deps → build → run → auto-fix issues.

---

## Pipeline

```
Preflight → Configure → Install Deps → Build → Validate → Run → Usage Guide
```

> Auto-fix loop: if any step fails, diagnose → fix → retry (≤3 rounds).

---

## Step 1: Preflight Checks

### 1.1 Check Node.js Version

```bash
node --version          # Require >=v16
npm --version
```

If Node.js < v16, stop and inform user to install a supported version.

### 1.2 Check Git Repository

```bash
git rev-parse --is-inside-work-tree
```

Git is required for the Worktree isolation feature.

---

## Step 2: Configure API

### 2.1 Ask for Anthropic API Key

The framework uses the Anthropic Claude API. Ask the user:

1. **Anthropic API Key** — required
2. **Model ID** — optional, default: `claude-3-5-sonnet-20241022`
3. **Custom Base URL** — optional, for proxy/custom endpoints

### 2.2 Create `.env` File

Write the configuration to `.env` in the project root:

```bash
ANTHROPIC_API_KEY=sk-ant-...
MODEL_ID=claude-3-5-sonnet-20241022
# ANTHROPIC_BASE_URL=https://custom-endpoint.example.com
```

### 2.3 Optional: Configure App Name

The `APP_NAME` environment variable controls the agent data directory name (default: `multi-auto-agent`). Most users can skip this.

```bash
# Optional: customize the agent data directory
# APP_NAME=my-custom-agent
```

---

## Step 3: Install Dependencies

```bash
npm install
```

Verify key dependencies:

```bash
node -e "require('@anthropic-ai/sdk'); console.log('Anthropic SDK OK')"
node -e "require('ink'); console.log('Ink OK')"
node -e "require('commander'); console.log('Commander OK')"
```

---

## Step 4: Build

```bash
npm run build
```

This compiles TypeScript to `dist/`. If build fails, enter auto-fix loop.

### Auto-Fix Loop (≤3 rounds)

```
Round 0..2:
  Read error message
  Diagnose root cause (missing type, import error, etc.)
  Fix the issue
  Re-build
  If pass → continue to Step 5
  If fail → next round
```

---

## Step 5: Validate

Test that the agent can start without errors:

```bash
# Quick validation: check that the entry point compiles and imports work
node -e "require('./dist/infra/config'); console.log('Config OK')"
node -e "require('./dist/domain/event-bus'); console.log('EventBus OK')"
```

---

## Step 6: Run

```bash
npm start
```

This launches the interactive TUI (React/Ink terminal UI). The user should see:
- A cyan header: "TypeScript Full Agent Reference Implementation (Ink UI)"
- An input prompt: `s_full >> `
- The agent waiting for user input

To resume a previous session:
```bash
npm start -- --resume
```

---

## Step 7: Usage Guide

After successful launch, present this to the user:

```
Setup Complete!

Quick Start:
  Start agent:       npm start
  Resume session:    npm start -- --resume
  Build:             npm run build

Built-in TUI Commands:
  /compact           Manual context compression
  /tasks             List all tasks
  /team              List all teammates
  /inbox             Check lead inbox
  q / exit / quit    Exit

Configuration:       .env (API keys)
Agent Data:          .multi-auto-agent/ (auto-created)
Skills:              skills/ (SKILL.md files)
Sessions:            ~/.multi-auto-agent/sessions/

Model: {MODEL_ID}
```

Adapt the message based on the user's language (Chinese if user communicates in Chinese).
