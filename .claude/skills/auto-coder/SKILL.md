---
name: auto-coder
description: Autonomous spec-driven development agent for ecom-agent (电商客服 Agent). Syncs PROJECT_SPEC.md into chapter-based reference files, identifies the next pending task from the MVP schedule, implements code following spec architecture and patterns, runs tests with up to 3 auto-fix rounds, and persists progress with atomic commits. Use when user says "auto code", "自动开发", "自动写代码", "auto dev", "一键开发", "autopilot", "继续开发", or wants fully automated spec-to-code workflow.
---

# Auto Coder

One trigger completes **read spec → find task → code → test → persist progress**.

Optional modifiers: append a task ID (e.g. `auto code M2-3`) to target a specific task, or `--no-commit` to skip git commit.

---

## Pipeline

```
Sync Spec → Find Task → Implement → Test (≤3 fix rounds) → Persist
```

Pause only at the end for commit confirmation. Run everything else autonomously.

> **⚠️ This is a TypeScript / Node.js ESM project. Use `npm run lint` to type-check, `npm test` to run Vitest, `npm run dev` to start.**

## Reference Map

All files under `.claude/skills/auto-coder/references/`:

| File | Content | When to Read |
|------|---------|-------------|
| `01-overview.md` | Project overview & goals | First task or when needing project context |
| `02-features.md` | Feature specifications (画像引擎, 模型槽位, Workflow, Guardrails, 飞轮) | When implementing feature-related tasks |
| `03-tech-stack.md` | Tech stack & dependencies (Fastify, OpenAI SDK, cockatiel, neverthrow) | When choosing libraries or patterns |
| `04-testing.md` | Testing conventions (Vitest, mock patterns, SLO) | When writing tests |
| `05-architecture.md` | Architecture & module design (4-layer, DI, error handling) | When creating/modifying modules |
| `06-schedule.md` | Task schedule & status (MVP-1/2/3 + Phase 4-7) | Every cycle (Sync Spec step) |
| `07-future.md` | Future roadmap (冲突仲裁, 分层记忆, Prompt Engine) | When planning or assessing scope |

---

### 1. Sync Spec

```bash
python3 .claude/skills/auto-coder/scripts/sync_spec.py
```

Then read the schedule file to get task statuses:
- Read `.claude/skills/auto-coder/references/06-schedule.md`

Task markers:

| Marker | Status |
|--------|--------|
| `✅` | Completed |
| `🔧` | Needs optimization |
| `📋` | Not yet implemented |

---

### 2. Find Task

Pick the first `🔧` (needs optimization) task, then the first `📋` (not yet implemented). If user specified a task ID, use that directly.

Quick-check predecessor artifacts exist (file-level only). On mismatch, log a warning and continue — only stop if the target task itself is blocked.

---

### 3. Implement

1. **Read relevant spec** from `.claude/skills/auto-coder/references/`:
   - Architecture: `05-architecture.md`
   - Tech details: `03-tech-stack.md`
   - Testing conventions: `04-testing.md`

2. **Extract** from spec: inputs/outputs, design principles, file list, acceptance criteria.

3. **Plan** files to create/modify before writing any code.

4. **Code** — project-specific rules:
   - Treat spec as single source of truth
   - Use `src/infra/config.ts` constants, never hardcode paths
   - ESM imports: always use `.js` extension in import paths
   - Match existing codebase patterns (TypeScript strict, Clean Architecture)
   - Use `neverthrow` Result type for error handling where appropriate
   - Use `cockatiel` for resilience (retry, circuit breaker, timeout)
   - Hand-wired DI in `src/main.ts` (Composition Root), no DI framework

5. **Write tests** alongside code:
   - Use Vitest (`npx vitest run`)
   - Mock external deps (LLM, Redis) using `InMemoryRedisClient` or `vi.fn()`
   - Tests go in `tests/` mirroring `src/` structure

6. **Self-review** before running tests: verify all planned files exist and tests import correctly.

---

### 4. Test & Auto-Fix

```
Round 0..2:
  Run: npx vitest run
  Also: npx tsc --noEmit
  If pass → go to step 5
  If fail → analyze error, apply fix, re-run

Round 3 still failing → STOP, show failure report to user
```

---

### 5. Persist

1. **Update `PROJECT_SPEC.md`** (global file): change task status marker `📋` → `✅`
2. **Re-sync**: `python3 .claude/skills/auto-coder/scripts/sync_spec.py --force`
3. **Show summary & ask**:

```
✅ [M2-3] 商品服务适配器 — done
   Files: src/infra/adapters/product-service.ts
   Tests: 53/53 passed
   Commit: feat(m2-3): product service adapter with mock data

   "commit" → git add + commit
   "skip"   → end
   "next"   → commit + start next task
```

On "next", loop back to step 1 and start the next task.
