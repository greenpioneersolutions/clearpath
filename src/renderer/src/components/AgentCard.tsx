import type { AgentDef } from '../types/ipc'

interface Props {
  agent: AgentDef
  enabled: boolean
  isActive: boolean
  onToggle: (id: string, enabled: boolean) => void
  onSetActive: (id: string | null) => void
  onEdit?: (agent: AgentDef) => void
  onDelete?: (agent: AgentDef) => void
}

const CLI_COLORS = {
  copilot: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  claude: 'bg-orange-50 text-orange-700 border-orange-200',
}

const TOOL_LIMIT = 4

export function AgentCard({
  agent,
  enabled,
  isActive,
  onToggle,
  onSetActive,
  onEdit,
  onDelete,
}: Props): JSX.Element {
  const isBuiltin = agent.source === 'builtin'
  const visibleTools = agent.tools?.slice(0, TOOL_LIMIT) ?? []
  const extraTools = (agent.tools?.length ?? 0) - TOOL_LIMIT

  return (
    <div
      className={`relative bg-white rounded-xl border transition-shadow ${
        isActive
          ? 'border-indigo-400 shadow-md shadow-indigo-100'
          : enabled
          ? 'border-gray-200 shadow-sm hover:shadow-md'
          : 'border-gray-100 shadow-sm opacity-60'
      }`}
    >
      {/* Active indicator stripe */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t-xl" />
      )}

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm leading-tight truncate">
                {agent.name}
              </span>
              {isBuiltin && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">
                  built-in
                </span>
              )}
              {isActive && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 flex-shrink-0">
                  active
                </span>
              )}
            </div>
          </div>

          {/* Toggle */}
          <button
            onClick={() => onToggle(agent.id, !enabled)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
              enabled ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle agent"
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Description */}
        {agent.description && (
          <p className="text-xs text-gray-500 mb-3 leading-relaxed line-clamp-2">
            {agent.description}
          </p>
        )}

        {/* Meta row — model + tools */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {agent.model && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100 font-mono">
              {agent.model}
            </span>
          )}
          {visibleTools.map((tool) => (
            <span
              key={tool}
              className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
            >
              {tool}
            </span>
          ))}
          {extraTools > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
              +{extraTools}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSetActive(isActive ? null : agent.id)}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${
              isActive
                ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {isActive ? 'Deselect' : 'Use'}
          </button>

          {onEdit && (
            <button
              onClick={() => onEdit(agent)}
              className="text-xs py-1.5 px-3 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              title={isBuiltin ? 'Customize (creates a copy)' : 'Edit agent file'}
            >
              {isBuiltin ? 'Customize' : 'Edit'}
            </button>
          )}

          {!isBuiltin && onDelete && (
            <button
              onClick={() => onDelete(agent)}
              className="text-xs py-1.5 px-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Delete agent"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TrashIcon(): JSX.Element {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  )
}
