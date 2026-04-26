import { useCallback, useEffect, useRef, useState } from 'react'
import type { TagsByType, TagType } from '../../../../shared/clearmemory/types'
import {
  tagsList,
  tagsAdd,
  tagsRemove,
  tagsRename,
} from '../../lib/clearmemoryClient'
import { toast } from '../../lib/toast'

// ── TagsManager ─────────────────────────────────────────────────────────────
// 4-dimension grid: team / repo / project / domain. Per-dim inline add input,
// chip removal with confirm, and double-click-to-rename.

interface Props {
  onChange?: () => void
}

const DIMENSIONS: ReadonlyArray<{ key: TagType; label: string; hint: string }> = [
  { key: 'team', label: 'Team', hint: 'Who owns or cares about this memory.' },
  { key: 'repo', label: 'Repo', hint: 'Git repository or codebase identifier.' },
  { key: 'project', label: 'Project', hint: 'Logical project or initiative name.' },
  { key: 'domain', label: 'Domain', hint: 'Problem area, technology, or subject.' },
]

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'not-ready'; state?: string; error: string }
  | { kind: 'error'; error: string }

const EMPTY: TagsByType = { team: [], repo: [], project: [], domain: [] }

export default function TagsManager({ onChange }: Props = {}): JSX.Element {
  const [tags, setTags] = useState<TagsByType>(EMPTY)
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    const result = await tagsList()
    if (!mountedRef.current) return
    if (!result.ok) {
      if (result.state && result.state !== 'ready') {
        setState({ kind: 'not-ready', state: result.state, error: result.error })
      } else {
        setState({ kind: 'error', error: result.error })
      }
      setTags(EMPTY)
      return
    }
    setTags({ ...EMPTY, ...result.data })
    setState({ kind: 'ready' })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void load()
    return () => { mountedRef.current = false }
  }, [load])

  // Refetch whenever the tab regains focus. Cheap, and keeps the UI coherent
  // if something added tags via another means.
  useEffect(() => {
    const onFocus = (): void => { void load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const handleAdd = useCallback(async (type: TagType, value: string) => {
    const trimmed = value.trim()
    if (trimmed.length === 0) return
    if (trimmed.length > 128) {
      toast.error('Tag value too long (max 128 chars)')
      return
    }
    if ((tags[type] ?? []).includes(trimmed)) {
      toast.info(`${type}:${trimmed} already exists`)
      return
    }
    const result = await tagsAdd(type, trimmed)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setTags((prev) => ({ ...prev, [type]: [...prev[type], trimmed].sort() }))
    toast.success(`Added ${type}:${trimmed}`)
    onChange?.()
  }, [tags, onChange])

  const handleRemove = useCallback(async (type: TagType, value: string) => {
    if (!window.confirm(`Remove ${type}:${value}? Memories tagged with this will keep the tag on disk.`)) return
    const result = await tagsRemove(type, value)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setTags((prev) => ({ ...prev, [type]: prev[type].filter((v) => v !== value) }))
    toast.success(`Removed ${type}:${value}`)
    onChange?.()
  }, [onChange])

  const handleRename = useCallback(async (type: TagType, oldValue: string, newValue: string) => {
    const trimmed = newValue.trim()
    if (trimmed === oldValue || trimmed.length === 0) return
    if (trimmed.length > 128) {
      toast.error('Tag value too long')
      return
    }
    const result = await tagsRename(type, oldValue, trimmed)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setTags((prev) => ({
      ...prev,
      [type]: prev[type].map((v) => (v === oldValue ? trimmed : v)).sort(),
    }))
    toast.success(`Renamed ${type}:${oldValue} \u2192 ${type}:${trimmed}`)
    onChange?.()
  }, [onChange])

  if (state.kind === 'not-ready') {
    return (
      <div className="border border-gray-700 rounded-lg p-6 text-center space-y-2">
        <div className="text-sm text-gray-300 font-medium">Clear Memory is not running</div>
        <p className="text-xs text-gray-500">
          Start the daemon from the Browse tab to manage tags.
        </p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="border border-red-700/60 bg-red-900/20 rounded-lg p-4 text-sm text-red-200">
        <div className="font-medium">{'Couldn\u2019t load tags'}</div>
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Tags organize memories across four dimensions. Each tag makes recall more precise.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DIMENSIONS.map((d) => (
          <DimensionCard
            key={d.key}
            dimension={d}
            values={tags[d.key] ?? []}
            loading={state.kind === 'loading'}
            onAdd={(v) => handleAdd(d.key, v)}
            onRemove={(v) => handleRemove(d.key, v)}
            onRename={(oldV, newV) => handleRename(d.key, oldV, newV)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Dimension card ──────────────────────────────────────────────────────────

interface DimensionCardProps {
  dimension: { key: TagType; label: string; hint: string }
  values: string[]
  loading: boolean
  onAdd: (value: string) => void | Promise<void>
  onRemove: (value: string) => void | Promise<void>
  onRename: (oldValue: string, newValue: string) => void | Promise<void>
}

function DimensionCard({
  dimension,
  values,
  loading,
  onAdd,
  onRemove,
  onRename,
}: DimensionCardProps): JSX.Element {
  const [inputValue, setInputValue] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  function handleAddKey(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = inputValue.trim()
      if (!v) return
      void Promise.resolve(onAdd(v)).then(() => setInputValue(''))
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold text-gray-200">{dimension.label}</div>
        <span className="text-[10px] font-mono text-gray-500 uppercase">{dimension.key}</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">{dimension.hint}</p>

      <div className="flex gap-2 flex-wrap mb-3 min-h-[28px]">
        {loading && values.length === 0 && (
          <span className="text-[11px] text-gray-600 italic">Loading…</span>
        )}
        {!loading && values.length === 0 && (
          <span className="text-[11px] text-gray-600 italic">No tags yet</span>
        )}
        {values.map((v) => (
          <TagChip
            key={v}
            value={v}
            editing={editing === v}
            onStartEdit={() => setEditing(v)}
            onCancelEdit={() => setEditing(null)}
            onCommitEdit={(newValue) => {
              setEditing(null)
              void onRename(v, newValue)
            }}
            onRemove={() => { void onRemove(v) }}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleAddKey}
          placeholder={`Add ${dimension.key}\u2026`}
          className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          onClick={() => {
            const v = inputValue.trim()
            if (!v) return
            void Promise.resolve(onAdd(v)).then(() => setInputValue(''))
          }}
          disabled={!inputValue.trim()}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium"
          aria-label={`Add ${dimension.key} tag`}
        >
          +
        </button>
      </div>
    </div>
  )
}

// ── Tag chip ─────────────────────────────────────────────────────────────────

interface TagChipProps {
  value: string
  editing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onCommitEdit: (newValue: string) => void
  onRemove: () => void
}

function TagChip({
  value,
  editing,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onRemove,
}: TagChipProps): JSX.Element {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(value)
      const t = window.setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 10)
      return () => window.clearTimeout(t)
    }
  }, [editing, value])

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommitEdit(draft)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancelEdit()
          }
        }}
        onBlur={() => onCancelEdit()}
        className="bg-gray-800 border border-indigo-500 rounded-full px-2 py-0.5 text-[11px] text-gray-100 focus:outline-none font-mono w-32"
      />
    )
  }

  return (
    <span
      onDoubleClick={onStartEdit}
      title="Double-click to rename"
      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-[11px] text-gray-200 group"
    >
      <span>{value}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${value}`}
        className="w-4 h-4 rounded-full text-gray-500 hover:bg-red-900/40 hover:text-red-300 flex items-center justify-center"
      >
        <span className="text-xs leading-none">&times;</span>
      </button>
    </span>
  )
}
