import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { ExpandResponse, TagSet } from '../../../../shared/clearmemory/types'
import { expand, forget } from '../../lib/clearmemoryClient'
import { toast } from '../../lib/toast'
import { relativeTime } from './clearmemoryTime'

interface Props {
  /** When non-null, drawer is open on this memory id. */
  memoryId: string | null
  onClose: () => void
  /** Called when the user forgets the currently open memory. */
  onForgotten?: (id: string) => void
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: ExpandResponse }
  | { kind: 'error'; error: string; state?: string }

/**
 * Slide-in drawer that renders a memory's full verbatim content via markdown.
 * Keyboard:
 *   Esc       → close
 *   Cmd/Ctrl+K → copy ID
 */
export default function MemoryDrawer({ memoryId, onClose, onForgotten }: Props): JSX.Element | null {
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const [confirmForget, setConfirmForget] = useState(false)
  const [forgetBusy, setForgetBusy] = useState(false)

  // Load / reset when the target id changes.
  useEffect(() => {
    let cancelled = false
    if (!memoryId) {
      setState({ kind: 'idle' })
      setConfirmForget(false)
      return
    }
    setState({ kind: 'loading' })
    setConfirmForget(false)
    void (async () => {
      const result = await expand(memoryId)
      if (cancelled) return
      if (!result.ok) {
        setState({ kind: 'error', error: result.error, state: result.state })
        return
      }
      setState({ kind: 'ready', data: result.data })
    })()
    return () => { cancelled = true }
  }, [memoryId])

  // Global key handlers while the drawer is open.
  useEffect(() => {
    if (!memoryId) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        if (memoryId) copyId(memoryId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [memoryId, onClose])

  if (!memoryId) return null

  const verbatim = state.kind === 'ready' ? (state.data.content ?? '') : ''
  const timestamp = state.kind === 'ready' ? state.data.timestamp : undefined
  const tagChips = state.kind === 'ready' ? flattenTags(state.data.tags) : []

  async function handleForget(): Promise<void> {
    if (!memoryId) return
    setForgetBusy(true)
    const result = await forget(memoryId)
    setForgetBusy(false)
    if (!result.ok) {
      toast.error(result.error ?? 'Forget failed')
      return
    }
    toast.success('Memory invalidated')
    onForgotten?.(memoryId)
    onClose()
  }

  function copyVerbatim(): void {
    if (!verbatim) return
    void navigator.clipboard.writeText(verbatim).then(
      () => toast.success('Content copied'),
      () => toast.error('Copy failed'),
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Memory detail"
        className="fixed right-0 top-0 h-full w-[min(520px,92vw)] bg-gray-800 border-l border-gray-700 shadow-xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-gray-500">Memory</div>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs font-mono text-gray-300 truncate" title={memoryId}>
                {memoryId}
              </code>
              <button
                onClick={() => copyId(memoryId)}
                className="text-[11px] px-2 py-0.5 rounded border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-300"
                aria-label="Copy memory ID"
                title="Copy ID (Cmd/Ctrl+K)"
              >
                Copy ID
              </button>
            </div>
            {timestamp && (
              <div className="text-[11px] text-gray-500 mt-1">
                {relativeTime(timestamp)} &middot; {new Date(timestamp).toLocaleString()}
              </div>
            )}
            {tagChips.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-2">
                {tagChips.map((chip) => (
                  <span
                    key={chip}
                    className="px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 text-[10px] text-gray-300 font-mono"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 shrink-0"
            aria-label="Close drawer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state.kind === 'loading' && <LoadingSkeleton />}
          {state.kind === 'error' && (
            <div className="bg-red-900/30 border border-red-700/60 rounded-md px-3 py-2 text-sm text-red-200 break-words">
              <div className="font-medium">{'Couldn\u2019t load this memory'}</div>
              <div className="text-xs text-red-300/80 mt-1">{state.error}</div>
              {state.state && state.state !== 'ready' && (
                <div className="text-xs text-red-300/70 mt-1">Service state: {state.state}</div>
              )}
            </div>
          )}
          {state.kind === 'ready' && (
            <div className="prose prose-sm prose-invert max-w-none text-gray-200">
              {verbatim.trim().length > 0 ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {verbatim}
                </ReactMarkdown>
              ) : (
                <div className="text-sm italic text-gray-500">(no content)</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-5 py-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-500">Esc to close</span>
          <div className="flex gap-2">
            <button
              onClick={copyVerbatim}
              disabled={state.kind !== 'ready' || !verbatim}
              className="px-3 py-1.5 rounded-md border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-xs disabled:opacity-50"
            >
              Copy content
            </button>
            {!confirmForget ? (
              <button
                onClick={() => setConfirmForget(true)}
                disabled={state.kind !== 'ready'}
                className="px-3 py-1.5 rounded-md border border-red-700/50 bg-red-900/20 hover:bg-red-900/40 text-red-200 text-xs disabled:opacity-50"
              >
                Forget
              </button>
            ) : (
              <>
                <button
                  onClick={() => setConfirmForget(false)}
                  disabled={forgetBusy}
                  className="px-3 py-1.5 rounded-md border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { void handleForget() }}
                  disabled={forgetBusy}
                  className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-medium disabled:opacity-50"
                >
                  {forgetBusy ? 'Forgetting\u2026' : 'Confirm forget'}
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}

function LoadingSkeleton(): JSX.Element {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-3 bg-gray-700 rounded w-5/6" />
      <div className="h-3 bg-gray-700 rounded w-3/4" />
      <div className="h-3 bg-gray-700 rounded w-4/5" />
      <div className="h-3 bg-gray-700 rounded w-2/3" />
      <div className="h-3 bg-gray-700 rounded w-1/2" />
    </div>
  )
}

function copyId(id: string): void {
  void navigator.clipboard.writeText(id).then(
    () => toast.success('ID copied'),
    () => toast.error('Copy failed'),
  )
}

function flattenTags(tags: TagSet | string[] | undefined): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  const out: string[] = []
  for (const dim of ['team', 'repo', 'project', 'domain'] as const) {
    const values = tags[dim]
    if (!values) continue
    for (const v of values) out.push(`${dim}:${v}`)
  }
  return out
}
