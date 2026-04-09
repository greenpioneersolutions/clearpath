# Pattern: User-Triggered Task Skill (Side Effects)

**Use when:** The skill has real-world side effects (deploys, commits, pushes, sends messages) that the user must explicitly trigger.

**Key settings:** `disable-model-invocation: true`, `allowed-tools` for pre-approved commands.

---

## Complete SKILL.md

```yaml
---
name: commit
description: Stage and commit current changes with a conventional commit message. Runs lint and tests first.
argument-hint: [scope] [message]
disable-model-invocation: true
allowed-tools: Bash(git *) Bash(npm run lint) Bash(npm test)
---

# Commit

Stage and commit changes following conventional commit format.

## Usage
- `/commit` -- commit all changed files, Claude writes the message
- `/commit feat "add user avatars"` -- commit with provided type and message
- `/commit fix` -- commit with fix type, Claude writes message

## Steps

1. Run `git status` to see what's changed
2. Run `npm run lint` -- stop if it fails, report the errors
3. Run `npm test -- --passWithNoTests` -- stop if any tests fail
4. Determine the conventional commit type from the diff:
   - `feat`: new capability
   - `fix`: bug fix
   - `refactor`: no behavior change
   - `test`: test-only changes
   - `docs`: documentation only
   - `chore`: tooling, config, deps
5. Write a commit message: `<type>(<scope>): <imperative verb> <what>`
   - Max 72 chars on the subject line
   - Use body for "why" when non-obvious
6. Stage all modified files: `git add -A`
7. Commit with the message
8. Show the final `git log --oneline -1`

## If arguments provided
- `$0` = commit type (feat, fix, etc.) -- use it instead of inferring
- `$1` = message -- use it verbatim as the subject (still add type prefix)
```

---

## Why this pattern works

- `disable-model-invocation: true` prevents Claude from auto-committing -- user must type `/commit`
- `allowed-tools` pre-approves git and npm commands so there are no per-use prompts
- Sequential steps with failure gates (lint, tests) before the irreversible action (commit)
- Arguments are optional -- works with zero args or with explicit type/message

---

## Directory structure for this pattern

```
commit/
├── SKILL.md              # Core commit workflow (as above)
├── references/
│   ├── commit-types.md   # Full conventional commit type catalog
│   └── scopes.md         # Project-specific scope conventions
└── scripts/
    └── pre-commit.sh     # Optional pre-commit validation script
```
