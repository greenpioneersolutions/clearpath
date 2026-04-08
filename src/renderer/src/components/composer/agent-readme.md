# Composer — Multi-step AI workflow builder

## Purpose
Enables users to create, configure, and execute multi-step AI workflows with support for templates, parallel execution, cost estimation, and session targeting. Powers the CoPilot Commander's workflow composition interface.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| Composer.tsx | Main workflow composer orchestrator; manages step editing, workflow execution, template selection, and workflow saving | `Composer`, `StepExecution`, `SessionOption` types |
| WorkflowCanvas.tsx | Canvas view for step editing and execution; drag-to-reorder steps, cost estimation, execution status display | `WorkflowCanvas`, `createEmptyStep()` |
| StepCard.tsx | Individual step card component with collapsible config; handles execution type, model, agent, and permission settings | `StepCard`, `WorkflowStep` type |
| TemplateLauncher.tsx | Template browser and selection UI; search, category filtering, variable interpolation, live preview | `TemplateLauncher` |
| QuickCompose.tsx | Context toolbar with template/agent/memory/fleet/delegate pickers; badge display for active context | `QuickCompose`, `QuickComposeConfig` |

## Architecture Notes

### Workflow Execution Engine
- `Composer.executeWorkflow()` orchestrates multi-step execution with batch grouping (parallel vs sequential)
- Sequential steps auto-inject prior step outputs as context
- Supports three execution modes:
  - `session`: Sends prompt to active or new CLI session
  - `sub-agent`: Spawns dedicated process and polls for completion
  - `background`: Async execution (planned)
- Output metadata stripped by `stripCliMetadata()` to remove CLI stats

### Step Structure
```typescript
WorkflowStep {
  id, name, prompt, executionType, parallel, collapsed,
  agent?, model?, workingDirectory?, permissionMode?, maxBudget?
}
```

### IPC Calls Made
- `subagent:spawn` - spawn sub-agent with name, cli, prompt, model, permissions
- `subagent:list` - list running sub-agents and their status
- `subagent:get-output` - fetch execution output
- `workflow:estimate-cost` - estimate tokens/cost for steps
- `workflow:save` - save workflow with name and description
- `templates:list` - fetch prompt templates by category/search
- `templates:record-usage` - log template usage analytics

### UI Flow
1. **Landing**: TemplateLauncher shows template browser or "start from scratch"
2. **Canvas**: WorkflowCanvas displays editable steps with drag-reorder
3. **Execution**: Real-time status display with step outputs and elapsed time
4. **Save**: Optional workflow save dialog

### Context Integration
- Target banner toggles between "New Session" and "Current Session"
- QuickCompose shows active context (agent, skill, memories, fleet, delegate)
- Context badges removable via onRemove handlers

## Business Context
Implements the core workflow composition feature—allowing users to chain multiple AI tasks together, reuse templates, parallelize work, and track costs across the entire workflow. Critical for power users building complex automation pipelines.

