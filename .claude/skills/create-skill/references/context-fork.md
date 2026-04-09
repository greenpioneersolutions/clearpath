# Context Fork Patterns

Run skills in isolated subagent contexts using `context: fork`.

---

## How it works

When `context: fork` is set, the skill content becomes the subagent's task prompt. The subagent does **not** have your conversation history. It receives:
- The SKILL.md content as its task
- CLAUDE.md project instructions
- Its own system prompt (based on agent type)

---

## Available agent types

| Agent | Best for | Tools |
|-------|----------|-------|
| `Explore` | Fast read-only codebase analysis | Read, Grep, Glob (no write) |
| `Plan` | Architecture and implementation planning | Read, Grep, Glob (no write) |
| `general-purpose` | Full tool access (default) | All tools |
| Custom agent | Specialized behavior | As defined in `.claude/agents/` |

---

## When to use context: fork

- **Isolated research** -- read-only investigation that shouldn't pollute the main conversation
- **One-shot tasks** -- discrete tasks with a clear deliverable
- **Long multi-step workflows** -- complex work that benefits from fresh context
- **Parallel work** -- multiple skills running simultaneously

---

## When NOT to use context: fork

- **Standing guidelines** -- conventions and style guides that apply throughout the session
- **Background knowledge** -- reference material Claude should internalize
- **Interactive workflows** -- tasks requiring back-and-forth with the user

Only use `context: fork` for skills with explicit task instructions. Guidelines-only content produces no output in a forked subagent.

---

## Fork vs inline comparison

| Approach | System prompt | Task | Also loads |
|----------|--------------|------|------------|
| Skill with `context: fork` | From agent type | SKILL.md content | CLAUDE.md |
| Subagent with `skills` field | Subagent's markdown body | Claude's delegation message | Preloaded skills + CLAUDE.md |
| Inline skill (default) | Main session prompt | Injected into conversation | Nothing extra |

---

## Example: forked research skill

```yaml
---
name: deep-research
description: Research a topic thoroughly in the codebase
context: fork
agent: Explore
allowed-tools: Read Grep Glob
---

Research $ARGUMENTS thoroughly:

1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file references
```
