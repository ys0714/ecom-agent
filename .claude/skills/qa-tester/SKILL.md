---
name: qa-tester
description: "Fully autonomous QA testing agent for Multi-Agent Automation Framework (TypeScript). Executes test categories automatically — unit tests via Vitest/Jest, integration tests with mock LLM, TUI smoke tests, CLI tool validation, EventBus subscriber verification, and security guard bypass attempts. Diagnoses failures, applies fixes with up to 3 retry rounds, and records results in skills/qa-tester/QA_TEST_PROGRESS.md. Use when user says 'run QA', 'QA test', 'QA 测试', '执行测试', '跑测试', 'test and fix', or wants to execute QA test plan."
---

# QA Tester

All test types (Unit / Integration / CLI / Security) are **fully automated** — zero human intervention.

Optional modifiers: append section letter (`run QA B`) or test ID (`run QA B-01`).

---

> ## IRON RULES
>
> ### Rule 1: STRICTLY SERIAL
> Pick ONE test → Run ONE command → Wait for output → Record ONE row in `skills/qa-tester/QA_TEST_PROGRESS.md` → THEN pick next.
> NEVER run two tests in one command. NEVER record two rows in one file edit.
>
> ### Rule 2: PASS = TERMINAL OUTPUT EVIDENCE
> Pass means you ran a command **in THIS session** and the Note contains **concrete values** from that output.
> No terminal output for THIS test → mark pending. NEVER pass.
>
> ### Rule 3: ZERO INFERENCE
> **BANNED Note patterns**: "Code uses…", "Should work…", "Expected behavior…", "Parameter accepted"
> If you didn't run a command and see output for THIS test, mark pending.
>
> ### Rule 4: ADVERSARIAL MINDSET
> Find bugs, not confirmations.

---

## Pipeline (strictly serial)

```
1. Pick ONE pending test (by ID order)
2. Set system state if needed
3. Run ONE command — WAIT for output
4. Verify ALL assertions from Expected Result vs ACTUAL output
5. Fix if needed (≤3 rounds)
6. GATE: Edit skills/qa-tester/QA_TEST_PROGRESS.md (row + counters) — ONE row per edit
7. Only NOW return to step 1
```

---

## Step 1: Pick Target

1. Read `skills/qa-tester/QA_TEST_PLAN.md` for test steps and expected results.
2. Read `skills/qa-tester/QA_TEST_PROGRESS.md` for current status.
3. User-specified section/ID → scope to that. Otherwise → first pending test.
4. Execute in section order, within section in ID order.

### Test Categories

| Sections | Type | Execution Method |
|----------|------|-----------------|
| A | Domain Layer | Unit tests: types, EventBus, user-profile |
| B | Application Services | Unit tests: TodoManager, TaskManager, BackgroundManager, MessageBus, SkillLoader |
| C | Subscribers | Unit tests: SecurityGuard, CodeInspector, SessionLog, UserProfile subscribers |
| D | Infrastructure | Unit tests: safePath, shell interception, compression algorithms |
| E | Agent Loop | Integration tests: mock LLM + tool dispatch + context building |
| F | Multi-Agent | Integration tests: Teammate spawn, MessageBus send/receive, auto-claim |
| G | Worktree | Integration tests: create/run/remove lifecycle, Task binding |
| H | Session | Integration tests: create/save/load/resume, JSONL format |
| I | CLI Tools | CLI tests: agent-cli subcommands, run-teammate, generate-schema |
| J | TUI Components | Smoke tests: App/Chat/Input/Status render without crash |
| K | Security | Adversarial: path traversal, dangerous commands, fork bomb patterns |
| L | End-to-End | Full pipeline: start → input → tool_use → result → persist |

---

## Step 2: Set System State

```bash
# Clean agent data directory
rm -rf .multi-auto-agent/

# Ensure build is fresh
npm run build

# Verify TypeScript compiles
npx tsc --noEmit
```

---

## Step 3: Execute & Verify

### Unit Tests (A, B, C, D)

```bash
# Run specific test file
npx vitest run tests/unit/test_todo_manager.test.ts

# Run all unit tests
npx vitest run tests/unit/
```

Verify: exit code 0, all assertions pass, no uncaught exceptions.

### Integration Tests (E, F, G, H)

```bash
# Run with mock LLM (no real API calls)
npx vitest run tests/integration/test_agent_loop.test.ts
```

Key verifications:
- **Agent Loop**: LLM mock returns tool_use → tool executes → result collected → loop continues
- **Multi-Agent**: Teammate process spawns, MessageBus JSONL written/read, auto-claim works
- **Worktree**: git worktree add/remove succeeds, index.json updated, Task binding correct
- **Session**: JSONL append works, loadLatest finds correct file, resume restores messages

### CLI Tests (I)

```bash
# Test agent-cli subcommands
npx ts-node src/cli/agent-cli.ts task_create --subject "Test task"
npx ts-node src/cli/agent-cli.ts task_list
npx ts-node src/cli/agent-cli.ts task_update --id 1 --status completed
```

Verify: each command exits 0, output matches expected format.

### Security Tests (K)

```bash
# Path traversal — should be blocked by safePath()
node -e "const {safePath} = require('./dist/infra/adapters/file-system'); try { safePath('../../etc/passwd'); console.log('FAIL: not blocked') } catch(e) { console.log('PASS:', e.message) }"

# Dangerous command — should be blocked
node -e "const {runBash} = require('./dist/infra/adapters/shell'); runBash('rm -rf /').then(r => console.log(r))"
```

---

## Step 4: Fix & Retry (≤3 rounds)

1. **Diagnose**: code bug / config issue / missing dependency / test plan error?
2. **Fix**: minimal change only. Record file/line in Note.
3. **Retry**: re-run same command.
4. After 3 failed rounds → mark failed with detailed notes.
5. If fix touches shared code → re-run previously-passed tests in same section.

---

## Step 5: Record Results

**GATE — do this BEFORE picking the next test.**

Edit `skills/qa-tester/QA_TEST_PROGRESS.md`: update ONE test row + summary counters. ONE row per file edit.

### Pass Requirements

All must be true:
1. Ran the command **in this session**
2. Observed actual output **from that command**
3. Verified **every** assertion in Expected Result
4. Note contains **concrete values** from terminal output

### Status Icons

| Icon | Meaning |
|------|---------|
| PASS | All assertions verified against actual output |
| FAIL | Failed after 3 fix attempts |
| SKIP | Requires specific environment not available |
| FIX | Fix applied — needs re-test |
| PENDING | Not yet tested |

---

## Key Paths

| File | Purpose |
|------|---------|
| `skills/qa-tester/QA_TEST_PLAN.md` | Test steps and expected results |
| `skills/qa-tester/QA_TEST_PROGRESS.md` | Execution status and notes |
| `src/infra/config.ts` | All path constants |
| `src/application/agent.ts` | Agent main loop |
| `src/application/tools.ts` | Tool schema definitions |
| `src/domain/event-bus.ts` | Event types and bus |
| `src/application/subscribers/` | Security, inspector, session, profile subscribers |
| `src/infra/adapters/` | Shell, file-system, compression, LLM adapters |
| `src/cli/` | CLI tools (agent-cli, run-teammate, generate-schema) |
