# Settings Components — Electron app configuration UI

## Purpose
Renders the Configure page and all its sub-sections. Handles saving and loading configuration for both GitHub Copilot CLI and Claude Code CLI, including models, flags, environment variables, accessibility, branding, data management, and plugin discovery. Each component is a thin UI wrapper around IPC calls to the main process.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| AccessibilitySettings.tsx | Font scaling, motion reduction, high contrast, focus indicators, keyboard shortcuts | AccessibilitySettings |
| BudgetLimits.tsx | Max budget USD and max turns sliders for headless (-p) mode; verbose logging | BudgetLimits |
| ConfigProfiles.tsx | Save/load/export/import settings profiles; supports builtin starter profiles | ConfigProfiles |
| DataManagement.tsx | Storage stats breakdown, individual store clearing, factory reset, compact notes merge | DataManagement |
| EnvVarsEditor.tsx | Edit environment variables; sensitive values encrypted via OS keychain | EnvVarsEditor |
| FeatureFlagSettings.tsx | Toggle UI feature flags (Dashboard, Work, Configure sections, etc.) and quick presets | FeatureFlagSettings |
| FlagBuilder.tsx | Dynamic CLI flag builder with category tabs; boolean, string, number, enum, tags types | FlagBuilder |
| LaunchCommandPreview.tsx | Terminal command preview builder; copy to clipboard, run in terminal | LaunchCommandPreview |
| ModelSelector.tsx | Model picker for Copilot (grouped by cost tier) and Claude (grouped by provider) | ModelSelector |
| PluginManager.tsx | List installed plugins, enable/disable, UI to copy install commands | PluginManager |
| WhiteLabel.tsx | Full branding customization: colors, logo, wordmark, border radius, dark/light surfaces | WhiteLabel |
| flagDefs.ts | Flag definitions for both CLIs; COPILOT_FLAGS, CLAUDE_FLAGS, helpers | COPILOT_FLAGS, CLAUDE_FLAGS, getFlagsForCli(), getCategoriesForCli() |

## Architecture Notes

**Pattern:** Each component is a React functional component that reads/writes via `window.electronAPI.invoke()` to IPC handlers on the main process. State is local to each component.

**Prop flow:**
- Parent pages pass CLI identifier ('copilot' | 'claude') and working directory to each component
- Components manage their own loading, saving, validation state
- Changes are persisted via IPC; no local context/store

**Key IPC channels used:**
- `settings:list-profiles`, `settings:save-profile`, `settings:load-profile`, `settings:delete-profile`, `settings:export-profile`, `settings:import-profile`
- `settings:get-env-vars`, `settings:set-env-var`
- `data:get-storage-stats`, `data:clear-store`, `data:clear-all`, `data:get-notes-for-compact`, `data:compact-notes`
- `settings:list-plugins`
- `settings:open-terminal`
- `branding:get-presets`

**UI Patterns:**
- Toggle switches for booleans with accessibility (role="switch", aria-checked)
- Range sliders for numeric values with visual labels
- Tabs for section switching (Overview/Compact, Phase filters)
- Cards with collapsible content; skeleton loaders for async data
- Status indicators (green dots for set env vars, badge tags)

**BudgetLimits, ModelSelector:** Directly render config properties. No state persistence in component — parent page manages AppSettings.

**FlagBuilder:** Dynamically renders flags based on `flagDefs.ts` and category; supports overrides for individual CLI. Each flag type renders differently (toggle, text input, number input, select, tag input).

**LaunchCommandPreview:** Builds shell command string from AppSettings object and flag overrides; quoting/escaping handled in buildCommand().

**ConfigProfiles:** Uses builtin starter profiles (id starts with 'builtin-') which are read-only except Load. Custom profiles are fully editable.

**DataManagement:** Two-tab UX: Overview shows storage breakdown; Compact Memories tab merges selected notes into one with a new title.

**EnvVarsEditor:** Sensitive vars are password inputs; loads current values from server on init, but hides actual sensitive values (shows mask only).

**Accessibility:** Uses contexts (AccessibilityContext, FeatureFlagContext, BrandingContext) defined in types/. WhiteLabel uses BrandingContext to read/update brand state.

## Business Context

**User flows:**
1. Developer opens Configure tab → views all settings
2. Selects model, adjusts CLI flags in FlagBuilder, checks preview in LaunchCommandPreview
3. Saves current config as named Profile (e.g. "Project X Debug Mode")
4. Loads a different profile to switch contexts quickly
5. Customizes branding (colors, logo, app name) via WhiteLabel
6. Manages plugins and MCP servers (PluginManager integrates with main process)
7. Clears storage/memories or compacts old notes
8. Sets environment variables (API keys, tokens) encrypted via keychain
9. Toggles feature flags to hide/show tabs and sections

Powers the entire **Configure page**, which is the user's hub for personalizing CoPilot Commander before running Copilot or Claude Code sessions.
