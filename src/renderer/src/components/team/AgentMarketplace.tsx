import { useState, useEffect, useCallback } from 'react'

interface MarketplaceAgent {
  id: string
  name: string
  description: string
  author: string
  cli: 'copilot' | 'claude'
  category: string
  prompt: string
  tools?: string[]
  model?: string
  downloads: number
  installed: boolean
}

export default function AgentMarketplace(): JSX.Element {
  const [agents, setAgents] = useState<MarketplaceAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.electronAPI.invoke('team:list-marketplace') as MarketplaceAgent[]
    setAgents(result)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleInstall = async (id: string) => {
    await window.electronAPI.invoke('team:install-marketplace-agent', { id })
    setAgents((prev) => prev.map((a) => a.id === id ? { ...a, installed: true } : a))
  }

  const handleUninstall = async (id: string) => {
    await window.electronAPI.invoke('team:uninstall-marketplace-agent', { id })
    setAgents((prev) => prev.map((a) => a.id === id ? { ...a, installed: false } : a))
  }

  const categories = ['all', ...Array.from(new Set(agents.map((a) => a.category)))]
  const filtered = agents.filter((a) => {
    if (category !== 'all' && a.category !== category) return false
    if (search) {
      const q = search.toLowerCase()
      return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Agent Marketplace</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Browse and install community-contributed agent definitions
        </p>
      </div>

      <div className="flex gap-3">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((agent) => (
            <div key={agent.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900">{agent.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{agent.description}</p>
                </div>
                {agent.installed ? (
                  <button onClick={() => void handleUninstall(agent.id)}
                    className="px-2.5 py-1 text-xs text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors flex-shrink-0">
                    Remove
                  </button>
                ) : (
                  <button onClick={() => void handleInstall(agent.id)}
                    className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex-shrink-0">
                    Install
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <span className="bg-gray-100 px-1.5 py-0.5 rounded">{agent.category}</span>
                <span className={agent.cli === 'copilot' ? 'text-purple-500' : 'text-orange-500'}>{agent.cli}</span>
                <span>{agent.author}</span>
                <span className="ml-auto">{agent.downloads.toLocaleString()} installs</span>
              </div>

              <button onClick={() => setExpanded(expanded === agent.id ? null : agent.id)}
                className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
                {expanded === agent.id ? 'Hide prompt' : 'View prompt'}
              </button>

              {expanded === agent.id && (
                <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap">{agent.prompt}</pre>
                  {agent.tools && agent.tools.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {agent.tools.map((t) => (
                        <span key={t} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
