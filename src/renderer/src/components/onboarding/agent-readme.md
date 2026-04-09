# Onboarding — First-run wizard, skill progression, and interactive guidance

## Purpose
This folder manages the onboarding and educational experience: a multi-step first-run wizard for initial app setup and preset selection, guided task walkthroughs with step-by-step instructions for common workflows, skill progression tracking that unlocks advanced features as users try new capabilities, training tooltips that teach CLI equivalents of UI actions, and an "Explain" button for real-time session clarification.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| FirstRunWizard.tsx | Multi-slide carousel (welcome, how it works, preset selection); three permission presets (conservative/balanced/power-user) | `FirstRunWizard({ onComplete })` — onComplete callback passes chosen preset id |
| GuidedTasks.tsx | Collection of 5 hardcoded tasks (review-pr, fix-test, new-feature, security-audit, generate-docs); each task has multi-step walkthrough with action hints | `GuidedTasks({ completedTaskIds, onComplete })` — onComplete callback passes completed taskId |
| SkillProgression.tsx | Shows skill level (beginner/intermediate/advanced/expert) with progress bar; checklist of 12 features across 4 levels; tracks featureUsage boolean map | `SkillProgression({ featureUsage, currentLevel, progress, total })` — read-only UI displaying progression |
| TrainingTooltip.tsx | Small fixed bottom-right tooltip showing CLI command equivalent for UI action; includes training mode toggle and dismiss button; also exports useTrainingMode() hook | `TrainingTooltip({ actionId, visible, onDismiss })` and `useTrainingMode()` hook |
| ExplainButton.tsx | Button that sends follow-up prompt to current session asking for plain-English explanation of what just happened; shows loading state and confirmation message | `ExplainButton({ lastExchange, sessionId })` — calls cli:send-input to inject explain prompt |
| SetupWizardFull.tsx | Full 8-step setup flow (welcome, cli-check, auth-login, agent-create, skill-create, memory-create, try-it, done); auth status checking; starter pack integration | `SetupWizardFull()` — calls setup-wizard IPC endpoints, auth IPC, starter-pack:get-agent/skill, listens for auth:login-output/complete |

## Architecture Notes
- **IPC Calls Made:**
  - `setup-wizard:get-state` — returns SetupState with `{ cliInstalled, authenticated, agentCreated, skillCreated, memoryCreated, triedWizard, completedAt }`
  - `setup-wizard:update-step` — updates SetupState flags and returns updated state
  - `auth:get-status` — returns AuthState with `{ copilot, claude }` each having `{ installed, authenticated, binaryPath, version }`
  - `auth:refresh` — re-checks CLI authentication status
  - `auth:login-copilot` / `auth:login-claude` — initiates browser login flow for CLI
  - `auth:login-output` — listens for streaming login output lines
  - `auth:login-complete` — listens for login success/failure event
  - `starter-pack:get-agent` — fetches starter agent definition by id
  - `starter-pack:get-skill` — fetches starter skill definition by id
  - `cli:send-input` — sends prompt to active session (used by ExplainButton)
  - `onboarding:get-state` — fetches trainingModeEnabled flag (used by TrainingTooltip hook)
- FirstRunWizard: step (0-2 slides), preset choice (conservative|balanced|power-user)
- GuidedTasks: selectedTask, currentStepIdx, completedTaskIds array
- SkillProgression: read-only props; displays computed level from progress/total
- TrainingTooltip: isEnabled (from IPC), activeTip (actionId string or null)
- ExplainButton: explanation string, loading, isOpen
- SetupWizardFull: step (welcome|cli|auth|agent|skill|memory|tryit|done), setupState, authState, form state for agent/skill/memory creation, loginOutput array, loginStatus
- FirstRunWizard shows preset selector only on last slide (step 2)
- GuidedTasks splits into task list view and detailed step-by-step view; marks completed tasks with checkmark
- SkillProgression uses FEATURES constant array mapping key to label/description/level; four LEVELS with color and progress threshold
- TrainingTooltip maps actionId to TRAINING_TIPS lookup; maps UI actions to CLI flag equivalents (e.g., permission-mode → --permission-mode)
- ExplainButton truncates lastExchange to last 2000 chars before sending
- SetupWizardFull auto-jumps to first incomplete step on load; pre-fills agent/skill from starter pack definitions
- FirstRunWizard typically shown in onboarding route, full-screen modal with gradient background
- TrainingTooltip portal-rendered to bottom-right fixed position (z-index 40)
- SetupWizardFull shown on first app launch or via settings

## Business Context
FirstRunWizard sets user expectations and permission defaults at launch. GuidedTasks teach common workflows (code review, bug fixes, feature development, security audits, docs) in a friction-free step-by-step format. SkillProgression gamifies feature discovery and learning by tracking which capabilities users have tried. TrainingTooltip educates power users on CLI equivalents of GUI actions, enabling CLI learning without breaking the GUI experience. ExplainButton addresses user confusion in real-time by asking the AI to explain its own actions in plain English. SetupWizardFull ensures CLI tools are installed and authenticated before the user tries to use them.
