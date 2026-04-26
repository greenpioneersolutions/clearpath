import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Stream, TagType } from '../../../../shared/clearmemory/types'
import { streamsList, tagsList } from '../../lib/clearmemoryClient'

export interface SearchBarHandle {
  focus: () => void
}

interface Props {
  query: string
  onQueryChange: (value: string) => void
  streamFilter?: string
  onStreamFilterChange?: (stream: string | undefined) => void
  tagFilters: string[]
  onToggleTag?: (tag: string) => void
  /** Known tags to show as chips. If omitted, the bar fetches its own. */
  knownTags?: string[]
}

/**
 * Shared search bar used by the Browse tab. Emits raw typing events —
 * debouncing happens downstream in `<MemoryList>`.
 *
 * Slice D upgrades:
 *   - Stream dropdown is populated from `streams-list` (no more stub).
 *   - Tag filter chips are populated from `tags-list` (multi-select).
 */
const SearchBar = forwardRef<SearchBarHandle, Props>(function SearchBar(
  { query, onQueryChange, streamFilter, onStreamFilterChange, tagFilters, onToggleTag, knownTags },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  const [streams, setStreams] = useState<Stream[]>([])
  const [fetchedTags, setFetchedTags] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    void streamsList().then((result) => {
      if (cancelled) return
      if (result.ok) setStreams(result.data.streams)
    })
    void tagsList().then((result) => {
      if (cancelled) return
      if (!result.ok) return
      const all: string[] = []
      const dims: TagType[] = ['team', 'repo', 'project', 'domain']
      for (const d of dims) {
        for (const v of result.data[d] ?? []) all.push(`${d}:${v}`)
      }
      setFetchedTags(all)
    })
    return () => { cancelled = true }
  }, [])

  const chips = knownTags && knownTags.length > 0 ? knownTags : fetchedTags

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={'Search stored memories\u2026  (press / to focus)'}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          aria-label="Search memories"
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-sm"
          >
            Clear
          </button>
        )}
      </div>

      {/* Stream picker — Slice D wires this to real streams-list data. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">Stream</span>
        <select
          value={streamFilter ?? ''}
          onChange={(e) => onStreamFilterChange?.(e.target.value || undefined)}
          disabled={!onStreamFilterChange}
          className="bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-300 disabled:opacity-50"
          aria-label="Filter by stream"
        >
          <option value="">All streams</option>
          {streams.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}{s.active ? ' (active)' : ''}
            </option>
          ))}
        </select>
        {streamFilter && (
          <button
            onClick={() => onStreamFilterChange?.(undefined)}
            className="text-[11px] text-gray-400 hover:text-gray-200 underline decoration-dotted"
          >
            Clear
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wide text-gray-500 pt-1">Tags</span>
          {chips.map((tag) => {
            const active = tagFilters.includes(tag)
            return (
              <button
                key={tag}
                onClick={() => onToggleTag?.(tag)}
                className={`px-2 py-1 text-[11px] rounded-full border transition-colors ${
                  active
                    ? 'bg-teal-600 border-teal-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
                }`}
              >
                {tag}
              </button>
            )
          })}
          {tagFilters.length > 0 && (
            <button
              onClick={() => tagFilters.forEach((t) => onToggleTag?.(t))}
              className="text-[11px] text-gray-400 hover:text-gray-200 underline decoration-dotted pt-1"
            >
              Clear tag filters
            </button>
          )}
        </div>
      )}
    </div>
  )
})

export default SearchBar
