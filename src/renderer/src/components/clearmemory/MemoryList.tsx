import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MemoryRecord } from '../../../../shared/clearmemory/types'
import { enable, forget, recall } from '../../lib/clearmemoryClient'
import { toast } from '../../lib/toast'
import { relativeTime } from './clearmemoryTime'

interface Props {
  query: string
  streamFilter?: string
  tagFilters?: string[]
  /** Bump this to force a reload (e.g. after retain). */
  refreshKey?: number
  /** Called when the user clicks a row — the parent opens the drawer. */
  onSelect: (id: string) => void
  /** Called when the user wants to compose a new memory (empty-state CTA). */
  onCompose?: () => void
}

type ServiceNotReady = { kind: 'not-ready'; state?: string; error: string }
type LoadError = { kind: 'error'; error: string }
type LoadState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready' } | ServiceNotReady | LoadError

const RECALL_LIMIT = 50
const DEBOUNCE_MS = 250

export default function MemoryList({
  query,
  streamFilter,
  tagFilters,
  refreshKey,
  onSelect,
  onCompose,
}: Props): JSX.Element {
  const [memories, setMemories] = useState<MemoryRecord[]>([])
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const [starting, setStarting] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [confirmForgetId, setConfirmForgetId] = useState<string | null>(null)
  const [forgetReason, setForgetReason] = useState('')
  const [forgetBusy, setForgetBusy] = useState(false)
  const mountedRef = useRef(true)

  // Stringify filters so identity-changed-but-equal arrays don't re-trigger
  // recall on every parent render.
  const tagKey = useMemo(() => (tagFilters ?? []).join('\u0001'), [tagFilters])

  const runRecall = useCallback(async () => {
    setState({ kind: 'loading' })
    const tagsPayload = tagKey.length > 0 ? tagKey.split('\u0001') : undefined
    const result = await recall({
      query,
      stream: streamFilter,
      tags: tagsPayload,
      limit: RECALL_LIMIT,
    })
    if (!mountedRef.current) return

    if (!result.ok) {
      if (result.state && result.state !== 'ready') {
        setState({ kind: 'not-ready', state: result.state, error: result.error })
      } else {
        setState({ kind: 'error', error: result.error })
      }
      setMemories([])
      return
    }
    setMemories(result.data.results ?? [])
    setState({ kind: 'ready' })
  }, [query, streamFilter, tagKey])

  // Debounced load on query/filters/refreshKey change.
  useEffect(() => {
    mountedRef.current = true
    const t = window.setTimeout(() => { void runRecall() }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(t)
      mountedRef.current = false
    }
  }, [runRecall, refreshKey])

  async function handleStartDaemon(): Promise<void> {
    setStarting(true)
    const result = await enable()
    setStarting(false)
    if (!result.ok) {
      toast.error(result.error ?? 'Failed to start Clear Memory')
      return
    }
    toast.success('Clear Memory started')
    void runRecall()
  }

  function copyId(id: string): void {
    void navigator.clipboard.writeText(id).then(
      () => toast.success('ID copied'),
      () => toast.error('Couldn\u2019t copy ID'),
    )
  }

  function openForgetConfirm(id: string): void {
    setMenuOpenId(null)
    setConfirmForgetId(id)
    setForgetReason('')
  }

  async function runForget(): Promise<void> {
    if (!confirmForgetId) return
    setForgetBusy(true)
    const result = await forget(confirmForgetId, forgetReason.trim() || undefined)
    setForgetBusy(false)
    if (!result.ok) {
      toast.error(result.error ?? 'Forget failed')
      return
    }
    toast.success('Memory invalidated')
    setMemories((prev) => prev.filter((m) => m.id !== confirmForgetId))
    setConfirmForgetId(null)
    setForgetReason('')
  }

  // ── Render branches ────────────────────────────────────────────────────────

  if (state.kind === 'not-ready') {
    return (
      <div className="border border-gray-700 rounded-lg p-6 text-center space-y-3">
        <div className="text-sm text-gray-300 font-medium">Clear Memory is not running</div>
        <p className="text-xs text-gray-500">
          The daemon is {state.state ?? 'stopped'}. Start it to browse and search memories.
        </p>
        <button
          onClick={() => { void handleStartDaemon() }}
          disabled={starting}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium transition-colors"
        >
          {starting ? 'Starting\u2026' : 'Start Clear Memory'}
        </button>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="border border-red-700/60 bg-red-900/20 rounded-lg p-4 text-sm text-red-200">
        <div className="font-medium">{'Couldn\u2019t load memories'}</div>
        <div className="text-xs text-red-300/80 mt-1 break-words">{state.error}</div>
        <button
          onClick={() => { void runRecall() }}
          className="mt-3 px-3 py-1.5 rounded-md bg-red-700 hover:bg-red-600 text-white text-xs font-medium"
        >
          Retry
        </button>
      </div>
    )
  }

  if (state.kind === 'loading' && memories.length === 0) {
    return (
      <div className="divide-y divide-gray-700 border border-gray-700 rounded-lg overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-4 py-3 animate-pulse">
            <div className="h-3 bg-gray-700 rounded w-2/3" />
            <div className="h-2 bg-gray-800 rounded w-1/3 mt-2" />
          </div>
        ))}
      </div>
    )
  }

  if (state.kind === 'ready' && memories.length === 0) {
    return (
      <div className="border border-gray-700 rounded-lg p-6 text-center space-y-3">
        <div className="text-sm text-gray-300 font-medium">
          {query ? 'No memories match your search.' : 'No memories yet.'}
        </div>
        <p className="text-xs text-gray-500">
          Retain your first memory to see it here.
        </p>
        {onCompose && (
          <button
            onClick={onCompose}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            Retain your first memory
          </button>
        )}
      </div>
    )
  }

  // ── Happy path: the list ───────────────────────────────────────────────────
  return (
    <>
      <div
        className="divide-y divide-gray-700 border border-gray-700 rounded-lg overflow-auto max-h-[65vh]"
        style={{ contain: 'content' }}
        onClick={() => setMenuOpenId(null)}
      >
        {memories.map((m) => (
          <MemoryRow
            key={m.id}
            memory={m}
            menuOpen={menuOpenId === m.id}
            onToggleMenu={(e) => {
              e.stopPropagation()
              setMenuOpenId((prev) => (prev === m.id ? null : m.id))
            }}
            onSelect={() => onSelect(m.id)}
            onExpand={() => {
              setMenuOpenId(null)
              onSelect(m.id)
            }}
            onCopyId={() => { setMenuOpenId(null); copyId(m.id) }}
            onForget={() => openForgetConfirm(m.id)}
          />
        ))}
      </div>

      {/* Confirm modal — inline so we don't scatter portals */}
      {confirmForgetId && (
        <ForgetConfirm
          busy={forgetBusy}
          reason={forgetReason}
          onReasonChange={setForgetReason}
          onCancel={() => { if (!forgetBusy) setConfirmForgetId(null) }}
          onConfirm={() => { void runForget() }}
        />
      )}
    </>
  )
}

