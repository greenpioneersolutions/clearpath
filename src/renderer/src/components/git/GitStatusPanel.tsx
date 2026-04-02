import { useState, useEffect, useCallback } from 'react'

interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: Array<{ file: string; status: string }>
  modified: Array<{ file: string; status: string }>
  untracked: string[]
}

interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
  isAiCommit: boolean
}

interface Props {
  cwd: string
}

const STATUS_LABELS: Record<string, string> = {
  M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', U: 'Unmerged',
}

export default function GitStatusPanel({ cwd }: Props): JSX.Element {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, c] = await Promise.all([
        window.electronAPI.invoke('git:status', { cwd }) as Promise<GitStatus>,
        window.electronAPI.invoke('git:log', { cwd, limit: 15 }) as Promise<GitCommit[]>,
      ])
      setStatus(s)
      setCommits(c)
    } catch (err) {
      setError(String(err))
    }
    setLoading(false)
  }, [cwd])

  useEffect(() => { void load() }, [load])

  if (loading) return <div className="py-8 text-center text-gray-400 text-sm">Loading git status...</div>
  if (error) return <div className="py-8 text-center text-red-400 text-sm">{error}</div>
  if (!status) return <div className="py-8 text-center text-gray-400 text-sm">Not a git repository</div>

  const totalChanges = status.staged.length + status.modified.length + status.untracked.length

  return (
    <div className="space-y-5">
      {/* Branch info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-sm font-medium text-gray-800">{status.branch}</span>
        </div>
        {status.ahead > 0 && <span className="text-xs text-green-600">{status.ahead} ahead</span>}
        {status.behind > 0 && <span className="text-xs text-orange-600">{status.behind} behind</span>}
        <span className="text-xs text-gray-500">{totalChanges} change{totalChanges !== 1 ? 's' : ''}</span>
        <button onClick={() => void load()} className="ml-auto text-xs text-gray-500 hover:text-gray-700">Refresh</button>
      </div>

      {/* Changes */}
      {totalChanges > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Changes</h4>
          {status.staged.map((f) => (
            <FileRow key={`s-${f.file}`} file={f.file} status={f.status} section="staged" cwd={cwd} />
          ))}
          {status.modified.map((f) => (
            <FileRow key={`m-${f.file}`} file={f.file} status={f.status} section="modified" cwd={cwd} />
          ))}
          {status.untracked.map((f) => (
            <FileRow key={`u-${f}`} file={f} status="?" section="untracked" cwd={cwd} />
          ))}
        </div>
      )}

      {/* Commit timeline */}
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Recent Commits</h4>
        {commits.map((c) => (
          <div key={c.hash} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg ${
            c.isAiCommit ? 'bg-indigo-50' : 'hover:bg-gray-50'
          }`}>
            <div className="mt-1.5 flex-shrink-0">
              <div className={`w-2 h-2 rounded-full ${c.isAiCommit ? 'bg-indigo-400' : 'bg-gray-300'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800 truncate">{c.message}</span>
                {c.isAiCommit && <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded flex-shrink-0">AI</span>}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                <span className="font-mono">{c.shortHash}</span>
                <span className="mx-1">·</span>
                <span>{c.author}</span>
                <span className="mx-1">·</span>
                <span>{new Date(c.date).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FileRow({ file, status, section, cwd }: { file: string; status: string; section: string; cwd: string }): JSX.Element {
  const [showDiff, setShowDiff] = useState(false)
  const [diff, setDiff] = useState('')

  const handleShowDiff = async () => {
    if (showDiff) { setShowDiff(false); return }
    const d = await window.electronAPI.invoke('git:file-diff', { cwd, file }) as string
    setDiff(d)
    setShowDiff(true)
  }

  const handleRevert = async () => {
    if (!confirm(`Revert changes to ${file}?`)) return
    await window.electronAPI.invoke('git:revert-file', { cwd, file })
  }

  const sectionColors: Record<string, string> = {
    staged: 'text-green-600', modified: 'text-yellow-600', untracked: 'text-gray-400',
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 group">
        <span className={`text-xs font-mono w-5 text-center ${sectionColors[section]}`}>
          {STATUS_LABELS[status]?.[0] ?? status}
        </span>
        <span className="text-sm text-gray-700 font-mono truncate flex-1">{file}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {section !== 'untracked' && (
            <button onClick={() => void handleShowDiff()} className="text-xs text-indigo-500 hover:text-indigo-700 px-1">
              {showDiff ? 'Hide' : 'Diff'}
            </button>
          )}
          <button onClick={() => void handleRevert()} className="text-xs text-red-400 hover:text-red-600 px-1">
            Revert
          </button>
        </div>
      </div>
      {showDiff && diff && (
        <pre className="mx-3 mb-2 bg-gray-900 text-gray-200 text-xs font-mono p-3 rounded-lg overflow-x-auto max-h-48">
          {diff.split('\n').map((line, i) => (
            <div key={i} className={
              line.startsWith('+') ? 'text-green-400' :
              line.startsWith('-') ? 'text-red-400' :
              line.startsWith('@@') ? 'text-cyan-400' : ''
            }>{line}</div>
          ))}
        </pre>
      )}
    </div>
  )
}
