import { useState, useEffect, useCallback } from 'react'
import type { McpServerConfig } from '../../types/tools'

interface McpServerInfo {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  source: 'user' | 'project'
  cli: 'copilot' | 'claude'
}

interface Props {
  cli: 'copilot' | 'claude'
  workingDirectory?: string
}

export default function McpManager({ cli, workingDirectory }: Props): JSX.Element {
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  // Add form state
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [newArgs, setNewArgs] = useState('')
  const [newScope, setNewScope] = useState<'user' | 'project'>('project')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('tools:list-mcp-servers', {
      cli,
      workingDirectory,
    }) as McpServerInfo[]
    setServers(result)
    setLoading(false)
  }, [cli, workingDirectory])

  useEffect(() => { void load() }, [load])

  const toggle = async (server: McpServerInfo) => {
    await window.electronAPI.invoke('tools:toggle-mcp-server', {
      cli,
      scope: server.source,
      name: server.name,
      enabled: !server.enabled,
      workingDirectory,
    })
    setServers((prev) =>
      prev.map((s) => (s.id === server.id ? { ...s, enabled: !s.enabled } : s)),
    )
  }

  const remove = async (server: McpServerInfo) => {
    if (!confirm(`Remove MCP server "${server.name}"?`)) return
    await window.electronAPI.invoke('tools:remove-mcp-server', {
      cli,
      scope: server.source,
      name: server.name,
      workingDirectory,
    })
    setServers((prev) => prev.filter((s) => s.id !== server.id))
  }

  const add = async () => {
    if (!newName.trim() || !newCommand.trim()) {
      setAddError('Name and command are required')
      return
    }
    setAdding(true)
    setAddError('')
    const result = await window.electronAPI.invoke('tools:add-mcp-server', {
      cli,
      scope: newScope,
      name: newName.trim(),
      command: newCommand.trim(),
      args: newArgs.trim() ? newArgs.trim().split(/\s+/) : [],
      workingDirectory,
    }) as { success: boolean; error?: string }
    setAdding(false)

    if (!result.success) {
      setAddError(result.error ?? 'Failed to add server')
    } else {
      setNewName('')
      setNewCommand('')
      setNewArgs('')
      setShowAdd(false)
      void load()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">MCP Servers</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Model Context Protocol servers for {cli === 'claude' ? 'Claude Code' : 'Copilot'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add Server'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. my-mcp-server"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Scope</label>
              <select
                value={newScope}
                onChange={(e) => setNewScope(e.target.value as 'user' | 'project')}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="project">Project</option>
                <option value="user">User (global)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Command</label>
            <input
              type="text"
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              placeholder="e.g. npx, node, python"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Arguments (space-separated)</label>
            <input
              type="text"
              value={newArgs}
              onChange={(e) => setNewArgs(e.target.value)}
              placeholder="e.g. -y @modelcontextprotocol/server-filesystem /path/to/dir"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <button
            onClick={() => void add()}
            disabled={adding}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {adding ? 'Adding...' : 'Add Server'}
          </button>
        </div>
      )}

      {/* Server list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-400">No MCP servers configured</p>
          <p className="text-xs text-gray-400 mt-1">
            Click &quot;+ Add Server&quot; to configure one, or add entries to your{' '}
            {cli === 'claude' ? '.claude/mcp-config.json' : '.github/copilot/mcp-config.json'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className={`bg-white border rounded-lg px-4 py-3 transition-colors ${
                server.enabled ? 'border-gray-200' : 'border-gray-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{server.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      server.source === 'user'
                        ? 'bg-purple-100 text-purple-600'
                        : 'bg-blue-100 text-blue-600'
                    }`}>
                      {server.source}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-1 truncate">
                    {server.command}{server.args.length > 0 ? ` ${server.args.join(' ')}` : ''}
                  </div>
                  {Object.keys(server.env).length > 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      env: {Object.keys(server.env).join(', ')}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Toggle switch */}
                  <button
                    onClick={() => void toggle(server)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      server.enabled ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                    title={server.enabled ? 'Disable' : 'Enable'}
                    role="switch"
                    aria-checked={server.enabled}
                    aria-label={`Toggle MCP server ${server.name}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        server.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => void remove(server)}
                    className="text-gray-400 hover:text-red-500 transition-colors text-xs p-1"
                    title="Remove"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