// ── Row ──────────────────────────────────────────────────────────────────────

interface RowProps {
  memory: MemoryRecord
  menuOpen: boolean
  onToggleMenu: (e: React.MouseEvent) => void
  onSelect: () => void
  onExpand: () => void
  onCopyId: () => void
  onForget: () => void
}

function MemoryRow({
  memory,
  menuOpen,
  onToggleMenu,
  onSelect,
  onExpand,
  onCopyId,
  onForget,
}: RowProps): JSX.Element {
  const tagChips = flattenTags(memory.tags)
  return (
    <div
      className="px-4 py-3 hover:bg-gray-700/40 transition-colors cursor-pointer relative"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm text-gray-200 line-clamp-2"
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
            }}
          >
            {memory.summary || <span className="italic text-gray-500">(no summary)</span>}
          </div>
          <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="font-mono" title={memory.id}>
              {shortId(memory.id)}
            </span>
            <span className="text-gray-600">&middot;</span>
            <span>{relativeTime(memory.timestamp)}</span>
            {memory.stream && (
              <>
                <span className="text-gray-600">&middot;</span>
                <span className="text-indigo-300">stream: {memory.stream}</span>
              </>
            )}
            {tagChips.length > 0 && (
              <>
                <span className="text-gray-600">&middot;</span>
                <span className="flex gap-1 flex-wrap">
                  {tagChips.slice(0, 4).map((chip) => (
                    <span
                      key={chip}
                      className="px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 text-[10px] text-gray-300"
                    >
                      {chip}
                    </span>
                  ))}
                  {tagChips.length > 4 && (
                    <span className="text-[10px] text-gray-500">+{tagChips.length - 4}</span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>

        <button
          onClick={onToggleMenu}
          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 shrink-0"
          aria-label="Row actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="text-lg leading-none">&#x22EE;</span>
        </button>
      </div>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-4 top-10 z-10 w-40 bg-gray-900 border border-gray-700 rounded-md shadow-lg text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-gray-800 text-gray-200" onClick={onExpand}>
            Expand
          </button>
          <button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-gray-800 text-gray-200" onClick={onCopyId}>
            Copy ID
          </button>
          <button role="menuitem" className="w-full text-left px-3 py-2 hover:bg-red-900/30 text-red-300" onClick={onForget}>
            {'Forget\u2026'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Forget confirm modal ─────────────────────────────────────────────────────

function ForgetConfirm(props: {
  busy: boolean
  reason: string
  onReasonChange: (r: string) => void
  onCancel: () => void
  onConfirm: () => void
}): JSX.Element {
  const { busy, reason, onReasonChange, onCancel, onConfirm } = props
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[min(480px,92vw)] bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Forget this memory?</h3>
          <p className="text-xs text-gray-400 mt-1">
            The memory will be marked invalid and excluded from future recalls,
            but kept on disk for audit purposes.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
            placeholder="e.g. superseded by a newer note"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
            disabled={busy}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium"
          >
            {busy ? 'Forgetting\u2026' : 'Forget'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}\u2026${id.slice(-4)}`
}

function flattenTags(tags: MemoryRecord['tags']): string[] {
  if (!tags) return []
  const out: string[] = []
  for (const dim of ['team', 'repo', 'project', 'domain'] as const) {
    const values = tags[dim]
    if (!values) continue
    for (const v of values) out.push(`${dim}:${v}`)
  }
  return out
}
