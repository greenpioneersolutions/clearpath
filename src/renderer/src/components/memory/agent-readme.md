# Memory Components — Notes, context files, and session memory management

## Purpose
Manages persistent memory for CLI sessions: user notes (tagged, categorized, with attachments), CLAUDE.md/AGENTS.md instructions, config files (instructions, settings, agents, skills), memory file templates, and real-time context usage tracking. The Memory tab is the user's persistent knowledge base integrated with AI sessions.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| ContextUsage.tsx | Fetch token usage from active session; parse /cost or /context CLI output; stacked bar chart breakdown | ContextUsage |
| FileEditor.tsx | Sidebar file browser (grouped by category), CodeMirror editor with markdown/JSON syntax; save with Ctrl+S | FileEditor |
| InstructionsEditor.tsx | Edit CLAUDE.md or AGENTS.md with category sections (Code Style, Testing, Architecture, etc.); markdown builder | InstructionsEditor |
| MemoryPicker.tsx | Dropdown note picker, search, multi-select checkboxes; shows selected count badge | MemoryPicker |
| MemoryViewer.tsx | View all memory entries by type; search, filter, expandable cards with delete | MemoryViewer |
| NewFileWizard.tsx | Template picker (7 templates for Claude/Copilot); edit path and content before create | NewFileWizard |
| NotesManager.tsx | Full CRUD UI for notes: create/edit/view/delete, category, tags, pin, file attachments | NotesManager |
| StarterMemories.tsx | Onboarding guide: suggested memory templates (work profile, communication pref, etc.); expand, fill, save | StarterMemories |

## Architecture Notes

**Pattern:** Each component is a self-contained UI for a specific memory management task. Local state + IPC calls to main process. No shared context across components; parent page owns the tab/section routing.

**State management:**
- **ContextUsage:** Selected session, breakdown parsed from CLI output, raw output buffer, listeners for 'cli:output' and 'cli:turn-end'
- **FileEditor:** Files list grouped by category, selected file, content, dirty flag, save status
- **InstructionsEditor:** Sections (parsed from ##-delimited markdown), original content, file path
- **MemoryPicker:** Open/closed dropdown, notes list, search query, selected IDs set
- **NotesManager:** Notes list, view mode (list/create/edit), filters (search, category, tag), pagination, editor state
- **NewFileWizard:** Selected template, custom path, content, CLI filter (all/claude/copilot)
- **StarterMemories:** Memory definitions, setup completion state, form data, expanded card, save status

**Key IPC channels:**
- `memory:list-files`, `memory:read-file`, `memory:write-file`
- `memory:list-memory-entries`, `memory:delete-file`
- `notes:list`, `notes:create`, `notes:update`, `notes:delete`, `notes:tags`, `notes:pick-files`
- `cli:list-sessions`, `cli:send-slash-command`, `cli:output` (event), `cli:turn-end` (event)
- `starter-pack:get-memories`, `starter-pack:get-setup-state`, `starter-pack:get-memory-data`, `starter-pack:save-memory-data`

**File structure:**
- Config files: `.claude/` and `.github/copilot/` dirs; categories: instructions, settings, agent, skill, command, rule
- Notes: stored in app database with metadata (tags, category, attachments, source, sessionName)
- Attachments: file references with path, name, size; content included when note used as context

**ContextUsage token parsing:**
- Regex patterns for "5,234 / 200,000 tokens" format, named segments (systemPrompt, conversation, files, tools, instructions)
- Supports Claude /cost output: "Input: 1,234 tokens"
- Stacked bar visualization with hover tooltips
- Color-coded segments: purple (system), blue (conversation), green (files), yellow (tools), orange (instructions)

**FileEditor + InstructionsEditor:**
- CodeMirror editor with syntax highlighting (markdown, JSON)
- Grouped sidebar: Instructions, Settings, Agents, Skills, Commands, Rules
- Save with Ctrl+S or button click
- Dirty flag indicator for unsaved changes
- Create new file wizard integration

**NotesManager CRUD:**
- Create: title (required), content, category (dropdown), tags (comma-sep), pin toggle, attachments
- Edit: same form fields + creation timestamp + source/session metadata (read-only)
- List: paginated 10/page, search by title/content/tags, filter by category/tag
- Delete: confirmation dialog
- Pin: hover action to pin/unpin to top
- Attachments: pick files dialog, list with size, remove individually

**MemoryPicker dropdown:**
- Toggles with button; opens below (absolute position)
- Search input focuses automatically
- Checkboxes for multi-select
- Show selected count
- Category badge + tags + time ago
- Close on outside click

**NewFileWizard templates:**
- 7 pre-defined templates (CLAUDE.md, AGENTS.md, code-review agent, testing agent, PR skill, security rules, etc.)
- Filters by CLI (all/claude/copilot)
- User can edit suggested path and content before creating

**StarterMemories onboarding:**
- Suggested memories: work profile, communication preferences, current priorities, working preferences, stakeholder map
- Phases: onboarding (first run), early (first week), progressive (ongoing), on-request (optional)
- Expandable cards with form fields (text, textarea, select, multiline-entries)
- Completion tracking: progress bar, checkmarks
- Each memory shows "What it unlocks" and example data

## Business Context

**User flows:**
1. Developer starts app → StarterMemories suggests onboarding memories (work profile, comms prefs)
2. Opens Memory tab → sees FileEditor with CLAUDE.md/AGENTS.md templates
3. Fills in InstructionsEditor sections (Code Style, Testing, Architecture)
4. Creates Notes for meeting summaries, reference material, conversation snippets
5. Tags and categorizes notes; pins important ones; attaches relevant files
6. Runs Copilot/Claude Code session
7. MemoryPicker appears in session UI → selects notes to include as context
8. During session, ContextUsage shows token breakdown via /cost or /context command
9. Saves AI response as note using bookmark button
10. Later: searches notes, edits, compacts old notes into summaries

**Core value:**
- **CLAUDE.md / AGENTS.md:** Persistent project instructions that apply to all sessions
- **Notes:** Personal memory of decisions, discussions, patterns — included as context when user wants
- **Config files:** Skills, agents, custom commands — extend CLI capabilities
- **StarterMemories:** Guided setup to establish work profile, communication style, preferences
- **ContextUsage:** Transparency into how tokens are spent — helps optimize prompts

Powers the **Memory tab** and **session context picker**, enabling persistent personalization and smarter session-to-session continuity.
