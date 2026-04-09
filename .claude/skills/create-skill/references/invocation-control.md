# Invocation Control

How to control who can invoke a skill and when it loads into Claude's context.

---

## Invocation matrix

| Frontmatter | User can invoke | Claude can invoke | In context |
|-------------|:-:|:-:|:-:|
| (default) | yes | yes | description always loaded |
| `disable-model-invocation: true` | yes | no | not loaded |
| `user-invocable: false` | no | yes | description always loaded |

---

## Choosing the right mode

| Scenario | Setting |
|----------|---------|
| Side effects (deploy, commit, push, send) -- user must trigger | `disable-model-invocation: true` |
| Background knowledge, style guides, conventions | `user-invocable: false` |
| Utility Claude should auto-apply when relevant | default (both can invoke) |

---

## Path-based auto-loading

Use the `paths` field to limit when Claude auto-loads a skill:

```yaml
paths: "src/api/**, src/routes/**, **/*.openapi.yaml"
```

When set, Claude loads the skill automatically **only** when working with files matching the patterns. This prevents irrelevant skills from consuming context.

---

## Context loading behavior

- In a regular session: skill **descriptions** are loaded into context so Claude knows what's available, but full skill content only loads when invoked.
- Subagents with preloaded skills: full skill content is injected at startup.
- Auto-compaction preserves the latest invocation of each skill.
- If the same skill is invoked twice, only the latest copy survives compaction.

---

## Restricting Claude's skill access

Three ways to control which skills Claude can invoke:

1. **Disable all skills** by denying the Skill tool in `/permissions`
2. **Allow or deny specific skills** using permission rules: `Skill(commit)`, `Skill(review-pr *)`, `Skill(deploy *)`
3. **Hide individual skills** by adding `disable-model-invocation: true` to their frontmatter

---

## Description budget

Skill descriptions are loaded into context so Claude knows what's available. The budget scales dynamically at 1% of the context window, with a fallback of 8,000 characters. Each entry is capped at 250 characters regardless of budget. To raise the limit, set the `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable.
