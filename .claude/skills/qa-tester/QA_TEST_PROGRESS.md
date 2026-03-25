# QA Test Progress — ecom-agent

| Suite | Status | Tests | Note |
|-------|--------|-------|------|
| A Domain types | PASS | 9/9 | All type assertions verified |
| B UserProfileEntity | PASS | 9/9 | applyDelta, summarize, cold start, roundtrip |
| C EventBus | PASS | 6/6 | Priority, isolation, DLQ, retry |
| D Config | PASS | 3/3 | Defaults, paths, LLM config |
| E LLM client | PASS | 2/2 | Mock response, message passing |
| F Spec inference | PASS | 12/12 | Coverage algorithm, range overlap, best selection |
| G Profile engine | PASS | 12/12 | Order→profile, store CRUD, registry, cold start, e2e |
| H Model slot | PASS | 8/8 | Register, fallback, cache, AB router |
| I Workflow | PASS | 12/12 | Graph step, conditional, intent router, registry |
| J Workflows extra | PASS | 8/8 | AfterSale, Logistics, Complaint, LLMJudge |
| K Guardrails | PASS | 16/16 | Injection, PII, commitment, whitelist, limits |
| L Subscribers | PASS | 10/10 | SessionLog, Metrics, Alert, ConfigWatch |
| M Data flywheel | PASS | 9/9 | Collector, Analyzer, Optimizer, ABExperiment |
| N API endpoints | PASS | 7/7 | Health, conversation, profile, admin, injection block |

**Summary: 123/123 PASS | 0 FAIL | tsc: 0 errors**
