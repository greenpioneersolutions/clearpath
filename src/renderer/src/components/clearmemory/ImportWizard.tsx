import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ImportFormat,
  ImportProgress,
  Stream,
} from '../../../../shared/clearmemory/types'
import {
  importCancel,
  importPickPath,
  importPreview,
  importStart,
  streamsList,
  subscribeImportProgress,
} from '../../lib/clearmemoryClient'
import { toast } from '../../lib/toast'

// ── ImportWizard ─────────────────────────────────────────────────────────────
// Multi-step wizard:
//   1. Source: pick a file/dir and preview
//   2. Options: format, target stream, auto-tag
//   3. Progress: streaming log + progress bar, cancellable

interface Props {
  onChange?: () => void
}

type Step = 'source' | 'options' | 'progress'

const FORMATS: ReadonlyArray<{ value: ImportFormat; label: string; hint: string }> = [
  { value: 'auto', label: 'Auto-detect', hint: 'Let ClearMemory guess based on the path and contents.' },
  { value: 'claude_code', label: 'Claude Code session', hint: '~/.claude/projects/** session logs.' },
  { value: 'copilot', label: 'Copilot CLI session', hint: '~/.copilot/** session logs.' },
  { value: 'chatgpt', label: 'ChatGPT export', hint: 'conversations.json from ChatGPT data export.' },
  { value: 'slack', label: 'Slack export', hint: 'Slack workspace export directory.' },
  { value: 'markdown', label: 'Markdown files', hint: 'Any *.md file or directory tree.' },
  { value: 'clear', label: 'Clear Memory bundle', hint: 'A previously-exported ClearMemory bundle.' },
]

function detectFormat(path: string): ImportFormat {
  if (!path) return 'auto'
  const lower = path.toLowerCase()
  if (lower.endsWith('chatgpt-export.json') || lower.endsWith('conversations.json')) return 'chatgpt'
  if (lower.includes('/.claude/')) return 'claude_code'
  if (lower.includes('/.copilot/')) return 'copilot'
  if (lower.endsWith('.md')) return 'markdown'
  return 'auto'
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

interface Preview {
  path: string
  isDirectory: boolean
  fileCount: number
  sizeBytes: number
  mdCount: number
}

export default function ImportWizard({ onChange }: Props = {}): JSX.Element {
  const [step, setStep] = useState<Step>('source')

  // ── Step 1 state ────────────────────────────────────────────────────────────
  const [path, setPath] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)

  // ── Step 2 state ────────────────────────────────────────────────────────────
  const [format, setFormat] = useState<ImportFormat>('auto')
  const [streams, setStreams] = useState<Stream[]>([])
  const [streamName, setStreamName] = useState<string>('')
  const [autoTag, setAutoTag] = useState(false)

  // ── Step 3 state ────────────────────────────────────────────────────────────
  const [importId, setImportId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProgress[]>([])
  const [percent, setPercent] = useState<number | null>(null)
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [finished, setFinished] = useState<'ok' | 'error' | 'cancelled' | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const subRef = useRef<(() => void) | null>(null)

  // ── Path preview helpers ────────────────────────────────────────────────────
  const runPreview = useCallback(async (p: string) => {
    if (!p.trim()) {
      setPreview(null)
      setPreviewError(null)
      return
    }
    setPreviewing(true)
    setPreviewError(null)
    const result = await importPreview(p.trim())
    setPreviewing(false)
    if (!result.ok) {
      setPreview(null)
      setPreviewError(result.error)
      return
    }
    setPreview(result.data)
    setFormat((f) => (f === 'auto' ? detectFormat(result.data.path) : f))
  }, [])

  // Debounce manual-typing previews so we don't hammer the FS.
  useEffect(() => {
    if (!path.trim()) return
    const t = window.setTimeout(() => { void runPreview(path) }, 350)
    return () => window.clearTimeout(t)
  }, [path, runPreview])

  // Load streams once, lazily.
  useEffect(() => {
    let cancelled = false
    void streamsList().then((result) => {
      if (cancelled) return
      if (result.ok) setStreams(result.data.streams)
    })
    return () => { cancelled = true }
  }, [])

  // Clean up subscription on unmount.
  useEffect(() => () => { subRef.current?.() }, [])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function pickFile(): Promise<void> {
    const result = await importPickPath()
    if (!result.ok) {
      if (result.error && result.error !== 'Cancelled') toast.error(result.error)
      return
    }
    setPath(result.data.path)
    void runPreview(result.data.path)
  }

  function quickImport(rootPath: string, fmt: ImportFormat): void {
    setPath(rootPath)
    setFormat(fmt)
    void runPreview(rootPath)
  }

  async function startImport(): Promise<void> {
    setStep('progress')
    setProgress([])
    setPercent(null)
    setImportedCount(null)
    setTotal(null)
    setFinished(null)
    setStartError(null)

    const payload = {
      path: path.trim(),
      format,
      stream: streamName.trim() || undefined,
      autoTag,
    }

    const result = await importStart(payload)
    if (!result.ok) {
      setStartError(result.error)
      setFinished('error')
      return
    }
    const id = result.data.id
    setImportId(id)

    // Subscribe to progress events. The handler only forwards events for this id.
    subRef.current?.()
    subRef.current = subscribeImportProgress(id, (event) => {
      setProgress((prev) => {
        const next = [...prev, event]
        return next.length > 400 ? next.slice(next.length - 400) : next
      })
      if (typeof event.percent === 'number') setPercent(event.percent)
      if (typeof event.imported === 'number') setImportedCount(event.imported)
      if (typeof event.total === 'number') setTotal(event.total)
      if (event.kind === 'done') {
        setFinished('ok')
        setPercent(100)
        onChange?.()
      } else if (event.kind === 'error') {
        setFinished((f) => f ?? 'error')
      }
    })
  }

  async function cancelImport(): Promise<void> {
    if (!importId) return
    const result = await importCancel(importId)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setFinished('cancelled')
    toast.info('Cancelling import…')
  }

  function resetAll(): void {
    subRef.current?.()
    subRef.current = null
    setStep('source')
    setImportId(null)
    setProgress([])
    setPercent(null)
    setImportedCount(null)
    setTotal(null)
    setFinished(null)
    setStartError(null)
  }

  const canProceedFromSource = !!preview && !previewError
  const canStart = canProceedFromSource && !!format

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <StepHeader step={step} />

      {step === 'source' && (
        <SourceStep
          path={path}
          onPathChange={setPath}
          onPick={() => { void pickFile() }}
          onQuickImport={quickImport}
          preview={preview}
          previewing={previewing}
          previewError={previewError}
          canNext={canProceedFromSource}
          onNext={() => setStep('options')}
        />
      )}

      {step === 'options' && (
        <OptionsStep
          path={path}
          format={format}
          onFormatChange={setFormat}
          streams={streams}
          streamName={streamName}
          onStreamChange={setStreamName}
          autoTag={autoTag}
          onAutoTagChange={setAutoTag}
          onBack={() => setStep('source')}
          canStart={canStart}
          onStart={() => { void startImport() }}
        />
      )}

      {step === 'progress' && (
        <ProgressStep
          progress={progress}
          percent={percent}
          imported={importedCount}
          total={total}
          finished={finished}
          startError={startError}
          canCancel={importId !== null && finished == null}
          onCancel={() => { void cancelImport() }}
          onDone={resetAll}
        />
      )}
    </div>
  )
}

