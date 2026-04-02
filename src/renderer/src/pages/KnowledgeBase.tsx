import { useState, useEffect, useCallback } from 'react'

interface KBFile { name: string; path: string; content: string; lastUpdated: number }
interface KBSection { id: string; label: string; filename: string }
interface SearchResult { file: string; snippet: string; line: number }

type View = 'browse' | 'generate' | 'ask'

export default function KnowledgeBase(): JSX.Element {
  const [view, setView] = useState<View>('browse')
  const [cwd, setCwd] = useState('.')
  const [files, setFiles] = useState<KBFile[]>([])
  const [sections, setSections] = useState<KBSection[]>([])
  const [selectedFile, setSelectedFile] = useState<KBFile | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  // Generate form
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set())
  const [genCli, setGenCli] = useState<'copilot' | 'claude'>('claude')
  const [genModel, setGenModel] = useState('opus')
  const [genDepth, setGenDepth] = useState<'quick' | 'standard' | 'deep'>('standard')
  const [generating, setGenerating] = useState(false)

  // Q&A
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const cwdResult = await window.electronAPI.invoke('app:get-cwd') as string
    setCwd(cwdResult)
    const [f, s] = await Promise.all([
      window.electronAPI.invoke('kb:list-files', { cwd: cwdResult }) as Promise<KBFile[]>,
      window.electronAPI.invoke('kb:get-sections') as Promise<KBSection[]>,
    ])
    setFiles(f)
    setSections(s)
    if (f.length > 0 && !selectedFile) setSelectedFile(f[0])
    // Default select all sections
    if (selectedSections.size === 0) setSelectedSections(new Set(s.map((sec) => sec.id)))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSearch = async () => {
    if (!search.trim()) { setSearchResults([]); return }
    const results = await window.electronAPI.invoke('kb:search', { cwd, query: search }) as SearchResult[]
    setSearchResults(results)
  }

  useEffect(() => { void handleSearch() }, [search])

  const handleGenerate = async () => {
    setGenerating(true)
    setMessage('Generating knowledge base...')
    await window.electronAPI.invoke('kb:generate', {
      cwd, sectionIds: Array.from(selectedSections),
      cli: genCli, model: genModel, depth: genDepth,
    })
    setGenerating(false)
    setMessage('Generation complete!')
    setTimeout(() => setMessage(''), 3000)
    setView('browse')
    void load()
  }

  const handleUpdate = async () => {
    setMessage('Updating knowledge base...')
    await window.electronAPI.invoke('kb:update', { cwd, cli: genCli, model: genModel })
    setMessage('Update started — check Sub-Agents for progress')
    setTimeout(() => setMessage(''), 3000)
  }

  const handleAsk = async () => {
    if (!question.trim()) return
    setAsking(true)
    await window.electronAPI.invoke('kb:ask', { cwd, question: question.trim(), cli: genCli })
    setAsking(false)
    setMessage('Question sent — check Sub-Agents for the answer')
    setTimeout(() => setMessage(''), 3000)
    setQuestion('')
  }

  const handleExport = async () => {
    const result = await window.electronAPI.invoke('kb:export-file', { cwd }) as { path?: string; error?: string }
    if (result.path) setMessage(`Exported to ${result.path}`)
    else if (result.error) setMessage(result.error)
    setTimeout(() => setMessage(''), 3000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-sm text-gray-500 mt-0.5">{files.length} section{files.length !== 1 ? 's' : ''} generated</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void handleUpdate()} disabled={files.length === 0}
            className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">Update</button>
          <button onClick={() => void handleExport()} disabled={files.length === 0}
            className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">Export</button>
          <button onClick={() => setView('generate')}
            className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">Generate</button>
        </div>
      </div>

      {message && <div className="text-xs px-3 py-2 rounded-lg bg-green-50 text-green-600">{message}</div>}

      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {([['browse', 'Browse'], ['ask', 'Quick Answer'], ['generate', 'Generate']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              view === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'
            }`}>{l}</button>
          ))}
        </nav>
      </div>

      {view === 'browse' && (
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-56 flex-shrink-0 space-y-3">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search docs..."
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {search && searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.slice(0, 10).map((r, i) => (
                  <button key={i} onClick={() => {
                    const f = files.find((fl) => fl.name === r.file)
                    if (f) setSelectedFile(f)
                    setSearch('')
                  }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 text-xs">
                    <span className="text-indigo-600 font-medium">{r.file}</span>
                    <span className="text-gray-400 ml-1">:{r.line}</span>
                    <p className="text-gray-500 mt-0.5 truncate">{r.snippet.split('\n')[0]}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {files.map((f) => (
                  <button key={f.path} onClick={() => setSelectedFile(f)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedFile?.path === f.path ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}>
                    {f.name}
                    <span className={`block text-xs mt-0.5 ${selectedFile?.path === f.path ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {new Date(f.lastUpdated).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reading pane */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-h-[600px] overflow-y-auto">
            {selectedFile ? (
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-sans">
                  {selectedFile.content}
                </pre>
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-12">Select a section or generate the knowledge base</p>
            )}
          </div>
        </div>
      )}

      {view === 'ask' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Quick Answer</h3>
            <p className="text-xs text-gray-500 mt-0.5">Ask a question about your codebase — answered using the knowledge base + live code access</p>
          </div>
          <div className="flex gap-2">
            <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAsk() }}
              placeholder="How does authentication work?"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={() => void handleAsk()} disabled={asking || !question.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40">
              {asking ? 'Asking...' : 'Ask'}
            </button>
          </div>
        </div>
      )}

      {view === 'generate' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Generate Knowledge Base</h3>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Sections to generate</label>
            <div className="grid grid-cols-2 gap-1.5">
              {sections.map((s) => (
                <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selectedSections.has(s.id)}
                    onChange={(e) => {
                      const next = new Set(selectedSections)
                      e.target.checked ? next.add(s.id) : next.delete(s.id)
                      setSelectedSections(next)
                    }} className="accent-indigo-600" />
                  <span className="text-sm text-gray-700">{s.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">CLI</label>
              <select value={genCli} onChange={(e) => setGenCli(e.target.value as 'copilot' | 'claude')}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="claude">Claude Code</option><option value="copilot">Copilot</option>
              </select></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
              <input type="text" value={genModel} onChange={(e) => setGenModel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Depth</label>
              <select value={genDepth} onChange={(e) => setGenDepth(e.target.value as 'quick' | 'standard' | 'deep')}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
                <option value="quick">Quick Overview</option><option value="standard">Standard</option><option value="deep">Deep Dive</option>
              </select></div>
          </div>
          <button onClick={() => void handleGenerate()} disabled={generating || selectedSections.size === 0}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg">
            {generating ? 'Generating...' : `Generate ${selectedSections.size} Section${selectedSections.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  )
}
