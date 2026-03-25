---
name: package
description: "Clean and package the ecom-agent project for distribution. Removes node_modules, dist/, agent data, IDE files, and sanitizes API keys. Use when user says 'package', 'clean', '打包', '清理项目', 'prepare for distribution'."
---

# Package

Clean the project for distribution: remove caches, secrets, build artifacts, and agent data.

## Pipeline

```
Dry-run → Confirm → Execute → Verify
```

## What Gets Removed

| Category | Patterns |
|----------|----------|
| Dependencies | `node_modules/` |
| Build output | `dist/` |
| Agent data | `~/.ecom-agent/`, `.ecom-agent/` |
| IDE files | `.idea/`, `.vscode/`, `*.swp` |
| Coverage | `coverage/` |
| Secrets | `.env` |
| Skill caches | `.claude/skills/auto-coder/.spec_hash` |

## What is NOT Removed

| Category | Reason |
|----------|--------|
| `.claude/skills/` | Skill definitions |
| `src/`, `tests/` | Source code |
| `package.json`, `tsconfig.json` | Config |
| `PROJECT_SPEC.md`, `README.md` | Documentation |
| `.env.example` | Template (no secrets) |

## Execute

```bash
rm -rf node_modules dist coverage .ecom-agent
rm -rf .idea .vscode
find . -name "*.swp" -o -name "*~" | xargs rm -f 2>/dev/null
rm -f .env
rm -f .claude/skills/auto-coder/.spec_hash
```

## Verify

```bash
npm install && npm test && echo "Clean build OK"
```
