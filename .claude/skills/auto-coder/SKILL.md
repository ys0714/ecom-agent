---
name: auto-coder
description: Autonomous spec-driven development agent. Syncs PROJECT_SPEC.md into chapter-based reference files, identifies the next pending task from the schedule, implements code following spec architecture and patterns, runs tests with up to 3 auto-fix rounds, and persists progress with atomic commits. Use when user says "auto code", "自动开发", "自动写代码", "auto dev", "一键开发", "autopilot", or wants fully automated spec-to-code workflow.
---

# Auto Coder

One trigger completes **read spec → find task → code → test → persist progress**.

Optional modifiers: append a task ID (e.g. `auto code P11-1`) to target a specific task, or `--no-commit` to skip git commit.

---

## Pipeline

```
Sync Spec → Find Task → Implement → Test (≤3 fix rounds) → Persist
```

Pause only at the end for commit confirmation. Run everything else autonomously.

> **⚠️ This is a TypeScript / Node.js project. Use `npm run build` to compile, `npm start` to run.**

## Reference Map

All files under `skills/auto-coder/references/`:

| File | Content | When to Read |
|------|---------|-------------|
| `01-overview.md` | Project overview & goals | First task or when needing project context |
| `02-features.md` | Feature specifications | When implementing feature-related tasks |
| `03-tech-stack.md` | Tech stack & dependencies | When choosing libraries or patterns |
| `04-testing.md` | Testing conventions | When writing tests |
| `05-architecture.md` | Architecture & module design | When creating/modifying modules |
| `06-schedule.md` | Task schedule & status | Every cycle (Sync Spec step) |
| `07-future.md` | Future roadmap | When planning or assessing scope |

---

### 1. Sync Spec

```bash
python3 skills/auto-coder/scripts/sync_spec.py
```

Then read the schedule file to get task statuses:
- Read `skills/auto-coder/references/06-schedule.md`

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

1. **Read relevant spec** from `skills/auto-coder/references/`:
   - Architecture: `05-architecture.md`
   - Tech details: `03-tech-stack.md`
   - Testing conventions: `04-testing.md`

2. **Extract** from spec: inputs/outputs, design principles (Event-Driven? DDD?), file list, acceptance criteria.

3. **Plan** files to create/modify before writing any code.

4. **Code** — project-specific rules:
   - Treat spec as single source of truth
   - Use `src/infra/config.ts` constants, never hardcode paths
   - Match existing codebase patterns and style (TypeScript, Clean Architecture)

5. **Write tests** alongside code:
   - Use Vitest or Jest
   - Mock external deps (LLM SDK) in unit tests

6. **Self-review** before running tests: verify all planned files exist and tests import correctly.

---

### 4. Test & Auto-Fix

```
Round 0..2:
  Run test on relevant test file (npm test or npx vitest)
  If pass → go to step 5
  If fail → analyze error, apply fix, re-run

Round 3 still failing → STOP, show failure report to user
```

---

### 5. Persist

1. **Update `PROJECT_SPEC.md`** (global file): change task status marker
2. **Re-sync**: `python3 skills/auto-coder/scripts/sync_spec.py --force`
3. **Show summary & ask**:

```
✅ [P11-1] SecurityGuard 写保护升级 — done
   Files: src/application/subscribers/security-guard-subscriber.ts
   Tests: 5/5 passed
   Commit: feat(security): [P11-1] upgrade write protection to block mode

   "commit" → git add + commit
   "skip"   → end
   "next"   → commit + start next task
```

On "next", loop back to step 1 and start the next task.
