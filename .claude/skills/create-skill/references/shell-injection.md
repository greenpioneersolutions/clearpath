# Dynamic Shell Injection

Pre-process live data before the prompt reaches Claude. Output replaces the placeholder -- Claude receives the rendered output, not the commands. This is preprocessing, not tool use.

---

## Inline form

`` !`<command>` `` -- single command, output replaces inline.

```markdown
Current branch: !`git branch --show-current`
Node version: !`node --version`
```

---

## Block form

Fenced code block opened with ` ```! `:

````markdown
```!
echo "=== Git Status ==="
git status --short
echo "=== Recent Commits ==="
git log --oneline -5
```
````

---

## When to use shell injection

Use for data Claude needs **before** starting work:
- Current git state: `` !`git status --short` ``
- PR details: `` !`gh pr view --comments` ``
- Environment info: `` !`node --version && npm --version` ``
- Project structure: `` !`ls src/ 2>/dev/null` ``
- Existing files: `` !`cat ~/.claude/skills/$0/SKILL.md 2>/dev/null || echo "(not found)"` ``

---

## When NOT to use shell injection

- For commands Claude should run **during** the task -- use `allowed-tools: Bash` instead
- For long-running commands that might timeout
- For commands that modify state (injection runs at load time, before Claude has context)

---

## Disabling injection

For untrusted skill sources, set `"disableSkillShellExecution": true` in settings. This prevents all `` !`command` `` blocks from executing.
