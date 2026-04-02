import { useState } from 'react'

export interface WorkflowStep {
  id: string
  name: string
  prompt: string
  executionType: 'session' | 'sub-agent' | 'background'
  agent?: string
  model?: string
  workingDirectory?: string
  skill?: string
  permissionMode?: string
  maxBudget?: number
  parallel: boolean
  collapsed: boolean
}

interface Props {
  step: WorkflowStep
  index: number
  isFirst: boolean
  onChange: (step: WorkflowStep) => void
  onDelete: () => void
  onDuplicate: () => void
  onInsertTemplate: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}

const EXEC_TYPES: Array<{ value: WorkflowStep['executionType']; label: string; desc: string }> = [
  { value: 'session', label: 'In Session', desc: 'Runs in main chat' },
  { value: 'sub-agent', label: 'Sub-Agent', desc: 'Spawns dedicated process' },
  { value: 'background', label: 'Background', desc: 'Runs fully async' },
]

export default function StepCard({
  step, index, isFirst, onChange, onDelete, onDuplicate, onInsertTemplate,
  onDragStart, onDragOver, onDragEnd,
}: Props): JSX.Element {
  const [showConfig, setShowConfig] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const update = (partial: Partial<WorkflowStep>) => onChange({ ...step, ...partial })

  return (
    <div>
      {/* Dependency connector (between steps) */}
      {!isFirst && (
        <div className="flex items-center justify-center py-1">
          <button
            onClick={() => update({ parallel: !step.parallel })}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
              step.parallel
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title={step.parallel ? 'Runs in parallel with previous' : 'Waits for previous step'}
          >
            {step.parallel ? (
              <><svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="2" width="2" height="8" rx="0.5"/><rect x="8" y="2" width="2" height="8" rx="0.5"/></svg> Parallel</>
            ) : (
              <><svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><path d="M6 2v6m0 0L4 6m2 2l2-2"/></svg> Sequential</>
            )}
          </button>
        </div>
      )}

      {/* Step card */}
      <div
        className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
          {/* Drag handle */}
          <span className="cursor-grab text-gray-300 hover:text-gray-500 flex-shrink-0" title="Drag to reorder">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
              <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
              <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
            </svg>
          </span>

          {/* Step number */}
          <span className="text-xs font-bold text-gray-400 w-5">{index + 1}</span>

          {/* Editable name */}
          <input
            type="text"
            value={step.name}
            onChange={(e) => update({ name: e.target.value })}
            className="flex-1 text-sm font-medium text-gray-800 bg-transparent outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400 rounded px-1 -mx-1"
          />

          {/* Badges */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            step.executionType === 'session' ? 'bg-green-100 text-green-700' :
            step.executionType === 'sub-agent' ? 'bg-blue-100 text-blue-700' :
            'bg-purple-100 text-purple-700'
          }`}>
            {EXEC_TYPES.find((t) => t.value === step.executionType)?.label}
          </span>
          {step.agent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">{step.agent}</span>
          )}

          {/* Actions */}
          <button onClick={onDuplicate} className="text-gray-300 hover:text-gray-500 p-0.5" title="Duplicate">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
          {confirmDelete ? (
            <span className="flex items-center gap-1 text-[10px]">
              <button onClick={onDelete} className="text-red-600 hover:text-red-800 font-medium">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-gray-400">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-gray-300 hover:text-red-400 p-0.5" title="Delete">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          )}
          <button onClick={() => update({ collapsed: !step.collapsed })} className="text-gray-300 hover:text-gray-500 p-0.5">
            <svg className={`w-3.5 h-3.5 transition-transform ${step.collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>

        {/* Body (collapsible) */}
        {!step.collapsed && (
          <div className="p-3 space-y-3">
            {/* Prompt textarea */}
            <textarea
              value={step.prompt}
              onChange={(e) => update({ prompt: e.target.value })}
              placeholder="What should this step do?"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y font-mono"
            />

            {/* Execution type + template button row */}
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {EXEC_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => update({ executionType: t.value })}
                    className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      step.executionType === t.value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                    title={t.desc}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button onClick={onInsertTemplate}
                className="text-[11px] text-indigo-500 hover:text-indigo-700 px-2 py-1">
                From Template
              </button>
              <button onClick={() => setShowConfig(!showConfig)}
                className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1 ml-auto">
                {showConfig ? 'Hide Config' : 'Configure'}
              </button>
            </div>

            {/* Configuration (collapsible) */}
            {showConfig && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-500 mb-0.5">Agent</label>
                    <input type="text" value={step.agent ?? ''} onChange={(e) => update({ agent: e.target.value || undefined })}
                      placeholder="Default" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-0.5">Model</label>
                    <input type="text" value={step.model ?? ''} onChange={(e) => update({ model: e.target.value || undefined })}
                      placeholder="Inherit" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-0.5">Working Dir</label>
                    <input type="text" value={step.workingDirectory ?? ''} onChange={(e) => update({ workingDirectory: e.target.value || undefined })}
                      placeholder="Inherit" className="w-full border border-gray-200 rounded px-2 py-1 text-xs font-mono" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-0.5">Permission Mode</label>
                    <select value={step.permissionMode ?? ''} onChange={(e) => update({ permissionMode: e.target.value || undefined })}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs">
                      <option value="">Inherit</option>
                      <option value="default">Default</option>
                      <option value="acceptEdits">Accept Edits</option>
                      <option value="plan">Plan</option>
                      <option value="auto">Auto</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-gray-500 mb-0.5">Max Budget ($)</label>
                  <input type="number" value={step.maxBudget ?? ''} onChange={(e) => update({ maxBudget: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="No limit" step="0.5" className="w-32 border border-gray-200 rounded px-2 py-1 text-xs" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
