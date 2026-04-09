# Skill Lifecycle & Advanced Features

## Content lifecycle

- Skill content is injected **once** as a conversation message and persists the whole session
- Auto-compaction preserves the latest invocation of each skill
- Write guidance as **standing instructions**, not one-time steps (content persists)
- If the same skill is invoked twice, only the latest copy survives compaction
- Claude Code does NOT re-read the skill file on later turns

---

## Extended thinking

To enable extended thinking in a skill, include the word `ultrathink` anywhere in the skill content.

---

## agentskills.io open standard

Claude Code skills follow the [Agent Skills](https://agentskills.io) open standard. Skills created here are compatible with:
- Gemini CLI
- GitHub Copilot
- Cursor
- Amp
- Roo Code
- Other supporting tools

Core required field per spec: `name` (directory name serves as fallback). `description` is strongly recommended.

---

## Progressive disclosure model

Skills use a three-level system to minimize token usage:

1. **First level (YAML frontmatter):** Always loaded in Claude's system prompt. Provides just enough info for Claude to know when the skill should be used.
2. **Second level (SKILL.md body):** Loaded when Claude thinks the skill is relevant. Contains full instructions and guidance.
3. **Third level (Linked files):** Additional files in the skill directory that Claude reads only as needed. Referenced via navigation tables in SKILL.md.

This is why folder-based references are powerful -- Claude loads only what it needs for the specific sub-topic, rather than ingesting everything at once.

---

## Skill content tips

### Write as standing guidance
```markdown
# Good -- standing instruction
When reviewing PRs, always check for:
- Breaking API changes
- Missing test coverage
```

```markdown
# Bad -- one-time procedure
First, open the PR. Then check for breaking changes. Then check tests.
```

### Include acceptance criteria for task skills
```markdown
## Done when
- All tests pass
- No lint errors
- PR description is filled in
```

### Anticipate edge cases
```markdown
## Edge cases
- If no tests exist, create them before committing
- If lint fails, fix the issues before proceeding
- If the migration directory doesn't exist, create it
```
