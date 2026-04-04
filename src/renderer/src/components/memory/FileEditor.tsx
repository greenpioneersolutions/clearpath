import { useState, useEffect, useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import type { ConfigFile } from '../../types/memory'

interface Props {
  cli: 'copilot' | 'claude'
  workingDirectory: string
  onNewFile: () => void
}

const CATEGORY_ORDER = ['instructions', 'settings', 'agent', 'skill', 'command', 'rule'] as const
const CATEGORY_LABELS: Record<string, string> = {
  instructions: 'Instructions',
  settings: 'Settings',
  agent: 'Agents',
  skill: 'Skills',
  command: 'Commands',
  rule: 'Rules',
}

function getExtensions(path: string) {
  if (path.endsWith('.json')) return [json()]
  return [markdown()]
}

export default function FileEditor({ cli, workingDirectory, onNewFile }: Props): JSX.Element {
  const [files, setFiles] = useState<ConfigFile[]>([])
  const [selected, setSelected] = useState<ConfigFile | null>(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadFiles = useCallback(async () => {
    const result = await window.electronAPI.invoke('memory:list-files', {
      cli,
      workingDirectory,
    }) as ConfigFile[]
    setFiles(result)
  }, [cli, workingDirectory])

  useEffect(() => { void loadFiles() }, [loadFiles])

  const selectFile = useCallback(async (file: ConfigFile) => {
    setSelected(file)
    setSaveError('')
    if (!file.exists) {
      setContent('')
      setSavedContent('')
      return
    }
    setLoading(true)
    const result = await window.electronAPI.invoke('memory:read-file', { path: file.path }) as
      | { content: string }
      | { error: string }
    setLoading(false)
    if ('error' in result) {
      setContent('')
      setSavedContent('')
    } else {
      setContent(result.content)
      setSavedContent(result.content)
    }
  }, [])

  const save = useCallback(async () => {
    if (!selected) return
    setSaving(true)
    setSaveError('')
    const result = await window.electronAPI.invoke('memory:write-file', {
      path: selected.path,
      content,
    }) as { success?: boolean; error?: string }
    setSaving(false)
    if (result.error) {
      setSaveError(result.error)
    } else {
      setSavedContent(content)
      setSelected((prev) => prev ? { ...prev, exists: true } : prev)
      void loadFiles()
    }
  }, [selected, content, loadFiles])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void save()
      }
    },
    [save],
  )

  const grouped = CATEGORY_ORDER.reduce<Record<string, ConfigFile[]>>((acc, cat) => {
    acc[cat] = files.filter((f) => f.category === cat)
    return acc
  }, {} as Record<string, ConfigFile[]>)

  const isDirty = content !== savedContent

  return (
    <div className="flex h-full" onKeyDown={handleKeyDown}>
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Config Files</span>
          <button
            onClick={onNewFile}
            className="text-indigo-400 hover:text-indigo-300 text-xs font-medium"
            title="New file"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {CATEGORY_ORDER.map((cat) => {
            const group = grouped[cat]
            if (!group || group.length === 0) return null
            return (
              <div key={cat} className="mb-2">
                <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {CATEGORY_LABELS[cat]}
                </div>
                {group.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => void selectFile(file)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono truncate flex items-center gap-1.5 transition-colors ${
                      selected?.path === file.path
                        ? 'bg-indigo-700 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                    }`}
                    title={file.path}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        file.exists ? 'bg-green-400' : 'bg-gray-600'
                      }`}
                    />
                    <span className="truncate">{file.name}</span>
                    {file.isGlobal && (
                      <span className="ml-auto text-gray-600 flex-shrink-0">G</span>
                    )}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Editor pane */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            {/* Header bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-700 bg-gray-800 flex-shrink-0">
              <span className="text-sm font-mono text-gray-300 truncate flex-1" title={selected.path}>
                {selected.path}
              </span>
              {isDirty && (
                <span className="text-xs text-yellow-400">unsaved changes</span>
              )}
              {saveError && (
                <span className="text-xs text-red-400">{saveError}</span>
              )}
              <button
                onClick={() => void save()}
                disabled={saving || !isDirty}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors flex-shrink-0"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  Loading…
                </div>
              ) : (
                <CodeMirror
                  value={content}
                  height="100%"
                  theme={oneDark}
                  extensions={getExtensions(selected.path)}
                  onChange={(val) => setContent(val)}
                  className="h-full text-sm"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLineGutter: true,
                    highlightActiveLine: true,
                  }}
                />
              )}
            </div>

            {!selected.exists && (
              <div className="px-4 py-2 bg-yellow-900/30 border-t border-yellow-700/30 text-xs text-yellow-400 flex-shrink-0">
                This file does not exist yet. Save to create it.
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
            Select a file from the sidebar to edit
          </div>
        )}
      </div>
    </div>
  )
}
