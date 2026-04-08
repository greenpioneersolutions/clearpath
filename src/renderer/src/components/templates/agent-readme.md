# Templates — Prompt Template Management UI

## Purpose
This folder contains components for creating, editing, browsing, and using reusable prompt templates. Templates are pre-written prompts with configurable variables (placeholders) that users can save and reuse across sessions. This folder handles the full template lifecycle: creating templates with the TemplateEditor, filling in variables with TemplateForm, browsing the library with TemplateLibrary, and viewing usage analytics with TemplateStats.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| TemplateEditor.tsx | Form for creating or editing prompt templates | TemplateEditor component; handles name, category, description, body, complexity, recommended model, and permission mode; regex extraction of `{{VARIABLE_NAME}}` placeholders |
| TemplateForm.tsx | Form for hydrating and sending a template to the active session | TemplateForm component; fills template variables and shows preview; calls `templates:record-usage` IPC |
| TemplateLibrary.tsx | Searchable grid of templates with filters and actions | TemplateLibrary component; lists templates with category filter; handles delete, export, import via IPC; COMPLEXITY_COLORS map |
| TemplateStats.tsx | Table showing template usage analytics | TemplateStats component; fetches and displays `TemplateUsageStat[]` with usage count, avg cost, total cost, last used date |

## Architecture Notes

### Data Flow
1. **TemplateEditor** creates or updates templates via `templates:save` IPC, which returns a `PromptTemplate` object
2. **TemplateLibrary** fetches templates via `templates:list` IPC with optional category and search filters; shows a grid of cards
3. **TemplateForm** takes a selected template and lets users fill in detected `{{VARIABLE_NAME}}` placeholders; uses `useMemo` to hydrate the template body in real-time
4. **TemplateStats** fetches aggregated usage data via `templates:usage-stats` IPC

### Key State Management
- TemplateEditor: local form state (name, category, description, body, complexity, model, permMode, folder, saving, error)
- TemplateLibrary: templates[], loading, search, category filter, message (transient feedback)
- TemplateForm: values object mapping variable names to user input; useMemo for hydrated output
- TemplateStats: stats[], loading

### IPC Calls Made
- `templates:save` — Create/update template; returns PromptTemplate
- `templates:list` — Fetch templates with optional filters
- `templates:delete` — Delete a template by ID
- `templates:export` — Export template to file; returns { path } or error
- `templates:import` — Import template from file; returns { template } or error
- `templates:record-usage` — Record usage event when a template is sent
- `templates:usage-stats` — Fetch TemplateUsageStat[] for analytics table

### Key Types Used (from `../../types/template`)
- `PromptTemplate` — id, name, category, description, body, variables, complexity, recommendedModel, recommendedPermissionMode, folder, source, usageCount, etc.
- `TemplateUsageStat` — templateId, name, category, usageCount, avgCost, totalCost, lastUsedAt
- `TEMPLATE_CATEGORIES` — constant array of category strings

### Key Patterns
- Variable detection via regex: `/\{\{[A-Z_][A-Z0-9_]*\}\}/g` extracts `{{VARIABLE_NAME}}` style placeholders
- Hydration via string replace: iterates over detected variables and replaces placeholders with user input
- Transient messaging: message state with auto-dismiss setTimeout for success/error feedback
- Optimistic UI: templates grid updates immediately after delete; import/export show path/error in transient message
- Complexity color coding: map-based styling for low/medium/high badges

## Business Context
**Feature:** CoPilot Commander's template library enables power users to create reusable prompt workflows. Users can save templates once and reuse them across sessions, improving productivity. Templates support dynamic variables for task-specific customization. The library includes built-in templates and supports import/export for team sharing. Usage stats help users track which templates are most valuable and costly.

**User Workflow:**
1. User clicks "Create Template" → TemplateEditor wizard → saves via `templates:save`
2. User browses TemplateLibrary, searches/filters by category
3. User selects "Use" → TemplateForm shows variable fill-in form and preview
4. User fills variables and clicks "Send to Active Session" → prompt hydrated and sent
5. TemplateStats shows aggregate usage data (how many times used, cost, last used date)
