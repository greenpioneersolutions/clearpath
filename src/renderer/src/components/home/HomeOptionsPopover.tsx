import { useEffect, useRef } from 'react'
import type { BackendId, BackendProvider } from '../../../../shared/backends'
import { BACKEND_LABELS, providerOf, transportOf } from '../../../../shared/backends'
import { MODEL_TIERS } from '../../data/modelTiers'
import type { AgentDef } from '../../types/ipc'

export interface HomeOptionsPopoverProps {
  isOpen: boolean
  onClose: () => void
  /** Set of BackendIds the user can pick — caller filters by readiness. */
  readyBackends: BackendId[]
  backend: BackendId
  model: string
  agent: string
  agents: AgentDef[]
  onBackendChange: (b: BackendId) => void
  onModelChange: (m: string) => void
  onAgentChange: (id: string) => void
}

export default function HomeOptionsPopover({
  isOpen,
  onClose,
  readyBackends,
  backend,
  model,
  agent,
  agents,
  onBackendChange,
  onModelChange,
  onAgentChange,
}: HomeOptionsPopoverProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const provider: BackendProvider = providerOf(backend)
  const tiers = MODEL_TIERS[provider] ?? []
  const showBackendRow = readyBackends.length > 1

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Session options"
      className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-40 p-3 space-y-3"
    >
      {showBackendRow && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Backend</label>
          <select
            aria-label="Backend"
            value={backend}
            onChange={(e) => onBackendChange(e.target.value as BackendId)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {readyBackends.map((b) => (
              <option key={b} value={b}>{BACKEND_LABELS[b]}</option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Model</label>
        <select
          aria-label="Model"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">Default</option>
          {tiers.map((tier) => (
            <optgroup key={tier.group} label={tier.group}>
              {tier.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Agent</label>
        <select
          aria-label="Agent"
          value={agent}
          onChange={(e) => onAgentChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">None</option>
          {agents
            .filter((a) => providerOf(a.cli) === provider)
            .map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
        </select>
      </div>

      <p className="text-[10px] text-gray-400 leading-snug pt-1">
        These choices apply to this session only.
      </p>
    </div>
  )
}

/** Helper exposed for parent components to render a short pill label. */
export function backendPillLabel(backend: BackendId, model: string): string {
  const short = providerOf(backend) === 'copilot' ? 'Copilot' : 'Claude'
  const transport = transportOf(backend).toUpperCase()
  const modelShort = model ? ` · ${model}` : ''
  return `${short} ${transport}${modelShort}`
}
