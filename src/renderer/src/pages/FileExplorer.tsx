import { useState, useEffect, useCallback } from 'react'

interface FileEntry {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  size: number
  modifiedAt: number
}

const AI_ACTIONS = [
  { label: 'Explain this file', prompt: 'Explain what {{FILE}} does, its purpose, and key functions.' },
  { label: 'Review this file', prompt: 'Review {{FILE}} for code quality, bugs, and security issues.' },
  { label: 'Write tests', prompt: 'Write comprehensive tests for {{FILE}}.' },
  { label: 'Refactor', prompt: 'Refactor {{FILE}} to improve readability and reduce complexity.' },
]

export default function FileExplorer(): JSX.Element {
  const [cwd, setCwd] = useState('.')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [contextMenu, setContextMenu] = useState<{ file: FileEntry; x: number; y: number } | null>(null)
  const [changes, setChanges] = useState<Array<{ eventType: string; filename: string; time: number }>>([])
  const [focusFiles, setFocusFiles] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const cwdResult = await window.electronAPI.invoke('app:get-cwd') as string
    setCwd(cwdResult)
    const result = await window.electronAPI.invoke('files:list', { cwd: cwdResult }) as FileEntry[]
    setFiles(result)
    setLoading(false)
    // Start watching
    await window.electronAPI.invoke('files:watch', { cwd: cwdResult })
  }, [])

  useEffect(() => { void load() }, [load])

  // File change notifications
  useEffect(() => {
    const off = window.electronAPI.on('files:changed', (data: { eventType: string; filename: string }) => {
      setChanges((prev) => [{ ...data, time: Date.now() }, ...prev.slice(0, 49)])
    })
    return off
  }, [])

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault()
    setContextMenu({ file, x: e.clientX, y: e.clientY })
  }

  const handleAiAction = async (action: typeof AI_ACTIONS[number], file: FileEntry) => {
    setContextMenu(null)
    const prompt = action.prompt.replace(/\{\{FILE\}\}/g, file.relativePath)
    const sessions = await window.electronAPI.invoke('cli:list-sessions') as Array<{ sessionId: string; status: string }>
    const running = sessions.filter((s) => s.status === 'running')
    if (running.length > 0) {
      await window.electronAPI.invoke('cli:send-input', { sessionId: running[0].sessionId, input: prompt })
    }
  }

  const toggleFocus = (file: FileEntry) => {
    setFocusFiles((prev) => {
      const next = new Set(prev)
      if (next.has(file.path)) next.delete(file.path)
      else next.add(file.path)
      return next
    })
  }

  const filtered = files.filter((f) => {
    if (!search) return !f.isDirectory || true
    return f.relativePath.toLowerCase().includes(search.toLowerCase())
  })

  const directories = filtered.filter((f) => f.isDirectory)
  const fileEntries = filtered.filter((f) => !f.isDirectory)

  return (
    <div className="space-y-6" onClick={() => setContextMenu(null)}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">File Explorer</h1>
          <p className="text-sm text-gray-500 mt-0.5 font-mono">{cwd}</p>
        </div>
        {focusFiles.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-indigo-600">{focusFiles.size} focused</span>
            <button onClick={() => setFocusFiles(new Set())}
              className="text-xs text-gray-400 hover:text-red-500">Clear</button>
          </div>
        )}
      </div>

      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search files..."
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* File tree */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4 max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
          ) : (
            <div className="space-y-0.5 text-sm font-mono">
              {fileEntries.slice(0, 200).map((f) => {
                const isFocused = focusFiles.has(f.path)
                const recentChange = changes.find((c) => f.relativePath.endsWith(c.filename))
                return (
                  <div key={f.path}
                    onContextMenu={(e) => handleContextMenu(e, f)}
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-default group ${
                      isFocused ? 'bg-indigo-50 border border-indigo-200' : recentChange ? 'bg-yellow-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-gray-400 text-xs w-4">
                      {f.name.endsWith('.ts') || f.name.endsWith('.tsx') ? 'TS' :
                       f.name.endsWith('.js') ? 'JS' :
                       f.name.endsWith('.json') ? '{}' :
                       f.name.endsWith('.md') ? 'MD' : '  '}
                    </span>
                    <span className="text-gray-700 truncate flex-1">{f.relativePath}</span>
                    {recentChange && <span className="text-xs text-yellow-500 flex-shrink-0">changed</span>}
                    <button onClick={() => toggleFocus(f)}
                      className={`text-xs px-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                        isFocused ? 'text-indigo-600' : 'text-gray-400'
                      }`}>
                      {isFocused ? 'Unfocus' : 'Focus'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Changes feed */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Changes</h3>
          {changes.length === 0 ? (
            <p className="text-xs text-gray-400">No file changes detected yet</p>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {changes.slice(0, 30).map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    c.eventType === 'rename' ? 'bg-blue-400' : 'bg-yellow-400'
                  }`} />
                  <span className="text-gray-600 truncate flex-1 font-mono">{c.filename}</span>
                  <span className="text-gray-400 flex-shrink-0">
                    {new Date(c.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          {AI_ACTIONS.map((action) => (
            <button key={action.label}
              onClick={() => void handleAiAction(action, contextMenu.file)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
              {action.label}
            </button>
          ))}
          <hr className="my-1 border-gray-100" />
          <button onClick={() => { toggleFocus(contextMenu.file); setContextMenu(null) }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 transition-colors">
            {focusFiles.has(contextMenu.file.path) ? 'Remove from Focus' : 'Add to Focus'}
          </button>
        </div>
      )}
    </div>
  )
}
