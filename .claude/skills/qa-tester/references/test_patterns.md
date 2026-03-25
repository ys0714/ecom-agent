# Test Patterns Reference — Multi-Agent Automation Framework (TypeScript)

> Read this file when writing or executing tests for this project.

---

## Unit Test Patterns

### Basic Template (Vitest)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ModuleName', () => {
  beforeEach(() => {
    // setup
  });

  afterEach(() => {
    // cleanup: remove temp files, reset state
  });

  it('should do expected behavior', () => {
    const result = someFunction();
    expect(result).toBe(expected);
  });
});
```

### EventBus Testing

```typescript
import { InMemoryEventBus, AgentEvent } from '../../src/domain/event-bus';

it('publishes event to subscriber', () => {
  const bus = new InMemoryEventBus<AgentEvent>();
  const received: AgentEvent[] = [];
  bus.subscribe((event) => received.push(event));

  bus.publish({ type: 'tool:call', tool: 'bash', input: { command: 'ls' } });

  expect(received).toHaveLength(1);
  expect(received[0].type).toBe('tool:call');
});
```

### TodoManager Constraint Testing

```typescript
import { TodoManager } from '../../src/application/services/todo-manager';

it('throws on >20 items', () => {
  const todo = new TodoManager();
  const items = Array.from({ length: 21 }, (_, i) => ({
    content: `item ${i}`, status: 'pending', activeForm: 'test'
  }));
  expect(() => todo.update(items)).toThrow('Max 20 todos');
});
```

### SecurityGuard Testing

```typescript
import { SecurityGuardSubscriber } from '../../src/application/subscribers/security-guard-subscriber';

it('blocks dangerous bash command', () => {
  const guard = new SecurityGuardSubscriber();
  const result = guard.validateToolUse('bash', { command: 'rm -rf /' });
  expect(result.allowed).toBe(false);
  expect(result.reason).toContain('sensitive');
});
```

### File System Testing (with temp dirs)

```typescript
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

it('TaskManager persists to disk', () => {
  // Override TASKS_DIR or inject tmpDir into TaskManager
  // Create task, verify JSON file exists
});
```

---

## Integration Test Patterns

### Mock LLM for Agent Loop

```typescript
const mockClient = {
  messages: {
    create: async () => ({
      content: [{ type: 'text', text: 'Hello!' }],
      stop_reason: 'end_turn'
    })
  }
};

// Inject mockClient into Agent instead of real Anthropic client
```

### MessageBus Round-Trip

```typescript
it('send then read drains inbox', () => {
  const bus = new MessageBus();
  bus.send('alice', 'bob', 'hello', 'message');

  const inbox = bus.readInbox('bob');
  expect(inbox).toHaveLength(1);
  expect(inbox[0].content).toBe('hello');

  // Second read should be empty (drain semantics)
  expect(bus.readInbox('bob')).toHaveLength(0);
});
```

### Worktree Lifecycle (requires git repo)

```typescript
// Skip if not in a git repo
const isGitRepo = () => {
  try { execSync('git rev-parse --is-inside-work-tree'); return true; }
  catch { return false; }
};

it.skipIf(!isGitRepo())('creates and removes worktree', async () => {
  // create → verify index.json → run command → remove → verify status
});
```

---

## CLI Test Patterns

### Running CLI Commands

```typescript
import { execSync } from 'child_process';

it('agent-cli task_create works', () => {
  const output = execSync(
    'npx ts-node src/cli/agent-cli.ts task_create --subject "test"',
    { encoding: 'utf-8', cwd: projectRoot }
  );
  const task = JSON.parse(output);
  expect(task.id).toBeGreaterThan(0);
  expect(task.status).toBe('pending');
});
```

---

## Security Test Patterns

### Path Traversal Vectors

Test these inputs against `safePath()`:
- `../../etc/passwd` — basic traversal
- `./src/../../../etc/passwd` — encoded dots
- `/etc/passwd` — absolute path outside workspace
- `src/./../../etc/passwd` — mixed dots

All must throw "Path escapes workspace".

### Dangerous Command Variants

Test these against `runBash()` and `SecurityGuardSubscriber`:
- `rm -rf /` — direct
- `echo hi; rm -rf /` — chained
- `:(){:|:&};:` — fork bomb
- `dd if=/dev/zero of=/dev/sda` — disk wipe
- `mkfs.ext4 /dev/sda1` — format disk
- `sudo anything` — privilege escalation

All must be blocked (not executed).
