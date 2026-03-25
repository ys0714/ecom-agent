---
name: package
description: "Clean and package the TypeScript multi-agent project for distribution. Removes node_modules, dist/, agent data directories, IDE files, coverage reports, and sanitizes API keys in .env. Produces a minimal, ready-to-share codebase. Use when user says 'package', 'clean project', 'clean up', '打包', '清理项目', '清理缓存', 'prepare for distribution', 'remove caches', or wants to deliver a clean copy of the code."
---

# Package

Clean the project for distribution: remove caches, secrets, build artifacts, and agent data.

---

## Pipeline

```
Dry-run → Confirm → Execute → Verify
```

---

## Step 1: Dry Run

List what would be removed without deleting anything:

```bash
# Preview directories to remove
echo "=== Directories ==="
for d in node_modules dist .multi-auto-agent .tool_outputs coverage .nyc_output; do
  [ -d "$d" ] && du -sh "$d"
done

# Preview files to remove
echo "=== Files ==="
for f in .env .env.local *.log; do
  [ -f "$f" ] && ls -lh "$f"
done

# Preview worktree directories (sibling to project root)
REPO=$(basename "$(pwd)")
[ -d "../${REPO}-worktrees" ] && echo "Worktrees: ../${REPO}-worktrees"
```

Review the output with the user.

## Step 2: Confirm with User

Before executing, summarize what will be deleted and ask the user to confirm. Offer options:
- `--keep-data` — preserve agent data directories (sessions, tasks, team config)
- `--no-sanitize` — skip API key removal from `.env`

## Step 3: Execute

```bash
# === Remove build & dependency artifacts ===
rm -rf node_modules dist

# === Remove agent runtime data ===
rm -rf .multi-auto-agent    # project-level agent data (tasks, team, transcripts, tool-outputs, schemas)

# === Remove worktree directories (sibling to project root) ===
REPO=$(basename "$(pwd)")
rm -rf "../${REPO}-worktrees"

# === Remove IDE and editor files ===
rm -rf .idea .vscode
find . -name "*.swp" -o -name "*.swo" -o -name "*~" | xargs rm -f 2>/dev/null

# === Remove test & coverage artifacts ===
rm -rf coverage .nyc_output

# === Remove secrets ===
rm -f .env .env.local

# === Remove skill caches ===
rm -f skills/auto-coder/.spec_hash
```

With `--keep-data`:
```bash
# Skip: .multi-auto-agent removal
# Skip: worktrees removal
# Still remove: node_modules, dist, IDE files, coverage, secrets, skill caches
```

With `--no-sanitize`:
```bash
# Skip: .env removal
```

## Step 4: Verify

After cleanup, verify the workspace is clean:

```bash
# Check no node_modules remains
[ -d "node_modules" ] && echo "WARN: node_modules still exists" || echo "Clean: node_modules"

# Check no dist remains
[ -d "dist" ] && echo "WARN: dist still exists" || echo "Clean: dist"

# Check no agent data remains
[ -d ".multi-auto-agent" ] && echo "WARN: agent data still exists" || echo "Clean: agent data"

# Check no .env with real keys
[ -f ".env" ] && echo "WARN: .env still exists" || echo "Clean: no .env"

# Check project still compiles after clean + reinstall
npm install && npm run build && echo "Build OK"
```

Report results to user.

---

## What Gets Removed

| Category | Patterns |
|----------|----------|
| Dependencies | `node_modules/` |
| Build output | `dist/` |
| Agent data (project) | `.multi-auto-agent/` (tasks, team, inbox, transcripts, tool-outputs, schemas, worktree-events) |
| Agent data (worktrees) | `../{repo}-worktrees/` |
| IDE files | `.idea/`, `.vscode/`, `*.swp`, `*.swo` |
| Coverage | `coverage/`, `.nyc_output/` |
| Secrets | `.env`, `.env.local` |
| Skill caches | `skills/auto-coder/.spec_hash` |

## What is NOT Removed

| Category | Reason |
|----------|--------|
| `skills/` | User-provided skill definitions |
| `src/` | Source code |
| `package.json`, `tsconfig.json` | Project configuration |
| `PROJECT_SPEC.md`, `README.md` | Documentation |
| `~/.multi-auto-agent/` (global) | Cross-project sessions and user profile (use `--deep-clean` if needed) |

## Global Data (optional deep clean)

The agent stores cross-project data in `~/.multi-auto-agent/` (or `$AGENT_HOME`):
- `sessions/` — conversation logs
- `user-profile.json` — learned user preferences

To remove global data:
```bash
rm -rf ~/.multi-auto-agent
```

This is NOT done by default since it affects all projects.
