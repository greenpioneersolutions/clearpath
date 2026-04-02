import { useState } from 'react'

interface Props {
  cli: 'copilot' | 'claude'
  allowedTools: string[]
  disallowedTools: string[]
  deniedTools: string[]
  availableTools: string[]
  excludedTools: string[]
  onAllowedChange: (tools: string[]) => void
  onDisallowedChange: (tools: string[]) => void
  onDeniedChange: (tools: string[]) => void
  onAvailableChange: (tools: string[]) => void
  onExcludedChange: (tools: string[]) => void
}

interface ToolListProps {
  label: string
  description: string
  placeholder: string
  items: string[]
  onChange: (items: string[]) => void
  color: string
}

function ToolList({ label, description, placeholder, items, onChange, color }: ToolListProps): JSX.Element {
  const [input, setInput] = useState('')

  const add = () => {
    const val = input.trim()
    if (!val || items.includes(val)) return
    onChange([...items, val])
    setInput('')
  }

  const remove = (tool: string) => {
    onChange(items.filter((t) => t !== tool))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-sm font-medium text-gray-800">{label}</h4>
        <p className="text-xs text-gray-500">{description}</p>
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Tags */}
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((tool) => (
            <span
              key={tool}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono ${color}`}
            >
              {tool}
              <button
                onClick={() => remove(tool)}
                className="hover:opacity-70 ml-0.5"
                title="Remove"
              >
                x
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">None configured</p>
      )}
    </div>
  )
}

export default function ToolToggles({
  cli,
  allowedTools,
  disallowedTools,
  deniedTools,
  availableTools,
  excludedTools,
  onAllowedChange,
  onDisallowedChange,
  onDeniedChange,
  onAvailableChange,
  onExcludedChange,
}: Props): JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Tool Permissions</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Configure which tools are allowed, denied, or excluded for {cli === 'claude' ? 'Claude Code' : 'Copilot'} sessions
        </p>
      </div>

      {/* Allowed tools — both CLIs */}
      <ToolList
        label="Allowed Tools"
        description={cli === 'claude'
          ? 'Tools that execute without prompting (--allowedTools)'
          : 'Allow specific tool patterns (--allow-tool)'}
        placeholder={cli === 'claude' ? 'e.g. Read, Write, Bash' : 'e.g. shell(git:*), MyMCP(create_issue)'}
        items={allowedTools}
        onChange={onAllowedChange}
        color="bg-green-100 text-green-700"
      />

      {/* Claude: disallowed tools */}
      {cli === 'claude' && (
        <ToolList
          label="Disallowed Tools"
          description="Tools removed from model context entirely (--disallowedTools)"
          placeholder="e.g. Bash, Write"
          items={disallowedTools}
          onChange={onDisallowedChange}
          color="bg-red-100 text-red-700"
        />
      )}

      {/* Copilot: denied tools */}
      {cli === 'copilot' && (
        <>
          <ToolList
            label="Denied Tools"
            description="Deny specific tool patterns — overrides allow rules (--deny-tool)"
            placeholder="e.g. shell(rm:*)"
            items={deniedTools}
            onChange={onDeniedChange}
            color="bg-red-100 text-red-700"
          />

          <ToolList
            label="Available Tools"
            description="Filter which tools the model can use — supports globs (--available-tools)"
            placeholder="e.g. shell, file_read"
            items={availableTools}
            onChange={onAvailableChange}
            color="bg-blue-100 text-blue-700"
          />

          <ToolList
            label="Excluded Tools"
            description="Exclude specific tools from use (--excluded-tools)"
            placeholder="e.g. shell, browser"
            items={excludedTools}
            onChange={onExcludedChange}
            color="bg-orange-100 text-orange-700"
          />
        </>
      )}
    </div>
  )
}
