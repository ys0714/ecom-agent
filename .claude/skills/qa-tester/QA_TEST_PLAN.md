# QA Test Plan — Multi-Agent Automation Framework (TypeScript)

> **Version**: 1.0
> **Date**: 2026-03-24
> **Scope**: Domain types, EventBus, Application services, Subscribers, Infrastructure adapters, CLI tools, TUI, Security, End-to-End
> **Environment**: macOS/Linux/Windows, Node.js ≥ v16, TypeScript 5.7

---

## A. Domain Layer — Types & EventBus

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| A-01 | Message interface shape | Create Message object with all fields | role, content, toolCallId, toolName, toolCalls fields exist |
| A-02 | AgentSession interface shape | Create AgentSession with id, messages, summaries, compressedCount | All fields accessible, summaries is array, compressedCount is number |
| A-03 | Task interface with dependencies | Create Task with blockedBy and blocks arrays | Dependency arrays work correctly |
| A-04 | EventBus subscribe + publish | Subscribe handler, publish event | Handler receives event with correct type and payload |
| A-05 | EventBus multiple subscribers | Subscribe 3 handlers, publish 1 event | All 3 handlers called |
| A-06 | EventBus unsubscribe | Subscribe, get unsub fn, call it, publish | Handler NOT called after unsubscribe |
| A-07 | EventBus error isolation | One subscriber throws, one succeeds | Non-throwing subscriber still executes |
| A-08 | EventBus async error handling | Subscriber returns rejected Promise | No unhandled rejection, other subscribers unaffected |

---

## B. Application Services — TodoManager

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| B-01 | TodoManager create items | Call update() with 3 items | render() shows 3 items with correct marks |
| B-02 | Max 20 items constraint | Call update() with 21 items | Throws "Max 20 todos" error |
| B-03 | Single in_progress constraint | Call update() with 2 in_progress items | Throws "Only one in_progress allowed" error |
| B-04 | Content required validation | Call update() with empty content | Throws "content required" error |
| B-05 | hasOpenItems check | Create items with mixed status | Returns true when non-completed items exist |
| B-06 | All completed check | Create items all completed | hasOpenItems() returns false |

---

## C. Application Services — TaskManager

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| C-01 | Create task | Call create("Test subject") | JSON file created in TASKS_DIR, id > 0, status = pending |
| C-02 | Get task by ID | Create task, then get(id) | Returns correct task JSON |
| C-03 | Update task status | Create task, update to completed | Status changes, blockedBy cascaded |
| C-04 | Delete task | Create task, update to deleted | JSON file removed from disk |
| C-05 | Claim task | Create task, claim with owner | status = in_progress, owner set |
| C-06 | Bind/unbind worktree | Create task, bind worktree name | worktree field set, unbind clears it |
| C-07 | BlockedBy cascade | Create A blocked by B, complete B | A.blockedBy no longer contains B.id |
| C-08 | List all tasks | Create 3 tasks | listAll() shows all 3 with correct marks |

---

## D. Application Services — MessageBus & Background

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| D-01 | Send and read message | send() then readInbox() | Message received with correct fields |
| D-02 | Inbox drain semantics | readInbox() twice | Second read returns empty array |
| D-03 | Broadcast message | broadcast() to 3 names | Each recipient has message in inbox |
| D-04 | Background run | Run simple echo command | Task ID returned, drain() gets result |
| D-05 | Background timeout | Run sleep command with 1s timeout | Task status = error after timeout |
| D-06 | Check background | Run task, check by ID | Returns status and output |

---

## E. Subscribers

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| E-01 | SecurityGuard blocks rm -rf / | validateToolUse('bash', {command: 'rm -rf /'}) | allowed = false, reason contains "sensitive" |
| E-02 | SecurityGuard blocks fork bomb | validateToolUse('bash', {command: ':(){:|:&};:'}) | allowed = false |
| E-03 | SecurityGuard allows safe command | validateToolUse('bash', {command: 'ls -la'}) | allowed = true |
| E-04 | SecurityGuard write warning | Publish file:write without prior file:read | Console warning logged |
| E-05 | SecurityGuard tracks reads | Publish file:read for path X, then validateWrite(X) | No warning (file was read) |
| E-06 | CodeInspector JS syntax check | Publish file:write for .js with syntax error | drain() returns error with file path |
| E-07 | CodeInspector JSON check | Publish file:write for .json with invalid JSON | drain() returns parse error |
| E-08 | CodeInspector queue processing | Write 3 files rapidly | All 3 inspected, results drainable |
| E-09 | SessionLog writes JSONL | Publish message:sent event | Session file has new JSONL line |
| E-10 | UserProfile extracts language | Publish user message with Chinese chars | preferredLanguage = zh-CN |
| E-11 | UserProfile extracts env | Publish message mentioning "macOS zsh pnpm" | environment fields populated |

