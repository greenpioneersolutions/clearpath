---
name: file-bug
description: Review bugs in bugs/open/, verify each is still present, create GitHub issues at greenpioneersolutions/clearpath with proper labels, and move files to bugs/migrated/ or bugs/closed/. Use when user mentions GitHub issues, or bug creation. Invoke: /file-bug
allowed-tools: Read Glob Grep Bash Write Edit
---

# File Bug Reports

This skill processes bug reports from `bugs/open/`, verifies each is still present in the codebase, creates properly labelled GitHub issues, and moves the bug file to `bugs/migrated/` or `bugs/closed/`.

## Usage

```
/file-bug
```

Run from the repo root. Processes all `.md` files in `bugs/open/`. Use parallel sub-agents for speed when there are many bugs.

## Bug File Format

Bug reports live in `bugs/open/BUG-NNN-slug.md`. The filename encodes the bug ID and a short slug. Each file contains:

- **Title** — `# BUG-NNN: Short description`
- **File/Severity/Discovered** — metadata header block
- **Symptom** — what goes wrong (error messages, wrong output)
- **Root Cause** — why it happens
- **Recommended Fix** — concrete code change (if known)

## Labels

Every GitHub issue must receive these labels. Create any missing labels before filing.

| Label | When to apply |
|-------|--------------|
| `bug` | Always |
| `ai-discovered` | Always (these bugs come from AI code analysis) |
| `severity: high` | Crash, data loss, security risk, broken core feature |
| `severity: medium` | Incorrect behavior, test infrastructure failures, logic errors |
| `severity: low` | Code quality, dead code, minor performance, consistency |
| `security` | Any SSRF, injection, auth bypass, or other security concern |

## Process

### Step 1 — Verify each bug

For each file in `bugs/open/`:

1. Read the bug file to identify the source file and check to perform
2. Read the relevant source file at the path listed in the bug
3. Confirm whether the described code pattern still exists
4. Mark as **still present** or **already fixed**

### Step 2 — Create GitHub issues (still present only)

Use `gh issue create --repo greenpioneersolutions/clearpath`:

```bash
gh issue create \
  --repo greenpioneersolutions/clearpath \
  --title "<concise title>" \
  --body "$(cat <<'EOF'
## Summary
<1-2 sentences>

## Location
`path/to/file.ts` — function or line reference

## Symptom
<what goes wrong>

## Root Cause
<why it happens>

## Suggested Fix
<code snippet or approach>

## Discovered During
AI-assisted unit test coverage initiative, April 2026
EOF
)"
```

Then apply labels in one call:

```bash
gh issue edit <NUMBER> \
  --repo greenpioneersolutions/clearpath \
  --add-label "bug,ai-discovered,severity: <high|medium|low>[,security]"
```

### Step 3 — Move bug files

```bash
# If still present → migrated
mv bugs/open/BUG-NNN-slug.md bugs/migrated/

# If already fixed → closed
mv bugs/open/BUG-NNN-slug.md bugs/closed/
```

## Severity Guide

| Severity | Examples |
|----------|---------|
| **high** | Component crash on render, SSRF/auth bypass, data never persisted |
| **medium** | Wrong interval returned (affects missed-run detection), env var leaks between tests, IPC handler silently saves invalid data |
| **low** | Unused variable, dead code, `require()` instead of `import`, minor perf anti-pattern |

## Reference materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/labels.md](references/labels.md) | Full label list with colors, descriptions, and usage rules | Creating or auditing labels |
| [references/issue-template.md](references/issue-template.md) | Complete GitHub issue body template | Writing issue body copy |
