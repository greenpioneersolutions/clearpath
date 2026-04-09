# Skill Directory Structure & Locations

## Recommended directory layout

```
<skill-name>/
├── SKILL.md              # Required. Main instructions + frontmatter.
├── references/           # Optional. Topic-specific reference files.
│   ├── api-guide.md      #   Detailed API documentation
│   ├── conventions.md    #   Coding conventions and rules
│   └── troubleshooting.md#   Common issues and fixes
├── examples/             # Optional. Example files organized by pattern.
│   ├── basic-usage.md    #   Simple usage patterns
│   ├── advanced.md       #   Complex scenarios
│   └── edge-cases.md     #   Edge case handling
├── scripts/              # Optional. Executable scripts.
│   └── helper.py         #   Use ${CLAUDE_SKILL_DIR}/scripts/helper.py
└── assets/               # Optional. Templates, fonts, icons.
    └── template.md       #   Templates for output generation
```

---

## Key rules

- `SKILL.md` must be exactly `SKILL.md` (case-sensitive). No variations.
- Skill folder name: kebab-case only. No spaces, underscores, or capitals.
- Keep `SKILL.md` under 500 lines. Move bulk content to supporting folders.
- No `README.md` inside the skill folder. All docs go in `SKILL.md` or `references/`.
- Reference supporting files from `SKILL.md` with a navigation table so Claude knows what each file contains and when to load it.

---

## Folder-based references pattern

Use **folders** (not single files) for references and examples when:
- You have more than ~150 lines of reference material
- Content spans multiple distinct topics
- Claude needs to selectively load only relevant context

SKILL.md should contain a **navigation table** describing each file:

```markdown
## Reference materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/api-guide.md](references/api-guide.md) | API endpoints and payloads | Writing or modifying API code |
| [references/conventions.md](references/conventions.md) | Naming and style rules | Creating new files or components |
| [references/troubleshooting.md](references/troubleshooting.md) | Common errors and fixes | Debugging or error handling |
```

This lets Claude do deeper reading based on the specific topic it needs, rather than loading everything upfront.

---

## Skill locations

| Path | Scope | Use when... |
|------|-------|-------------|
| `~/.claude/skills/<name>/SKILL.md` | Personal -- all projects | Skill is general-purpose, encodes personal workflow preferences |
| `.claude/skills/<name>/SKILL.md` | Project -- this project only | Skill is project-specific, should be version-controlled |
| `<plugin>/skills/<name>/SKILL.md` | Plugin -- where plugin is enabled | Distributed as part of a plugin |
| Enterprise managed settings | Organization-wide | Deployed by admins for all users |

When the same name exists at multiple levels: enterprise > personal > project.

**Automatic discovery:** Claude Code discovers skills from nested `.claude/skills/` directories. Editing a file in `packages/frontend/` also checks `packages/frontend/.claude/skills/`. This supports monorepos.

**Added directories:** Skills in `.claude/skills/` within `--add-dir` directories are loaded automatically and picked up by live change detection.

---

## Default to project-level

Unless the skill is clearly project-agnostic, create it at `.claude/skills/<name>/` so it:
- Is committed to version control
- Is shared with the team
- Lives alongside the code it supports
