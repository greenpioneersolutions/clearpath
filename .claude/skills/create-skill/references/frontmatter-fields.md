# Frontmatter Fields Reference

Complete YAML frontmatter field reference for Claude Code skills.

All fields are optional except `description` (strongly recommended).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | directory name | Lowercase, hyphens, max 64 chars. Becomes the `/slash-command`. |
| `description` | string | first paragraph | What the skill does and when Claude should use it. Max 250 chars shown in context; front-load the key use case. |
| `argument-hint` | string | -- | Shown in autocomplete. Use `<required>` and `[optional]` notation. |
| `disable-model-invocation` | bool | false | `true` = only user can invoke (hidden from Claude's context). Use for workflows with side effects. |
| `user-invocable` | bool | true | `false` = only Claude can invoke (hidden from `/` menu). Use for background knowledge skills. |
| `allowed-tools` | string or list | -- | Tools pre-approved while skill is active. Space-separated string or YAML list. Does not restrict other tools. |
| `model` | string | session default | Model override: `sonnet`, `opus`, `haiku`, or full model ID. |
| `effort` | string | session default | `low`, `medium`, `high`, `max` (Opus 4.6 only). Overrides session effort level. |
| `context` | string | -- | Set to `fork` to run in isolated subagent context. |
| `agent` | string | general-purpose | Subagent type when `context: fork`. Options: `Explore`, `Plan`, `general-purpose`, or any `.claude/agents/` name. |
| `hooks` | object | -- | Lifecycle hooks scoped to this skill. See hooks documentation. |
| `paths` | string or list | -- | Glob patterns. When set, Claude auto-loads this skill only when working with matching files. |
| `shell` | string | bash | Shell for `!` injection blocks. `bash` (default) or `powershell`. |

---

## Description quality checklist

A good description:
- Starts with an action verb: "Deploy...", "Generate...", "Review...", "Explain..."
- Names the trigger scenario: "Use when fixing GitHub issues", "Activates when working with API routes"
- Is <=250 chars (truncated in Claude's context otherwise)
- Front-loads the key use case -- the first phrase is what Claude matches against

Bad: `"Handles deployment tasks for the application"`
Good: `"Deploy the application to production. Use when you want to ship code. Runs tests, builds, and pushes."`

---

## YAML formatting rules

```yaml
---
name: <skill-name>
description: <front-loaded, <=250 chars -- what it does and the exact trigger phrase>
[argument-hint: <hint>]
[disable-model-invocation: true]
[user-invocable: false]
[allowed-tools: Tool1 Tool2 Bash(pattern *)]
[model: sonnet|opus|haiku]
[effort: low|medium|high|max]
[context: fork]
[agent: Explore|Plan|general-purpose|<custom-agent>]
[paths: "**/*.ts, **/*.tsx"]
---
```

Security restrictions: No XML angle brackets (< >) in frontmatter values. No skills with "claude" or "anthropic" in the name (reserved).
