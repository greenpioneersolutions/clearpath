---
name: create-skill
description: Create or update a Claude Code skill (.claude/skills/ or ~/.claude/skills/). Use when authoring a new skill, improving an existing one, or scaffolding from a description. Invoke: /create-skill [skill-name] ["update"] [description]
argument-hint: <skill-name> [update] [one-line purpose]
disable-model-invocation: true
allowed-tools: Read Glob Write Edit Bash
---

# Create or Update a Skill

You are authoring a Claude Code skill. This skill follows a folder-based structure where references and examples are organized into directories by topic. Use the navigation tables below to load detailed context only when needed.

## Arguments

`$ARGUMENTS` contains the skill name and optional flags:

- `/create-skill deploy` -> create a new skill named `deploy`
- `/create-skill deploy update` -> update the existing `deploy` skill
- `/create-skill deploy "Deploy app to production"` -> create with a known purpose

Parse `$ARGUMENTS`:

1. First token = skill name (lowercase, hyphens only, max 64 chars)
2. If second token is `update` -> this is an update task
3. Remaining tokens = purpose/description hint (may be empty)

**Arguments received:** `$ARGUMENTS`

---

## Phase 1: Discovery

### 1a. Locate existing skills

Scan both personal and project skills directories:

```!
echo "=== Personal skills ===" && ls ~/.claude/skills/ 2>/dev/null || echo "(none)"
echo "=== Project skills ===" && ls .claude/skills/ 2>/dev/null || echo "(none)"
```

### 1b. If updating -- read the existing skill

If this is an update, read the current SKILL.md (personal path first, then project):

```!
cat ~/.claude/skills/$0/SKILL.md 2>/dev/null || cat .claude/skills/$0/SKILL.md 2>/dev/null || echo "(skill not found)"
```

Also read any supporting files that exist in that directory — check for `references/`, `examples/`, and `scripts/` folders.

### 1c. Understand context

Read `CLAUDE.md` and any project-level documentation to understand conventions, tech stack, and workflow patterns:

```!
cat CLAUDE.md 2>/dev/null | head -100 || echo "(no CLAUDE.md)"
```

---

## Phase 2: Design

Before writing any files, reason through these decisions.

### Skill purpose
Summarize in one sentence: "This skill does X when Y."

### Invocation mode -- choose one

| Scenario | Setting |
|----------|---------|
| Side effects (deploy, commit, push, send) -- user must trigger | `disable-model-invocation: true` |
| Background knowledge, style guides, conventions | `user-invocable: false` |
| Utility Claude should auto-apply when relevant | default (both can invoke) |

> For full invocation matrix details, see [references/invocation-control.md](references/invocation-control.md)

### Scope -- choose one

| Scenario | Setting |
|----------|---------|
| Isolated research, one-shot task | `context: fork` + `agent: Explore` or `general-purpose` |
| Inline guidance, standing conventions | default (no fork) |
| Long multi-step workflow | `context: fork` + `agent: general-purpose` |

> For context fork patterns, see [references/context-fork.md](references/context-fork.md)

### Arguments
Does this skill accept arguments? If yes:
- Use `$ARGUMENTS` for the full string
- Use `$0`, `$1`, `$2` for positional args
- Set `argument-hint` in frontmatter

> For variable reference, see [references/string-substitutions.md](references/string-substitutions.md)

### Supporting files -- plan the folder structure

Every skill MUST use folder-based organization for references and examples:

```
<skill-name>/
├── SKILL.md              # Required. Under 500 lines.
├── references/           # Topic-specific reference files
│   ├── <topic-a>.md
│   └── <topic-b>.md
├── examples/             # Individual example pattern files
│   ├── <pattern-a>.md
│   └── <pattern-b>.md
├── scripts/              # Executable scripts (if needed)
│   └── helper.py
└── assets/               # Templates, fonts, icons (if needed)
    └── template.md
```

Rules:
- SKILL.md stays under 500 lines -- move detailed content to `references/`
- Each reference file covers ONE topic (not everything in one file)
- Each example file demonstrates ONE pattern
- SKILL.md contains navigation tables describing what each file offers

> For full directory structure rules, see [references/directory-structure.md](references/directory-structure.md)

### Tools
Does the skill need pre-approved tools? List them in `allowed-tools`.

> For tool syntax and common sets, see [references/allowed-tools.md](references/allowed-tools.md)

### Dynamic context (shell injection)
Does the skill need live data before Claude runs?

> For injection syntax and patterns, see [references/shell-injection.md](references/shell-injection.md)

---

## Phase 3: Write the skill

### Directory choice

**Personal** (`~/.claude/skills/<name>/`) -- general-purpose, useful across all projects.
**Project** (`.claude/skills/<name>/`) -- project-specific, committed to version control.

Default to **project-level** unless the skill is clearly project-agnostic.

### SKILL.md structure

Every SKILL.md must have:

