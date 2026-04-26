import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Stream, TagType } from '../../../../shared/clearmemory/types'
import {
  streamsList,
  streamsCreate,
  streamsSwitch,
  streamsDescribe,
} from '../../lib/clearmemoryClient'
import { toast } from '../../lib/toast'

// ── StreamsManager ──────────────────────────────────────────────────────────
// Two-column layout: list on the left, selected stream details on the right.
// Wires to the Slice D CLI-backed IPC handlers. Upstream exposes no delete or
// rename commands yet, so those actions are shown as "coming soon".

interface Props {
  /** Called after a new stream is created or switched, so parents can refresh. */
  onChange?: () => void
}

type ListState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'not-ready'; state?: string; error: string }
  | { kind: 'error'; error: string }

const DIMENSIONS: readonly TagType[] = ['team', 'repo', 'project', 'domain']

export default function StreamsManager({ onChange }: Props = {}): JSX.Element {
  const [streams, setStreams] = useState<Stream[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [state, setState] = useState<ListState>({ kind: 'idle' })
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [menuOpenName, setMenuOpenName] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    const result = await streamsList()
    if (!mountedRef.current) return
    if (!result.ok) {
      if (result.state && result.state !== 'ready') {
        setState({ kind: 'not-ready', state: result.state, error: result.error })
      } else {
        setState({ kind: 'error', error: result.error })
      }
      setStreams([])
      return
    }
    setStreams(result.data.streams)
    setActive(result.data.active ?? null)
    // Preserve a valid selection if possible.
    setSelectedName((prev) => {
      if (prev && result.data.streams.some((s) => s.name === prev)) return prev
      return result.data.streams[0]?.name ?? null
    })
    setState({ kind: 'ready' })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void load()
    return () => { mountedRef.current = false }
  }, [load])

  const selected = useMemo(
    () => streams.find((s) => s.name === selectedName) ?? null,
    [streams, selectedName],
  )

  const handleSwitch = useCallback(async (name: string) => {
    const result = await streamsSwitch(name)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setActive(name)
    toast.success(`Switched to ${name}`)
    onChange?.()
  }, [onChange])

  const handleDescribe = useCallback(async (name: string) => {
    // Re-fetch description/tags to freshen the pane.
    const result = await streamsDescribe(name)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setStreams((prev) => prev.map((s) =>
      s.name === name
        ? { ...s, description: result.data.description, tags: result.data.tags ?? s.tags }
        : s,
    ))
    setSelectedName(name)
  }, [])

  const handleCreated = useCallback(async (stream: Stream) => {
    setModalOpen(false)
    toast.success(`Stream "${stream.name}" created`)
    setSelectedName(stream.name)
    await load()
    onChange?.()
  }, [load, onChange])

  // ── Branches ────────────────────────────────────────────────────────────────

  if (state.kind === 'not-ready') {
    return (
      <div className="border border-gray-700 rounded-lg p-6 text-center space-y-2">
        <div className="text-sm text-gray-300 font-medium">Clear Memory is not running</div>
        <p className="text-xs text-gray-500">
          Start the daemon from the Browse tab to manage streams.
        </p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="border border-red-700/60 bg-red-900/20 rounded-lg p-4 text-sm text-red-200">
        <div className="font-medium">{'Couldn\u2019t load streams'}</div>
        <div className="text-xs text-red-300/80 mt-1 break-words">{state.error}</div>
        <button
          onClick={() => { void load() }}
          className="mt-3 px-3 py-1.5 rounded-md bg-red-700 hover:bg-red-600 text-white text-xs font-medium"
        >
          Retry
        </button>
      </div>
    )
  }

  const loading = state.kind === 'loading' && streams.length === 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Streams are scoped views across tag intersections. Switching a stream scopes recall and retain.
        </p>
        <button
          onClick={() => setModalOpen(true)}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
        >
          + New stream
        </button>
      </div>

      {loading && (
        <div className="divide-y divide-gray-700 border border-gray-700 rounded-lg overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-4 py-3 animate-pulse">
              <div className="h-3 bg-gray-700 rounded w-1/2" />
              <div className="h-2 bg-gray-800 rounded w-1/4 mt-2" />
            </div>
          ))}
        </div>
      )}

      {!loading && streams.length === 0 && state.kind === 'ready' && (
        <div className="border border-gray-700 rounded-lg p-6 text-center space-y-3">
          <div className="text-sm text-gray-300 font-medium">No streams yet.</div>
          <p className="text-xs text-gray-500">
            Streams are scoped views across tag intersections. Create your first one to start organizing memories.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
          >
            Create first stream
          </button>
        </div>
      )}

      {streams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-4" onClick={() => setMenuOpenName(null)}>
          {/* Left: list */}
          <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700">
            {streams.map((s) => {
              const isActive = s.name === active
              const isSelected = s.name === selectedName
              return (
                <div
                  key={s.name}
                  onClick={() => setSelectedName(s.name)}
                  className={`relative px-4 py-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-indigo-500/10' : 'hover:bg-gray-700/40'
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelectedName(s.name) }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-200 truncate font-medium">{s.name}</span>
                        {isActive && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 uppercase tracking-wide">
                            Active
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{s.description}</div>
                      )}
                      {s.tags && s.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {s.tags.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 text-[10px] text-gray-300"
                            >
                              {t}
                            </span>
                          ))}
                          {s.tags.length > 4 && (
                            <span className="text-[10px] text-gray-500">+{s.tags.length - 4}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpenName((prev) => (prev === s.name ? null : s.name))
                      }}
                      aria-label="Stream actions"
                      aria-haspopup="menu"
                      className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 shrink-0"
                    >
                      <span className="text-lg leading-none">&#x22EE;</span>
                    </button>
                  </div>

                  {menuOpenName === s.name && (
                    <div
                      role="menu"
                      className="absolute right-3 top-8 z-10 w-48 bg-gray-900 border border-gray-700 rounded-md shadow-lg text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        role="menuitem"
                        className="w-full text-left px-3 py-2 hover:bg-gray-800 text-gray-200 disabled:opacity-50"
                        disabled={isActive}
                        onClick={() => { setMenuOpenName(null); void handleSwitch(s.name) }}
                      >
                        Switch to this stream
                      </button>
                      <button
                        role="menuitem"
                        className="w-full text-left px-3 py-2 hover:bg-gray-800 text-gray-200"
                        onClick={() => { setMenuOpenName(null); void handleDescribe(s.name) }}
                      >
                        Describe
                      </button>
                      <button
                        role="menuitem"
                        className="w-full text-left px-3 py-2 text-gray-500 cursor-not-allowed"
                        title="Upstream clearmemory CLI has no delete command yet"
                        disabled
                      >
                        Delete (coming soon)
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Right: details */}
          <div className="border border-gray-700 rounded-lg p-4 bg-gray-900/40">
            {selected ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">{selected.name}</h3>
                    {selected.name === active && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 uppercase tracking-wide">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Stream rename isn&apos;t exposed by the CLI yet.
                  </p>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Description</div>
                  <div className="text-sm text-gray-300">
                    {selected.description || <span className="text-gray-500 italic">No description</span>}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Tags</div>
                  <div className="space-y-2">
                    {DIMENSIONS.map((dim) => {
                      const values = (selected.tags ?? [])
                        .filter((t) => t.startsWith(`${dim}:`))
                        .map((t) => t.slice(dim.length + 1))
                      return (
                        <div key={dim} className="flex items-start gap-2">
                          <span className="text-[11px] font-mono text-gray-500 uppercase w-16 shrink-0 pt-0.5">
                            {dim}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {values.length === 0 ? (
                              <span className="text-[11px] text-gray-600 italic">—</span>
                            ) : values.map((v) => (
                              <span
                                key={`${dim}:${v}`}
                                className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-[11px] text-gray-200"
                              >
                                {v}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { void handleSwitch(selected.name) }}
                    disabled={selected.name === active}
                    className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium"
                  >
                    {selected.name === active ? 'Currently active' : 'Switch to this stream'}
                  </button>
                  <button
                    onClick={() => { void handleDescribe(selected.name) }}
                    className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-sm"
                  >
                    Refresh details
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center p-6">
                Select a stream to see details.
              </div>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <NewStreamModal
          onCancel={() => setModalOpen(false)}
          onCreated={(s) => { void handleCreated(s) }}
        />
      )}
    </div>
  )
}

// ── New stream modal ─────────────────────────────────────────────────────────

function NewStreamModal({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (s: Stream) => void
}): JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => nameRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [])

  const nameValid = /^[A-Za-z0-9_-]{1,64}$/.test(name)
  const canSubmit = nameValid && !busy

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    const tags = tagsInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 32)
    const result = await streamsCreate({
      name,
      description: description.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onCreated(result.data)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Create stream"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) { e.preventDefault(); onCancel() }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          void handleSubmit()
        }
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div className="w-[min(520px,94vw)] bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Create stream</h3>
          <p className="text-xs text-gray-400 mt-1">
            Streams partition memories. You can switch between them at any time.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Name
          </label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="scratch"
            disabled={busy}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
          />
          <div className="text-[11px] text-gray-500 mt-1">
            1–64 chars. Letters, digits, <code>_</code>, <code>-</code>.
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One-liner to remind yourself what this stream is for"
            disabled={busy}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Tags (optional)
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="team:platform repo:clearpath"
            disabled={busy}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
          />
          <div className="text-[11px] text-gray-500 mt-1">
            Space-separated <code>key:value</code> pairs.
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700/60 rounded-md px-3 py-2 text-xs text-red-200 break-words">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-[11px] text-gray-500">
            {'Cmd/Ctrl+Enter to create \u00B7 Esc to cancel'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => { if (!busy) onCancel() }}
              disabled={busy}
              className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => { void handleSubmit() }}
              disabled={!canSubmit}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium"
            >
              {busy ? 'Creating\u2026' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
