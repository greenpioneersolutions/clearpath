# Skills — AI Skill Creation & Management UI

## Purpose
This folder contains components for creating, managing, and using AI skills—persistent, reusable instructions that get injected into Claude Code or GitHub Copilot CLI sessions. Skills are like templates but designed for automation: they can auto-invoke on specific file patterns, declare required tools, specify preferred models, and integrate with external services like GitHub. SkillWizard guides users through a 4-step creation flow; SkillsPanel displays the skill library with toggle/use/export controls.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| SkillWizard.tsx | 4-step wizard for creating skills: Basics → Content → Options → Review | SkillWizard component; steps: name/description/scope/cli, skill body, auto-invoke config, tool selection, model preference, integrations, review & save; IPC call `skills:save` |
| SkillsPanel.tsx | List view of installed skills with search, enable/disable toggle, use, export, and management controls | SkillsPanel component; loads skills via `skills:list`; handles toggle, use (inserts /{slug} command), export (bulk), search filtering; scopeColor map |

## Architecture Notes

### Data Flow
1. **SkillWizard** is a multi-step form that collects skill metadata (step 1-2) and configuration (step 3: auto-invoke, tools, model, GitHub integration), then confirms before saving via `skills:save` IPC
2. **SkillsPanel** fetches installed skills via `skills:list` IPC (filtered by working directory); displays each skill with enable/disable toggle and Use button
3. When user clicks "Use" in SkillsPanel, it inserts `/{slug}` into the command prompt (where slug is derived from skill name)
4. Skills auto-invoke when enabled and file patterns match (glob triggers); always-invoke skills run in every session

### Key State Management
- SkillWizard: step (1-4), form fields (name, description, scope, cli, body, autoInvoke, triggerType, triggerValue, selectedTools[], model, requiresGitHub), saving, error, starters
- SkillsPanel: skills[], search, loading, cwd, selectMode (for bulk export), selectedIds (Set), exporting

### IPC Calls Made
- `skills:get-starters` — Fetch StarterTemplate[] for template picker in step 2
- `app:get-cwd` — Get current working directory (used in SkillWizard step 4 summary and SkillsPanel load)
- `skills:save` — Save skill with name, description, body, scope, cli, workingDirectory, autoInvoke config, tools[], model
- `skills:list` — Fetch SkillInfo[] for a given working directory; returns name, description, scope, cli, path, enabled, autoInvoke, modifiedAt
- `skills:toggle` — Enable/disable a skill by path
- `skills:record-usage` — Record usage event when a skill is selected
- `skills:export` — Export skill(s) by path/name

### Key Types Used (from `../../types/*`)
- `SkillInfo` — id, name, description, scope ('project'|'global'|'plugin'|'team'), cli ('claude'|'copilot'|'both'), path, dirPath, enabled, autoInvoke, autoInvokeTrigger, modifiedAt
- `StarterTemplate` — id, name, description, content (seed content for new skills)

### Key Patterns
- **Multi-step wizard:** step state tracks which of 4 screens is visible; validation on each step before allowing Next
- **Tool selection:** SkillWizard shows different tool chips depending on CLI target (Copilot vs Claude Code); tools are clickable chips with toggle logic
- **Slug generation:** `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')` creates skill directory name
- **Auto-invoke triggers:** 
  - `triggerType === 'globs'` — skill runs when user edits files matching pattern (e.g., `*.test.ts`)
  - `triggerType === 'always'` — skill auto-runs in every session
- **Scope colors:** project (blue), global (purple), plugin (green), team (orange)
- **Permission modes:** Default, Plan, Accept Edits, Auto, YOLO/Bypass (shown in DelegateTaskForm and used in skills)

### Command Integration
When SkillsPanel calls `onInsertCommand(command)`, it inserts `/{skill-slug}` into the chat prompt, triggering the skill inline during that session.

## Business Context
**Feature:** Skills enable users to extend Claude Code and GitHub Copilot with custom instructions and automation. A skill can be a code review checklist, a test-writing template, or a domain-specific task like "analyze security vulnerabilities." Skills support both manual invocation (via `/skill-name` command) and automatic triggering based on file patterns. Global skills apply to all projects; project-scoped skills are local to one repo. Skills declare which tools they need (Read, Write, Bash, Grep, etc.) to optimize token usage and improve reliability.

**User Workflow:**
1. User clicks "+ Create Skill" in SkillsPanel → SkillWizard step 1 (name, scope, CLI target)
2. Step 2: write skill content in markdown (can start from templates)
3. Step 3: configure auto-invoke (optional), select required tools, pick preferred model, enable GitHub integration if needed
4. Step 4: review and save via `skills:save`
5. Skill appears in SkillsPanel; can be toggled on/off, used inline with `/skill-name`, or exported for team sharing
6. If auto-invoke enabled, skill runs automatically when file patterns match or in every session
