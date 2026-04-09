# Allowed Tools Syntax

Pre-approve tools so Claude can use them without per-use permission prompts when a skill is active.

---

## Syntax options

### Space-separated string
```yaml
allowed-tools: Read Grep Glob Bash(git *) Bash(gh pr *)
```

### YAML list
```yaml
allowed-tools:
  - Read
  - Grep
  - Bash(git add *)
  - Bash(git commit *)
```

---

## Built-in tool names

| Tool | Purpose |
|------|---------|
| `Read` | Read file contents |
| `Write` | Create or overwrite files |
| `Edit` | Edit files with string replacement |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |
| `Bash` | Execute shell commands |
| `WebFetch` | Fetch web pages |
| `WebSearch` | Search the web |
| `TodoWrite` | Manage task lists |
| `Agent` | Spawn subagents |

---

## Glob patterns for Bash

Restrict which shell commands are pre-approved:

```yaml
# Only git commands
allowed-tools: Bash(git *)

# Only specific git subcommands
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *)

# GitHub CLI
allowed-tools: Bash(gh pr *) Bash(gh issue *)

# npm scripts
allowed-tools: Bash(npm run *) Bash(npm test *)

# Python scripts
allowed-tools: Bash(python *)
```

---

## Common tool sets by skill type

| Skill type | Recommended tools |
|------------|-------------------|
| Read-only reference | `Read Grep Glob` |
| File creation/editing | `Read Write Edit Glob` |
| Git operations | `Bash(git *) Read Grep Glob` |
| Deploy/CI | `Bash(git *) Bash(gh *) Bash(npm *)` |
| Research (forked) | `Read Grep Glob WebFetch WebSearch` |
| Full access | `Read Write Edit Glob Grep Bash` |

---

## Important notes

- `allowed-tools` does NOT restrict other tools -- it only pre-approves the listed ones
- Tools not in the list still work, they just require per-use permission
- Keep the list to the minimum needed -- principle of least privilege
