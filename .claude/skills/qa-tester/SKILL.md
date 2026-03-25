---
name: qa-tester
description: "Fully autonomous QA testing agent for ecom-agent (电商客服 Agent). Executes test suites via Vitest, validates type safety, tests API endpoints, verifies guardrails, and checks EventBus subscriber behavior. Diagnoses failures, applies fixes with up to 3 retry rounds. Use when user says 'run QA', 'QA test', 'QA 测试', '执行测试', '跑测试', 'test and fix', or wants to run the full test suite."
---

# QA Tester

Fully automated testing — run all suites, diagnose failures, auto-fix.

Optional: append section letter (`run QA B`) or test file (`run QA guardrails`).

---

## Pipeline (strictly serial)

```
1. Pick ONE test suite
2. Run: npx vitest run <test-file>
3. Verify pass/fail from actual output
4. Fix if needed (≤3 rounds)
5. Record result, move to next
```

## Test Categories

| Section | Scope | Test File(s) | Key Assertions |
|---------|-------|-------------|----------------|
| A | Domain types & entity | `tests/domain/types.test.ts`, `tests/domain/user-profile-entity.test.ts` | Type correctness, applyDelta, summarizeForPrompt, cold start transitions |
| B | EventBus | `tests/domain/event-bus.test.ts` | Priority dispatch, error isolation, dead letter queue, retry by level |
| C | Config | `tests/infra/config.test.ts` | Default values, path structure, LLM config |
| D | LLM client | `tests/infra/llm.test.ts` | Mock response, message passing |
| E | Spec inference | `tests/application/spec-inference.test.ts` | Coverage algorithm, range overlap, best spec selection |
| F | Profile engine | `tests/application/profile-engine.test.ts` | Order→profile build, ProfileStore CRUD, DimensionRegistry, ColdStartManager |
| G | Model slot | `tests/application/model-slot.test.ts` | Slot register/infer, fallback, InferenceCache, ABRouter |
| H | Workflow | `tests/application/workflow.test.ts`, `tests/application/workflows-extra.test.ts` | Graph step, conditional edges, IntentRouter, all 4 workflows |
| I | Guardrails | `tests/application/guardrails.test.ts` | Injection block, PII masking, commitment block, tool whitelist |
| J | Subscribers | `tests/application/subscribers.test.ts` | SessionLog JSONL, MetricsSubscriber, AlertSubscriber, ConfigWatch |
| K | Data flywheel | `tests/application/data-flywheel.test.ts` | BadCase collect/cluster, PromptOptimizer, ABExperiment Z-test |
| L | API endpoints | `tests/presentation/api.test.ts` | Health, conversation, profile, admin, injection block |

## Commands

```bash
# Full suite
npx vitest run

# Type check
npx tsc --noEmit

# Single file
npx vitest run tests/application/guardrails.test.ts

# Watch mode
npx vitest
```

## Pass Criteria

- All 123+ tests pass (exit code 0)
- `tsc --noEmit` reports 0 errors
- No `console.error` leaks in test output (mocked where needed)
