import { useEffect, useState } from 'react'

interface SavedWorkflow {
  id: string
  name: string
  description: string
  steps: Array<{ id: string }>
  createdAt: number
  lastUsedAt?: number
  usageCount: number
}

interface Props {
  /** Called when the user clicks a workflow card. Should navigate to the Composer with the id. */
  onOpenWorkflow: (workflowId: string) => void
}

function timeAgo(ms?: number): string {
  if (!ms) return 'never'
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default function WorkflowsCard({ onOpenWorkflow }: Props): JSX.Element {
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const list = await window.electronAPI.invoke('workflow:list') as SavedWorkflow[] | null
        setWorkflows(Array.isArray(list) ? list : [])
      } catch {
        setWorkflows([])
      }
      setLoading(false)
    })()
  }, [])

  const top = [...workflows]
    .sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt))
    .slice(0, 6)

  return (
    <section
      data-testid="workflows-card"
      className="rounded-2xl bg-gray-900/40 border border-gray-800 p-5"
    >
      <header className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-white text-sm font-semibold">Workflows</h3>
          <p className="text-gray-500 text-xs mt-0.5">Recently used multi-step playbooks.</p>
        </div>
      </header>

      {loading ? (
        <div className="text-xs text-gray-500 py-6 text-center">Loading workflows...</div>
      ) : top.length === 0 ? (
        <div className="text-xs text-gray-500 py-8 text-center">
          No saved workflows yet — build one in Compose.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {top.map((wf) => (
            <li key={wf.id}>
              <button
                data-testid="workflow-row"
                onClick={() => onOpenWorkflow(wf.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-800 hover:border-indigo-500/60 hover:bg-gray-800/40 transition-colors group"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-gray-200 truncate group-hover:text-white">
                    {wf.name}
                  </span>
                  <span className="text-[10px] text-gray-500 flex-shrink-0">
                    {timeAgo(wf.lastUsedAt ?? wf.createdAt)}
                  </span>
                </div>
                {wf.description && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{wf.description}</p>
                )}
                <p className="text-[10px] text-gray-600 mt-1">
                  {wf.steps.length} step{wf.steps.length === 1 ? '' : 's'}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
