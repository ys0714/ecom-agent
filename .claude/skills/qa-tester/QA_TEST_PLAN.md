# QA Test Plan — ecom-agent

## Test Suites

| ID | Suite | File | Tests | Priority |
|----|-------|------|-------|----------|
| A | Domain types | `tests/domain/types.test.ts` | 9 | P0 |
| B | UserProfileEntity | `tests/domain/user-profile-entity.test.ts` | 9 | P0 |
| C | EventBus | `tests/domain/event-bus.test.ts` | 6 | P0 |
| D | Config | `tests/infra/config.test.ts` | 3 | P1 |
| E | LLM client | `tests/infra/llm.test.ts` | 2 | P1 |
| F | Spec inference | `tests/application/spec-inference.test.ts` | 12 | P0 |
| G | Profile engine | `tests/application/profile-engine.test.ts` | 12 | P0 |
| H | Model slot | `tests/application/model-slot.test.ts` | 8 | P0 |
| I | Workflow | `tests/application/workflow.test.ts` | 12 | P0 |
| J | Workflows extra | `tests/application/workflows-extra.test.ts` | 8 | P1 |
| K | Guardrails | `tests/application/guardrails.test.ts` | 16 | P0 |
| L | Subscribers | `tests/application/subscribers.test.ts` | 10 | P1 |
| M | Data flywheel | `tests/application/data-flywheel.test.ts` | 9 | P1 |
| N | API endpoints | `tests/presentation/api.test.ts` | 7 | P0 |

**Total: 123 tests across 14 files**

## Run Commands

```bash
npx vitest run                    # All tests
npx tsc --noEmit                  # Type check
npx vitest run tests/domain/      # Domain only
```
