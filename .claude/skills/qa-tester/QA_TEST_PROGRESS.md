# QA Test Progress

> Generated: 2026-03-24

> Total: 85 test cases

> PASS: 0 | FAIL: 0 | SKIP: 0 | FIX: 0 | PENDING: 85

<!-- STATUS: PENDING | PASS | FAIL | SKIP | FIX -->

## A. Domain Layer — Types & EventBus

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | A-01 | Message interface shape | |
| PENDING | A-02 | AgentSession interface shape | |
| PENDING | A-03 | Task interface with dependencies | |
| PENDING | A-04 | EventBus subscribe + publish | |
| PENDING | A-05 | EventBus multiple subscribers | |
| PENDING | A-06 | EventBus unsubscribe | |
| PENDING | A-07 | EventBus error isolation | |
| PENDING | A-08 | EventBus async error handling | |

## B. Application Services — TodoManager

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | B-01 | TodoManager create items | |
| PENDING | B-02 | Max 20 items constraint | |
| PENDING | B-03 | Single in_progress constraint | |
| PENDING | B-04 | Content required validation | |
| PENDING | B-05 | hasOpenItems check | |
| PENDING | B-06 | All completed check | |

## C. Application Services — TaskManager

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | C-01 | Create task | |
| PENDING | C-02 | Get task by ID | |
| PENDING | C-03 | Update task status | |
| PENDING | C-04 | Delete task | |
| PENDING | C-05 | Claim task | |
| PENDING | C-06 | Bind/unbind worktree | |
| PENDING | C-07 | BlockedBy cascade | |
| PENDING | C-08 | List all tasks | |

## D. Application Services — MessageBus & Background

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | D-01 | Send and read message | |
| PENDING | D-02 | Inbox drain semantics | |
| PENDING | D-03 | Broadcast message | |
| PENDING | D-04 | Background run | |
| PENDING | D-05 | Background timeout | |
| PENDING | D-06 | Check background | |

## E. Subscribers

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | E-01 | SecurityGuard blocks rm -rf / | |
| PENDING | E-02 | SecurityGuard blocks fork bomb | |
| PENDING | E-03 | SecurityGuard allows safe command | |
| PENDING | E-04 | SecurityGuard write warning | |
| PENDING | E-05 | SecurityGuard tracks reads | |
| PENDING | E-06 | CodeInspector JS syntax check | |
| PENDING | E-07 | CodeInspector JSON check | |
| PENDING | E-08 | CodeInspector queue processing | |
| PENDING | E-09 | SessionLog writes JSONL | |
| PENDING | E-10 | UserProfile extracts language | |
| PENDING | E-11 | UserProfile extracts env | |

## F. Infrastructure Adapters

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | F-01 | safePath blocks traversal | |
| PENDING | F-02 | safePath allows workspace path | |
| PENDING | F-03 | runBash blocks dangerous | |
| PENDING | F-04 | runBash timeout | |
| PENDING | F-05 | runBash output truncation | |
| PENDING | F-06 | runRead publishes event | |
| PENDING | F-07 | runWrite publishes event | |
| PENDING | F-08 | runEdit publishes event | |
| PENDING | F-09 | Compression estimateTokens | |
| PENDING | F-10 | Compression microcompact | |
| PENDING | F-11 | Compression context offloading | |

## G. Worktree Manager

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | G-01 | Create worktree | |
| PENDING | G-02 | Name validation | |
| PENDING | G-03 | List worktrees | |
| PENDING | G-04 | Run command in worktree | |
| PENDING | G-05 | Dangerous command in worktree | |
| PENDING | G-06 | Remove worktree | |
| PENDING | G-07 | Remove + complete task | |
| PENDING | G-08 | Keep worktree | |

## H. Session Manager

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | H-01 | Create session | |
| PENDING | H-02 | Load session from JSONL | |
| PENDING | H-03 | Load latest session | |
| PENDING | H-04 | Resume with --resume flag | |
| PENDING | H-05 | Summary blocks restored | |

## I. CLI Tools

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | I-01 | agent-cli task_create | |
| PENDING | I-02 | agent-cli task_list | |
| PENDING | I-03 | agent-cli send_message | |
| PENDING | I-04 | agent-cli spawn_teammate | |
| PENDING | I-05 | agent-cli plan_request | |
| PENDING | I-06 | generate-schema | |

## J. Security (Adversarial)

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | J-01 | Path traversal with encoded dots | |
| PENDING | J-02 | Command injection via semicolon | |
| PENDING | J-03 | dd command blocked | |
| PENDING | J-04 | mkfs command blocked | |
| PENDING | J-05 | Worktree command injection | |

## K. End-to-End

| Status | ID | Title | Note |
|--------|----|-------|------|
| PENDING | K-01 | Build succeeds | |
| PENDING | K-02 | TypeScript strict check | |
| PENDING | K-03 | Config loads | |
| PENDING | K-04 | EventBus singleton | |
| PENDING | K-05 | Full tool dispatch | |
