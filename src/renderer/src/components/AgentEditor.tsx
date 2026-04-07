import { useEffect, useState, useCallback } from 'react'
import type { AgentDef } from '../types/ipc'

interface Props {
  agent: AgentDef | null
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

interface ParsedAgent {
  name: string
  description: string
  model: string
  tools: string[]
  prompt: string
}

function parseFrontmatter(raw: string): ParsedAgent {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!match) return { name: '', description: '', model: '', tools: [], prompt: raw.trim() }

  const meta: Record<string, string | string[]> = {}
  const yamlLines = match[1].split('\n')
  let currentListKey: string | null = null
  let currentList: string[] = []

  const flushList = () => {
    if (currentListKey && currentList.length > 0) {
      meta[currentListKey] = currentList
      currentList = []
      currentListKey = null
    }
  }

  for (const rawLine of yamlLines) {
    const line = rawLine.replace(/\r$/, '')
    const listItemMatch = /^\s+-\s+(.+)$/.exec(line)
    if (listItemMatch) { currentList.push(listItemMatch[1].trim()); continue }
    flushList()
    const kvMatch = /^([\w-]+):\s*(.*)$/.exec(line)
    if (!kvMatch) continue
    const key = kvMatch[1]
    const value = kvMatch[2].trim()
    if (!value) { currentListKey = key }
    else if (value.includes(',')) { meta[key] = value.split(',').map((s) => s.trim()).filter(Boolean) }
    else { meta[key] = value }
  }
  flushList()

  return {
    name: typeof meta.name === 'string' ? meta.name : '',
    description: typeof meta.description === 'string' ? meta.description : '',
    model: typeof meta.model === 'string' ? meta.model : '',
    tools: Array.isArray(meta.tools) ? meta.tools : typeof meta.tools === 'string' ? [meta.tools] : [],
    prompt: match[2].trim(),
  }
}

function serializeAgent(parsed: ParsedAgent): string {
  const lines: string[] = ['---']
  lines.push(`name: ${parsed.name}`)
  lines.push(`description: ${parsed.description}`)
  if (parsed.model) lines.push(`model: ${parsed.model}`)
  if (parsed.tools.length > 0) {
    lines.push('tools:')
    for (const t of parsed.tools) lines.push(`  - ${t}`)
  }
  lines.push('---', '')
  if (parsed.prompt) lines.push(parsed.prompt)
  return lines.join('\n')
}

export function AgentEditor({ agent, isOpen, onClose, onSaved }: Props): JSX.Element | null {
  const [parsed, setParsed] = useState<ParsedAgent>({ name: '', description: '', model: '', tools: [], prompt: '' })
  const [rawMode, setRawMode] = useState(false)
  const [rawContent, setRawContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [toolInput, setToolInput] = useState('')

  useEffect(() => {
    if (!isOpen || !agent?.filePath) return
    setLoading(true)
    setError(null)
    setDirty(false)
    setRawMode(false)
    void (
      window.electronAPI.invoke('agent:read-file', { filePath: agent.filePath }) as Promise<string>
    ).then((c) => {
      setRawContent(c)
      setParsed(parseFrontmatter(c))
      setLoading(false)
    }).catch((e: unknown) => {
      setError(String(e))
      setLoading(false)
    })
  }, [isOpen, agent?.filePath])

  const updateField = useCallback(<K extends keyof ParsedAgent>(key: K, value: ParsedAgent[K]) => {
    setParsed((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }, [])

  const handleSave = () => {
    if (!agent?.filePath) return
    setSaving(true)
    setError(null)
    const content = rawMode ? rawContent : serializeAgent(parsed)
    void window.electronAPI
      .invoke('agent:write-file', { filePath: agent.filePath, content })
      .then(() => {
        setSaving(false)
        setDirty(false)
        onSaved()
      })
      .catch((e: unknown) => {
        setError(String(e))
        setSaving(false)
      })
  }

  const handleAddTool = () => {
    const t = toolInput.trim()
    if (t && !parsed.tools.includes(t)) {
      updateField('tools', [...parsed.tools, t])
    }
    setToolInput('')
  }

  const handleRemoveTool = (tool: string) => {
    updateField('tools', parsed.tools.filter((t) => t !== tool))
  }

  const toggleRawMode = () => {
    if (rawMode) {
      // Switching from raw → structured: re-parse
      setParsed(parseFrontmatter(rawContent))
    } else {
      // Switching from structured → raw: serialize
      setRawContent(serializeAgent(parsed))
    }
    setRawMode(!rawMode)
  }

  if (!isOpen || !agent) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">Edit Agent</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">
              {agent.filePath}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {dirty && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Unsaved
              </span>
            )}
            <button
              onClick={toggleRawMode}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              title={rawMode ? 'Switch to structured editor' : 'Switch to raw markdown'}
            >
              {rawMode ? 'Structured' : 'Raw'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
              Loading...
            </div>
          ) : rawMode ? (
            <textarea
              value={rawContent}
              onChange={(e) => { setRawContent(e.target.value); setDirty(true) }}
              className="w-full h-full min-h-[400px] resize-none p-6 font-mono text-sm text-gray-800 leading-relaxed outline-none bg-gray-50"
              spellCheck={false}
              placeholder="---&#10;name: My Agent&#10;description: What this agent does&#10;---&#10;&#10;System prompt here..."
            />
          ) : (
            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Name</label>
                <input
                  type="text"
                  value={parsed.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={parsed.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={2}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Model <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={parsed.model}
                  onChange={(e) => updateField('model', e.target.value)}
                  placeholder="Leave blank for default"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Tools */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Tools <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                {parsed.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {parsed.tools.map((tool) => (
                      <span
                        key={tool}
                        className="text-xs px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1"
                      >
                        {tool}
                        <button
                          onClick={() => handleRemoveTool(tool)}
                          className="text-indigo-400 hover:text-indigo-600 ml-0.5"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={toolInput}
                    onChange={(e) => setToolInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTool() } }}
                    placeholder="Type a tool name and press Enter"
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button
                    onClick={handleAddTool}
                    disabled={!toolInput.trim()}
                    className="px-3 py-2 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-40 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  System Prompt
                </label>
                <textarea
                  value={parsed.prompt}
                  onChange={(e) => updateField('prompt', e.target.value)}
                  rows={16}
                  className="w-full text-sm border border-gray-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-300 resize-y font-mono leading-relaxed"
                  spellCheck={false}
                  placeholder="The system prompt that defines this agent's behavior..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {error && (
          <div className="px-6 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">
            {error}
          </div>
        )}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-gray-400">
            {rawMode ? 'Editing raw markdown with YAML frontmatter' : 'Structured editor — switch to Raw for full control'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !dirty}
              className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
