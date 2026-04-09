# Cross-Platform Compatibility

## agentskills.io standard

Claude Code skills follow the [Agent Skills](https://agentskills.io) open standard. To maximize portability:

- Use `name` and `description` in frontmatter (the universal fields)
- Keep skill folder names in kebab-case
- Use `SKILL.md` as the exact filename (case-sensitive)
- Avoid Claude Code-specific features if you want cross-tool compatibility

---

## Claude Code-specific extensions

These features work in Claude Code but may not be supported by other tools:

| Feature | Claude Code | Other tools |
|---------|:-:|:-:|
| `disable-model-invocation` | yes | varies |
| `user-invocable` | yes | varies |
| `context: fork` | yes | no |
| `agent` field | yes | no |
| `hooks` field | yes | no |
| `effort` field | yes | no |
| `allowed-tools` | yes | varies |
| `paths` auto-loading | yes | varies |
| `shell` field | yes | varies |
| `` !`command` `` injection | yes | varies |
| `$ARGUMENTS` substitution | yes | yes |
| `${CLAUDE_SKILL_DIR}` | yes | varies |
| `${CLAUDE_SESSION_ID}` | yes | no |

---

## Distribution formats

| Destination | Format |
|-------------|--------|
| Claude Code (CLI) | Place folder in `.claude/skills/` or `~/.claude/skills/` |
| Claude.ai (web) | ZIP the skill folder, upload via Settings > Capabilities > Skills |
| Claude API | Use `/v1/skills` endpoint or `container.skills` parameter |
| Plugin distribution | Place in `<plugin>/skills/<name>/` |
| Organization-wide | Deploy through enterprise managed settings |
| GitHub sharing | Host repo, users clone into their skills directory |

---

## ZIP packaging for claude.ai

1. Ensure the folder name matches your skill's name
2. Create a ZIP file of the folder
3. The ZIP should contain the skill folder as its root (not nested)

```
my-skill.zip
└── my-skill/
    ├── SKILL.md
    ├── references/
    └── scripts/
```
