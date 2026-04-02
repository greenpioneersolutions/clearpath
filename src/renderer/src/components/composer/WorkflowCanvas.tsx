import { useState, useCallback, useRef } from 'react'
import StepCard, { type WorkflowStep } from './StepCard'

interface StepExecution {
  stepId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'rate-limited' | 'skipped'
  output: string
  elapsed?: number
  error?: string
}

interface Props {
  steps: WorkflowStep[]
  onStepsChange: (steps: WorkflowStep[]) => void
  onExecute: (steps: WorkflowStep[]) => void
  onSaveWorkflow: () => void
  onAddFromTemplate: () => void
  executions: StepExecution[]
  isExecuting: boolean
}

function createEmptyStep(): WorkflowStep {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    prompt: '',
    executionType: 'session',
    parallel: false,
    collapsed: false,
  }
}

export default function WorkflowCanvas({
  steps, onStepsChange, onExecute, onSaveWorkflow, onAddFromTemplate,
  executions, isExecuting,
}: Props): JSX.Element {
  const dragIdx = useRef<number | null>(null)
  const [costEstimate, setCostEstimate] = useState<{ totalTokens: number; estimatedCost: number } | null>(null)

  const updateStep = (index: number, step: WorkflowStep) => {
    const next = [...steps]
    // Auto-name
    if (!next[index].name && step.name === next[index].name) {
      step = { ...step, name: step.name || `Step ${index + 1}` }
    }
    next[index] = step
    onStepsChange(next)
  }

  const deleteStep = (index: number) => {
    onStepsChange(steps.filter((_, i) => i !== index))
  }

  const duplicateStep = (index: number) => {
    const copy = { ...steps[index], id: `step-${Date.now()}`, name: `${steps[index].name} (copy)` }
    const next = [...steps]
    next.splice(index + 1, 0, copy)
    onStepsChange(next)
  }

  const addStep = () => {
    const step = createEmptyStep()
    step.name = `Step ${steps.length + 1}`
    onStepsChange([...steps, step])
  }

  const handleDragStart = (index: number) => { dragIdx.current = index }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === index) return
    const next = [...steps]
    const [removed] = next.splice(dragIdx.current, 1)
    next.splice(index, 0, removed)
    dragIdx.current = index
    onStepsChange(next)
  }

  const handleDragEnd = () => { dragIdx.current = null }

  const estimateCost = async () => {
    const result = await window.electronAPI.invoke('workflow:estimate-cost', {
      steps: steps.filter((s) => s.prompt.trim()),
    }) as { totalTokens: number; estimatedCost: number }
    setCostEstimate(result)
    setTimeout(() => setCostEstimate(null), 5000)
  }

  const hasPrompts = steps.some((s) => s.prompt.trim())

  // If executing, show execution view
  if (isExecuting || executions.length > 0) {
    return (
      <div className="p-6 space-y-3">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Workflow Execution</h2>
          {!isExecuting && (
            <div className="flex gap-2">
              <button onClick={() => onExecute(steps)}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Run Again</button>
            </div>
          )}
        </div>

        {steps.map((step, i) => {
          const exec = executions.find((e) => e.stepId === step.id)
          return (
            <div key={step.id} className={`border rounded-xl px-4 py-3 transition-colors ${
              exec?.status === 'completed' ? 'border-green-200 bg-green-50' :
              exec?.status === 'failed' ? 'border-red-200 bg-red-50' :
              exec?.status === 'running' ? 'border-blue-200 bg-blue-50' :
              'border-gray-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                <span className="text-sm font-medium text-gray-800 flex-1">{step.name || `Step ${i + 1}`}</span>
                {exec?.status === 'running' && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  exec?.status === 'completed' ? 'bg-green-200 text-green-800' :
                  exec?.status === 'failed' ? 'bg-red-200 text-red-800' :
                  exec?.status === 'running' ? 'bg-blue-200 text-blue-800' :
                  'bg-gray-200 text-gray-600'
                }`}>{exec?.status ?? 'queued'}</span>
                {exec?.elapsed && <span className="text-xs text-gray-400">{Math.round(exec.elapsed / 1000)}s</span>}
              </div>
              {exec?.output && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer">View output</summary>
                  <pre className="mt-1 bg-gray-900 text-gray-200 text-xs font-mono p-3 rounded-lg max-h-48 overflow-y-auto whitespace-pre-wrap">{exec.output}</pre>
                </details>
              )}
              {exec?.error && <p className="text-xs text-red-600 mt-1">{exec.error}</p>}
            </div>
          )
        })}
      </div>
    )
  }

  // Editor view
  return (
    <div className="p-6 space-y-2">
      {/* Steps */}
      {steps.map((step, i) => (
        <StepCard
          key={step.id}
          step={step}
          index={i}
          isFirst={i === 0}
          onChange={(s) => updateStep(i, s)}
          onDelete={() => deleteStep(i)}
          onDuplicate={() => duplicateStep(i)}
          onInsertTemplate={onAddFromTemplate}
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDragEnd={handleDragEnd}
        />
      ))}

      {/* Canvas controls */}
      <div className="pt-4 space-y-3">
        <div className="flex gap-2">
          <button onClick={addStep}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 border-dashed rounded-xl hover:bg-gray-50 hover:border-indigo-300 transition-colors">
            + Add Step
          </button>
          <button onClick={onAddFromTemplate}
            className="px-4 py-2 text-sm text-indigo-600 border border-indigo-200 border-dashed rounded-xl hover:bg-indigo-50 transition-colors">
            + Add from Template
          </button>
        </div>

        <hr className="border-gray-200" />

        <div className="flex items-center gap-3">
          <button onClick={() => onExecute(steps)} disabled={!hasPrompts}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
            Execute Workflow
          </button>
          <button onClick={onSaveWorkflow} disabled={!hasPrompts}
            className="px-4 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-40">
            Save as Workflow
          </button>
          <button onClick={() => void estimateCost()} disabled={!hasPrompts}
            className="px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40">
            Estimate Cost
          </button>
          {costEstimate && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              ~{costEstimate.totalTokens.toLocaleString()} tokens · ~${costEstimate.estimatedCost.toFixed(4)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export { createEmptyStep }