```
---
name: <skill-name>
description: <front-loaded, <=250 chars>
[other frontmatter fields as needed]
---

# <Skill Title>

[One paragraph: what this skill does and when to use it]

## Usage
[How to invoke it, arguments, examples]

## Instructions
[Step-by-step or standing guidelines Claude follows]

## Reference materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/topic.md](references/topic.md) | Description | Trigger condition |

## Examples

| File | Pattern | Use when... |
|------|---------|-------------|
| [examples/pattern.md](examples/pattern.md) | Description | When you need this |
```

> For frontmatter field reference, see [references/frontmatter-fields.md](references/frontmatter-fields.md)

### Navigation tables are REQUIRED

Every skill with supporting files MUST include navigation tables in SKILL.md. These tables tell Claude:
1. **What each file contains** (Topic column)
2. **When to load it** (Read when... column)

This enables selective loading -- Claude reads only what's relevant to the current sub-task instead of ingesting everything at once.

### Instructions quality checklist

- Write instructions as standing guidance, not a one-time procedure
- Use numbered steps for sequential workflows
- Use bullet points for guidelines/conventions
- Be explicit about what Claude should and should not do
- For task skills: include "done when..." acceptance criteria
- Anticipate edge cases

---

## Phase 4: Write supporting files

### references/ folder

Create one file per topic. Each reference file should:
- Have a clear `# Title` that matches the navigation table entry
- Be self-contained (readable without SKILL.md context)
- Cover exactly one topic exhaustively

Use for: API specs, option tables, rule lists, conventions, troubleshooting guides, configuration references.

### examples/ folder

Create one file per pattern. Each example file should:
- Show a complete, working example (not a fragment)
- Include the full SKILL.md with frontmatter
- Explain **why** the pattern works
- Show the recommended directory structure for that pattern type

Use for: archetypal patterns, before/after demonstrations, edge case handling, sample inputs/outputs.

### scripts/ folder

Use for: executable scripts Claude should run. Always reference with `${CLAUDE_SKILL_DIR}`:

```markdown
Run the helper:
```bash
python ${CLAUDE_SKILL_DIR}/scripts/helper.py $ARGUMENTS
```
```

---

## Phase 5: Verify

After writing all files, perform a self-check:

1. **Description test** -- Does the description clearly answer "when would Claude invoke this?"
2. **Invocation test** -- Is `disable-model-invocation` or `user-invocable` set correctly?
3. **Argument test** -- If the skill uses `$ARGUMENTS`, does `argument-hint` match?
4. **File test** -- Do all files referenced in SKILL.md navigation tables actually exist?
5. **Length test** -- Is SKILL.md under 500 lines? If not, move content to `references/`.
6. **Tools test** -- Are the tools in `allowed-tools` the minimum needed?
7. **Structure test** -- Are references and examples in folders (not single monolithic files)?
8. **Table test** -- Does SKILL.md have navigation tables for all supporting files?

Report:
- Path(s) written (list all files created/modified)
- Slash command that invokes it (e.g., `/deploy`)
- A sample invocation showing how to use it
- Whether the skill can be auto-invoked by Claude or is user-only
- Summary of the folder structure created

---

## Reference materials

Consult these for detailed specs on specific topics during skill authoring.

| File | Topic | Read when... |
|------|-------|-------------|
| [references/frontmatter-fields.md](references/frontmatter-fields.md) | All YAML frontmatter fields, types, defaults | Writing or reviewing frontmatter |
| [references/string-substitutions.md](references/string-substitutions.md) | `$ARGUMENTS`, `$N`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_SESSION_ID}` | Skill uses arguments or dynamic paths |
| [references/shell-injection.md](references/shell-injection.md) | `` !`command` `` inline and block injection | Skill needs live data at load time |
| [references/directory-structure.md](references/directory-structure.md) | Folder layout, naming rules, location precedence | Deciding where to put files |
| [references/invocation-control.md](references/invocation-control.md) | Invocation matrix, path-based loading, context budget | Choosing invocation mode |
| [references/allowed-tools.md](references/allowed-tools.md) | Tool syntax, glob patterns, common tool sets | Pre-approving tools |
| [references/context-fork.md](references/context-fork.md) | Fork patterns, agent types, when to fork | Running skill in isolated context |
| [references/lifecycle-and-advanced.md](references/lifecycle-and-advanced.md) | Content lifecycle, compaction, extended thinking, tips | Understanding how skills persist |
| [references/compatibility.md](references/compatibility.md) | agentskills.io, cross-platform, distribution formats | Sharing skills or cross-tool compat |

## Example patterns

Study these complete examples for the pattern closest to the skill being authored.

| File | Pattern | Use when... |
|------|---------|-------------|
| [examples/reference-skill.md](examples/reference-skill.md) | Auto-invoked background knowledge | Building conventions, style guides, domain knowledge |
| [examples/task-skill.md](examples/task-skill.md) | User-triggered side effects | Building deploy, commit, send, or other action skills |
| [examples/forked-research-skill.md](examples/forked-research-skill.md) | Isolated research in forked context | Building investigation or review skills |
| [examples/arguments-scripts-skill.md](examples/arguments-scripts-skill.md) | Positional args + bundled scripts | Building generator or tool-runner skills |
| [examples/folder-based-references-skill.md](examples/folder-based-references-skill.md) | Folder-based reference organization | Building skills with extensive reference material |