---

## F. Infrastructure Adapters

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| F-01 | safePath blocks traversal | Call safePath('../../etc/passwd') | Throws "Path escapes workspace" error |
| F-02 | safePath allows workspace path | Call safePath('src/index.tsx') | Returns resolved path under WORKDIR |
| F-03 | runBash blocks dangerous | Call runBash('rm -rf /') | Returns error string, does not execute |
| F-04 | runBash timeout | Call runBash('sleep 10', timeout=1000) | Returns timeout error within ~1s |
| F-05 | runBash output truncation | Run command producing >50KB output | Output truncated to 50000 chars |
| F-06 | runRead publishes event | Call runRead on existing file | file:read event published on EventBus |
| F-07 | runWrite publishes event | Call runWrite to create file | file:write event published, file exists on disk |
| F-08 | runEdit publishes event | Call runEdit to replace text | file:edit event published, text replaced |
| F-09 | Compression estimateTokens | Call estimateTokens on messages | Returns number ≈ JSON.stringify(msgs).length / 4 |
| F-10 | Compression microcompact | Feed >3 tool_results | Old results cleared, recent 3 kept |
| F-11 | Compression context offloading | Feed messages >100K chars | Large tool outputs offloaded to disk |

---

## G. Worktree Manager

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| G-01 | Create worktree | Call create('test-wt') | index.json updated, branch wt/test-wt created |
| G-02 | Name validation | Call create('invalid name!!') | Throws validation error |
| G-03 | List worktrees | Create 2 worktrees, call listAll() | Both shown with active status |
| G-04 | Run command in worktree | Create wt, run 'echo hello' | Output = "hello" |
| G-05 | Dangerous command in worktree | Run 'rm -rf /' in worktree | Returns "Error: Dangerous command blocked" |
| G-06 | Remove worktree | Create then remove | index.json status = removed |
| G-07 | Remove + complete task | Create wt bound to task, remove with complete_task=true | Task status = completed, worktree removed |
| G-08 | Keep worktree | Create then keep | index.json status = kept |

---

## H. Session Manager

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| H-01 | Create session | Call createSession() | Returns AgentSession with id, empty messages |
| H-02 | Load session from JSONL | Write JSONL with messages, call load(id) | Messages restored correctly |
| H-03 | Load latest session | Create 2 sessions, call loadLatest() | Returns the newer session |
| H-04 | Resume with --resume flag | Start with --resume, verify latest loaded | Previous messages visible |
| H-05 | Summary blocks restored | Write JSONL with summary records | summaries array and compressedCount restored |

---

## I. CLI Tools

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| I-01 | agent-cli task_create | Run `npx ts-node src/cli/agent-cli.ts task_create --subject "test"` | Task JSON printed, file created |
| I-02 | agent-cli task_list | Create tasks, run task_list | All tasks listed with marks |
| I-03 | agent-cli send_message | Run send_message --to lead --content "hello" | "Sent message to lead" |
| I-04 | agent-cli spawn_teammate | Run spawn_teammate --name t1 --role dev --prompt "test" | "Spawned 't1'" with PID |
| I-05 | agent-cli plan_request | Run plan_request --plan "my plan" | Request ID returned |
| I-06 | generate-schema | Run with --description "a list of names" | JSON Schema file created in SCHEMAS_DIR |

---

## J. Security (Adversarial)

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| J-01 | Path traversal with encoded dots | safePath('./src/../../../etc/passwd') | Blocked |
| J-02 | Command injection via semicolon | runBash('echo hi; rm -rf /') | Entire command blocked (contains pattern) |
| J-03 | dd command blocked | runBash('dd if=/dev/zero of=/dev/sda') | Blocked by SecurityGuard |
| J-04 | mkfs command blocked | runBash('mkfs.ext4 /dev/sda1') | Blocked by SecurityGuard |
| J-05 | Worktree command injection | worktree_run('test', 'sudo rm -rf /') | Blocked by dangerous command check |

---

## K. End-to-End

| ID | Title | Steps | Expected Result |
|----|-------|-------|-----------------|
| K-01 | Build succeeds | Run `npm run build` | Exit 0, dist/ directory created |
| K-02 | TypeScript strict check | Run `npx tsc --noEmit` | Exit 0, no type errors |
| K-03 | Config loads | Import config.ts, verify all constants defined | APP_NAME, WORKDIR, GLOBAL_DIR, AGENT_DIR all non-empty strings |
| K-04 | EventBus singleton | Import eventBus from two files | Same instance (===) |
| K-05 | Full tool dispatch | Mock LLM returning bash tool_use | Agent executes bash, returns result, publishes events |