// ── Step header ──────────────────────────────────────────────────────────────

function StepHeader({ step }: { step: Step }): JSX.Element {
  const steps: Array<{ id: Step; label: string }> = [
    { id: 'source', label: 'Source' },
    { id: 'options', label: 'Options' },
    { id: 'progress', label: 'Progress' },
  ]
  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => {
        const active = s.id === step
        const done = steps.findIndex((x) => x.id === step) > i
        return (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                active
                  ? 'bg-indigo-600 text-white'
                  : done
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-800 border border-gray-700 text-gray-400'
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-xs ${active ? 'text-white font-medium' : 'text-gray-500'}`}>{s.label}</span>
            {i < steps.length - 1 && <span className="text-gray-700">&rarr;</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Source step ──────────────────────────────────────────────────────────────

function SourceStep(props: {
  path: string
  onPathChange: (p: string) => void
  onPick: () => void
  onQuickImport: (path: string, format: ImportFormat) => void
  preview: Preview | null
  previewing: boolean
  previewError: string | null
  canNext: boolean
  onNext: () => void
}): JSX.Element {
  const { path, onPathChange, onPick, onQuickImport, preview, previewing, previewError, canNext, onNext } = props

  const homeHint = useMemo(() => {
    // We don't have `homedir()` in the renderer but we can assume conventional
    // expansion works in the backend; display user-friendly shortcuts.
    return [
      { label: 'Quick-import Claude Code', path: '~/.claude/projects/', format: 'claude_code' as const },
      { label: 'Quick-import Copilot', path: '~/.copilot/', format: 'copilot' as const },
    ]
  }, [])

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Pick a file or directory to ingest. ClearMemory will embed every entry for cross-session recall.
      </p>

      <div className="flex flex-wrap gap-2">
        {homeHint.map((qi) => (
          <button
            key={qi.path}
            onClick={() => onQuickImport(qi.path, qi.format)}
            className="px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-xs text-gray-200"
          >
            {qi.label}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Source path
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            placeholder="/path/to/export or ~/.claude/projects/"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
          />
          <button
            onClick={onPick}
            className="px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-sm"
          >
            {'Browse\u2026'}
          </button>
        </div>
        <div className="text-[11px] text-gray-500 mt-1">
          Path must live under your home directory, temp dir, or the current workspace.
        </div>
      </div>

      <div className="border border-gray-700 rounded-lg p-4 bg-gray-900/40">
        {previewing && <div className="text-xs text-gray-400 animate-pulse">Previewing path…</div>}
        {!previewing && previewError && (
          <div className="text-xs text-red-300 break-words">{previewError}</div>
        )}
        {!previewing && !previewError && preview && (
          <div className="text-xs text-gray-300 space-y-1">
            <div><span className="text-gray-500">Path:</span> <span className="font-mono">{preview.path}</span></div>
            <div>
              {preview.isDirectory
                ? `Directory \u00B7 ${preview.fileCount} files (${preview.mdCount} .md) \u00B7 ${formatBytes(preview.sizeBytes)}`
                : `File \u00B7 ${formatBytes(preview.sizeBytes)}`}
            </div>
          </div>
        )}
        {!previewing && !previewError && !preview && (
          <div className="text-xs text-gray-500">Pick a path above to preview what will be imported.</div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          disabled={!canNext}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium"
        >
          Next: Options &rsaquo;
        </button>
      </div>
    </div>
  )
}

// ── Options step ─────────────────────────────────────────────────────────────

function OptionsStep(props: {
  path: string
  format: ImportFormat
  onFormatChange: (f: ImportFormat) => void
  streams: Stream[]
  streamName: string
  onStreamChange: (name: string) => void
  autoTag: boolean
  onAutoTagChange: (v: boolean) => void
  onBack: () => void
  canStart: boolean
  onStart: () => void
}): JSX.Element {
  const { format, onFormatChange, streams, streamName, onStreamChange, autoTag, onAutoTagChange, onBack, canStart, onStart } = props

  const formatHint = FORMATS.find((f) => f.value === format)?.hint

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Format</label>
        <select
          value={format}
          onChange={(e) => onFormatChange(e.target.value as ImportFormat)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        {formatHint && <div className="text-[11px] text-gray-500 mt-1">{formatHint}</div>}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Target stream (optional)
        </label>
        <select
          value={streamName}
          onChange={(e) => onStreamChange(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">(active stream)</option>
          {streams.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
        <div className="text-[11px] text-gray-500 mt-1">
          Leave blank to import into whichever stream is currently active.
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
        <input
          type="checkbox"
          checked={autoTag}
          onChange={(e) => onAutoTagChange(e.target.checked)}
          className="accent-indigo-500"
        />
        <span>Auto-tag imported memories (<code className="text-gray-400">--auto-tag</code>)</span>
      </label>

      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-sm"
        >
          &lsaquo; Back
        </button>
        <button
          onClick={onStart}
          disabled={!canStart}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium"
        >
          Start import
        </button>
      </div>
    </div>
  )
}

// ── Progress step ────────────────────────────────────────────────────────────

function ProgressStep(props: {
  progress: ImportProgress[]
  percent: number | null
  imported: number | null
  total: number | null
  finished: 'ok' | 'error' | 'cancelled' | null
  startError: string | null
  canCancel: boolean
  onCancel: () => void
  onDone: () => void
}): JSX.Element {
  const { progress, percent, imported, total, finished, startError, canCancel, onCancel, onDone } = props
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [progress])

  const tail = progress.slice(-12)

  return (
    <div className="space-y-4">
      {startError && (
        <div className="bg-red-900/30 border border-red-700/60 rounded-md px-3 py-2 text-xs text-red-200 break-words">
          {startError}
        </div>
      )}

      <div>
        <div className="flex justify-between text-[11px] text-gray-500 mb-1">
          <span>
            {finished === 'ok' && 'Import complete'}
            {finished === 'error' && 'Import failed'}
            {finished === 'cancelled' && 'Cancelled'}
            {finished == null && 'Importing\u2026'}
          </span>
          <span>
            {percent != null ? `${percent}%` : imported != null ? `${imported}${total ? '/' + total : ''}` : ''}
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-900 border border-gray-700 overflow-hidden">
          <div
            className={`h-full transition-all ${
              finished === 'ok' ? 'bg-teal-500'
              : finished === 'error' ? 'bg-red-500'
              : finished === 'cancelled' ? 'bg-amber-500'
              : 'bg-indigo-500'
            } ${percent == null && finished == null ? 'animate-pulse' : ''}`}
            style={{ width: `${percent ?? (finished ? 100 : 10)}%` }}
          />
        </div>
      </div>

      <div className="bg-black/40 border border-gray-700 rounded-md p-2 h-40 overflow-y-auto font-mono text-[11px] leading-relaxed">
        {tail.length === 0 && <div className="text-gray-500 italic">Waiting for output…</div>}
        {tail.map((p, i) => (
          <div
            key={i}
            className={
              p.kind === 'error' ? 'text-red-300'
              : p.kind === 'progress' ? 'text-indigo-300'
              : p.kind === 'done' ? 'text-teal-300'
              : 'text-gray-300'
            }
          >
            {p.message}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      <div className="flex justify-between">
        <button
          onClick={onCancel}
          disabled={!canCancel}
          className="px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-gray-200 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={onDone}
          disabled={finished !== 'ok' && finished !== 'cancelled' && finished !== 'error'}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium"
        >
          {finished === 'ok' ? 'Done' : 'Close'}
        </button>
      </div>
    </div>
  )
}
