# Wizard — Guided session creation interface

## Purpose
Provides an interactive step-by-step wizard for creating new AI sessions with structured prompts, optional context (memories, agents, skills), and model/backend selection. Also manages wizard configuration (customizable options, fields, templates).

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| SessionWizard.tsx | Main wizard component; 4-step flow (choose → fill → context → review); context loading from notes/agents/skills; session launch | `SessionWizard`, `WizardConfig`, `WizardOption`, `WizardField`, `Step` types |
| WizardSettings.tsx | Admin settings for wizard configuration; customize title, options, fields, prompt templates, context visibility toggles | `WizardSettings` |

## Architecture Notes
- **Wizard Flow (4 steps):**
  - Step 1 (Choose): wizard title/subtitle, dynamic option buttons from config, "Use Context" option
  - Step 2 (Fill): form fields (text/textarea), live prompt preview with variable interpolation
  - Step 3 (Context): tabs for memories (multi-select), agents (single-select), skills (single-select); 10 items/page pagination
  - Step 4 (Review): full prompt display, session name input, model selector, fleet mode toggle, launch
- **Data Structures:**
  ```typescript
  WizardConfig { title, subtitle, initialQuestion, options: WizardOption[] }
  WizardOption { id, label, description, icon (emoji), fields: WizardField[], promptTemplate }
  WizardField { id, label, placeholder, type ('text'|'textarea'), required, helpText? }
  ```
- **IPC Calls Made:**
  - `wizard:get-config`, `wizard:save-config`, `wizard:reset-config` — config management
  - `wizard:get-context-settings`, `wizard:set-context-settings` — context visibility toggles
  - `wizard:build-prompt` — interpolate template variables into final prompt
  - `wizard:mark-completed` — flag wizard as used
  - `notes:list`, `notes:get-full-content` — fetch saved memories
  - `agent:list` — get Copilot + Claude agents
  - `skills:list`, `skills:get` — available skills and content
  - `app:get-cwd` — current working directory
  - `local-models:detect` — find Ollama/LM Studio models
  - `starter-pack:get-visible-agents` — fetch quick-start agents
- **Session Launch Payload:**
  ```typescript
  onLaunchSession({
    cli: 'copilot' | 'claude', name, initialPrompt,
    displayPrompt?, agent?, model?, fleetMode?,
    contextSummary?: { memories[], agent?, skill? }
  })
  ```
- Agent passed as `--agent` flag; skills/memories embedded in prompt body
- Template variable syntax: `{{fieldId}}`

## Business Context
Entry point for first-time and casual users. Provides guided, template-driven session creation with optional context injection, reducing friction vs. free-form prompt entry. WizardSettings allows admins to customize workflows for their organization.
