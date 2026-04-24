import { useState, useCallback } from 'react'
import type { PromptTemplate } from '../../types/template'
import type { WorkflowStep } from './StepCard'
import TemplateLauncher from './TemplateLauncher'
import WorkflowCanvas, { createEmptyStep } from './WorkflowCanvas'
import type { BackendId } from '../../../../shared/backends'

interface StepExecution {
  stepId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'rate-limited' | 'skipped'
  output: string
  elapsed?: number
  error?: string
}

interface SessionOption {
  id: string
  name: string
  cli: BackendId
  status: string
}

interface Props {
  /** Send a prompt to the active CLI session */
  onSendToSession: (prompt: string) => void
  /** Create a brand new session and send the prompt there */
  onSendToNewSession: (prompt: string) => void
  /** The active session's CLI backend */
  cli: BackendId
  /** Active sessions available for targeting */
  sessions?: SessionOption[]
  /** Whether there's an active selected session */
  hasActiveSession?: boolean
  activeSessionName?: string
}

export default function Composer({ onSendToSession, onSendToNewSession, cli, sessions, hasActiveSession, activeSessionName }: Props): JSX.Element {
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [hasStarted, setHasStarted] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [executions, setExecutions] = useState<StepExecution[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [saveDialog, setSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [targetMode, setTargetMode] = useState<'new' | 'existing'>('new')

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStartFromScratch = () => {
    const step = createEmptyStep()
    step.name = 'Step 1'
    setSteps([step])
    setHasStarted(true)
  }

  const handleStartFromTemplate = (template: PromptTemplate, values: Record<string, string>) => {
    let body = template.body
    for (const [key, val] of Object.entries(values)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
    }
    const step = createEmptyStep()
    step.name = template.name
    step.prompt = body
    if (template.recommendedModel) step.model = template.recommendedModel
    if (template.recommendedPermissionMode) step.permissionMode = template.recommendedPermissionMode
    setSteps([step])
    setHasStarted(true)
  }

  const handleRunNow = (hydratedPrompt: string) => {
    if (targetMode === 'existing' && hasActiveSession) {
      onSendToSession(hydratedPrompt)
    } else {
      onSendToNewSession(hydratedPrompt)
    }
  }

  const handleAddFromTemplate = () => {
    setShowTemplatePicker(true)
  }

  const handleTemplateForStep = (template: PromptTemplate, values: Record<string, string>) => {
    let body = template.body
    for (const [key, val] of Object.entries(values)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val)
    }
    const step = createEmptyStep()
    step.name = template.name
    step.prompt = body
    step.executionType = 'sub-agent'
    setSteps((prev) => [...prev, step])
    setShowTemplatePicker(false)
  }

  // ── Execution engine ──────────────────────────────────────────────────────

  /** Strip CLI usage stats and metadata from output, keeping only the actual response. */
  const stripCliMetadata = (raw: string): string => {
    // Remove everything from "Total usage est:" onward (Copilot CLI stats)
    let cleaned = raw.replace(/Total usage est:[\s\S]*/m, '')
    // Remove everything from "API time spent:" onward
    cleaned = cleaned.replace(/API time spent:[\s\S]*/m, '')
    // Remove "Breakdown by AI model:" blocks
    cleaned = cleaned.replace(/Breakdown by AI model:[\s\S]*/m, '')
    // Remove Claude Code cost output patterns
    cleaned = cleaned.replace(/Total cost:[\s\S]*/m, '')
    cleaned = cleaned.replace(/Input tokens:[\s\S]*/m, '')
    // Remove session/time stats
    cleaned = cleaned.replace(/Total session time:[\s\S]*/m, '')
    cleaned = cleaned.replace(/Total code changes:[\s\S]*/m, '')
    // Trim whitespace
    return cleaned.trim()
  }

  const executeWorkflow = useCallback(async (stepsToRun: WorkflowStep[]) => {
    const validSteps = stepsToRun.filter((s) => s.prompt.trim())
    if (validSteps.length === 0) return

    setIsExecuting(true)
    setExecutions(validSteps.map((s) => ({ stepId: s.id, status: 'queued', output: '' })))

    // Record workflow usage if saved
    void window.electronAPI.invoke('workflow:estimate-cost', { steps: validSteps })

    // Group steps into sequential batches (parallel steps in same batch)
    const batches: WorkflowStep[][] = []
    let currentBatch: WorkflowStep[] = []

    for (const step of validSteps) {
      if (step.parallel && currentBatch.length > 0) {
        currentBatch.push(step)
      } else {
        if (currentBatch.length > 0) batches.push(currentBatch)
        currentBatch = [step]
      }
    }
    if (currentBatch.length > 0) batches.push(currentBatch)

    // Collect outputs from completed steps to pass as context to subsequent steps
    const stepResults: Array<{ name: string; prompt: string; answer: string }> = []

    for (const batch of batches) {
      // Build clean context from previously completed steps
      const priorContext = stepResults
        .map((r) => `Step "${r.name}":\n  Prompt: ${r.prompt}\n  Answer: ${r.answer}`)
        .join('\n\n')

      // Run all steps in batch in parallel
      const batchResults = await Promise.all(batch.map(async (step): Promise<{ stepId: string; name: string; prompt: string; output: string }> => {
        // Mark running
        setExecutions((prev) => prev.map((e) =>
          e.stepId === step.id ? { ...e, status: 'running' } : e
        ))

        const startTime = Date.now()

        // For sequential steps (not parallel, not the first batch), inject prior outputs
        let finalPrompt = step.prompt
        if (!step.parallel && priorContext.trim()) {
          finalPrompt = `Previous workflow step results:\n\n${priorContext}\n\nUsing the above results, do the following:\n${step.prompt}`
        }

        try {
          if (step.executionType === 'session') {
            if (targetMode === 'existing' && hasActiveSession) {
              onSendToSession(finalPrompt)
            } else {
              onSendToNewSession(finalPrompt)
            }
            await new Promise((r) => setTimeout(r, 1000))
            setExecutions((prev) => prev.map((e) =>
              e.stepId === step.id ? { ...e, status: 'completed', output: 'Sent to session', elapsed: Date.now() - startTime } : e
            ))
            return { stepId: step.id, name: step.name, prompt: step.prompt, output: 'Sent to session' }
          } else {
            const info = await window.electronAPI.invoke('subagent:spawn', {
              name: step.name || 'Workflow step',
              cli,
              prompt: finalPrompt,
              model: step.model,
              workingDirectory: step.workingDirectory,
              permissionMode: step.permissionMode,
              maxBudget: step.maxBudget,
              agent: step.agent,
            }) as { id: string }

            // Poll for completion
            const maxWait = 300_000
            let resultOutput = ''
            while (Date.now() - startTime < maxWait) {
              await new Promise((r) => setTimeout(r, 2000))
              const agents = await window.electronAPI.invoke('subagent:list') as Array<{ id: string; status: string }>
              const agent = agents.find((a) => a.id === info.id)
              if (!agent || agent.status !== 'running') {
                const output = await window.electronAPI.invoke('subagent:get-output', { id: info.id }) as Array<{ content: string }>
                resultOutput = output.map((o) => o.content).join('')
                setExecutions((prev) => prev.map((e) =>
                  e.stepId === step.id ? {
                    ...e,
                    status: agent?.status === 'completed' ? 'completed' : 'failed',
                    output: resultOutput.slice(0, 10000),
                    elapsed: Date.now() - startTime,
                  } : e
                ))
                return { stepId: step.id, name: step.name, prompt: step.prompt, output: resultOutput }
              }
            }
            setExecutions((prev) => prev.map((e) =>
              e.stepId === step.id ? { ...e, status: 'failed', error: 'Timeout', elapsed: Date.now() - startTime } : e
            ))
            return { stepId: step.id, name: step.name, prompt: step.prompt, output: '' }
          }
        } catch (err) {
          setExecutions((prev) => prev.map((e) =>
            e.stepId === step.id ? { ...e, status: 'failed', error: String(err), elapsed: Date.now() - startTime } : e
          ))
          return { stepId: step.id, name: step.name, prompt: step.prompt, output: '' }
        }
      }))

      // Store clean outputs from this batch for subsequent steps
      for (const result of batchResults) {
        if (result.output) {
          stepResults.push({
            name: result.name || result.stepId,
            prompt: result.prompt,
            answer: stripCliMetadata(result.output).slice(0, 2000),
          })
        }
      }
    }

    setIsExecuting(false)
  }, [cli, onSendToSession])

  // ── Save workflow ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!saveName.trim()) return
    await window.electronAPI.invoke('workflow:save', {
      name: saveName.trim(),
      description: saveDesc.trim(),
      steps,
    })
    setSaveDialog(false)
    setSaveName('')
    setSaveDesc('')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Template picker for adding steps
  if (showTemplatePicker) {
    return (
      <TemplateLauncher
        onStartFromTemplate={handleTemplateForStep}
        onStartFromScratch={() => {
          const step = createEmptyStep()
          step.name = `Step ${steps.length + 1}`
          step.executionType = 'sub-agent'
          setSteps((prev) => [...prev, step])
          setShowTemplatePicker(false)
        }}
        onRunNow={handleRunNow}
      />
    )
  }

  // Save dialog overlay
  if (saveDialog) {
    return (
      <div className="p-6 max-w-md mx-auto space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Save Workflow</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)}
            placeholder="e.g. Security Audit Pipeline"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input type="text" value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)}
            placeholder="What this workflow does..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex gap-3">
          <button onClick={() => setSaveDialog(false)}
            className="flex-1 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={() => void handleSave()} disabled={!saveName.trim()}
            className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-40">Save</button>
        </div>
      </div>
    )
  }

  const targetBanner = (
    <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-500">Send output to:</span>
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          <button
            onClick={() => setTargetMode('new')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              targetMode === 'new' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >New Session</button>
          <button
            onClick={() => setTargetMode('existing')}
            disabled={!hasActiveSession}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              targetMode === 'existing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            } ${!hasActiveSession ? 'opacity-40 cursor-not-allowed' : ''}`}
          >Current Session</button>
        </div>
      </div>
      {targetMode === 'existing' && hasActiveSession && activeSessionName && (
        <span className="text-xs text-gray-400">
          Targeting: <span className="text-gray-600 font-medium">{activeSessionName}</span>
        </span>
      )}
      {targetMode === 'new' && (
        <span className="text-xs text-gray-400">A new session will be created</span>
      )}
    </div>
  )

  // Landing state — no steps yet
  if (!hasStarted) {
    return (
      <div className="flex flex-col h-full">
        {targetBanner}
        <div className="flex-1 overflow-y-auto">
          <TemplateLauncher
            onStartFromTemplate={handleStartFromTemplate}
            onStartFromScratch={handleStartFromScratch}
            onRunNow={handleRunNow}
          />
        </div>
      </div>
    )
  }

  // Canvas with steps
  return (
    <div className="flex flex-col h-full">
      {targetBanner}
      <div className="flex-1 overflow-y-auto">
        <WorkflowCanvas
          steps={steps}
          onStepsChange={setSteps}
          onExecute={(s) => void executeWorkflow(s)}
          onSaveWorkflow={() => setSaveDialog(true)}
          onAddFromTemplate={handleAddFromTemplate}
          executions={executions}
          isExecuting={isExecuting}
        />
      </div>
    </div>
  )
}
