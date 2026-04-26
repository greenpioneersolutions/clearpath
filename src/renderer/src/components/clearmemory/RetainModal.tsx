import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClassificationLevel, TagType } from '../../../../shared/clearmemory/types'
import { retain, tagsList } from '../../lib/clearmemoryClient'
import { toast } from '../../lib/toast'

interface Props {
  open: boolean
  onClose: () => void
  /** Called after a successful retain so the parent can refresh its list. */
  onSaved?: (id: string) => void
}

const CLASSIFICATIONS: Array<{ value: ClassificationLevel | ''; label: string }> = [
  { value: '', label: '(none)' },
  { value: 'public', label: 'Public' },
  { value: 'internal', label: 'Internal' },
  { value: 'confidential', label: 'Confidential' },
  { value: 'pii', label: 'PII' },
]

/**
 * Compose a new memory. Slice C keeps the tag surface free-form
 * (space-separated strings like `team:platform repo:clearpath`) — Slice D
 * will layer the 4-dimension taxonomy on top.
 *
 * Keyboard:
 *   Cmd/Ctrl+Enter → submit
 *   Esc            → close (when not submitting)
 */
export default function RetainModal({ open, onClose, onSaved }: Props): JSX.Element | null {
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [classification, setClassification] = useState<ClassificationLevel | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const tagsInputRef = useRef<HTMLInputElement>(null)

  // Reset form + focus on open.
  useEffect(() => {
    if (!open) return
    setContent('')
    setTagsInput('')
    setClassification('')
    setError(null)
    setShowSuggestions(false)
    const t = window.setTimeout(() => textareaRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open])

  // Lazy-load known tags from the daemon once per open. Free-form entries are
  // still allowed — this only powers the autocomplete.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void tagsList().then((result) => {
      if (cancelled || !result.ok) return
      const all: string[] = []
      const dims: TagType[] = ['team', 'repo', 'project', 'domain']
      for (const d of dims) {
        for (const v of result.data[d] ?? []) all.push(`${d}:${v}`)
      }
      setSuggestions(all)
    })
    return () => { cancelled = true }
  }, [open])

  // Compute current autocomplete hits based on the last token the user typed.
  const currentToken = useMemo(() => getCurrentTagToken(tagsInput), [tagsInput])
  const visibleSuggestions = useMemo(() => {
    if (!currentToken || suggestions.length === 0) return []
    const q = currentToken.toLowerCase()
    const existing = new Set(parseTagInput(tagsInput))
    return suggestions
      .filter((s) => !existing.has(s))
      .filter((s) => s.toLowerCase().includes(q))
      .slice(0, 8)
  }, [currentToken, suggestions, tagsInput])

  useEffect(() => { setHighlightedIdx(0) }, [currentToken])

  // Auto-grow the textarea based on content.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(400, el.scrollHeight)}px`
  }, [content, open])

  function applySuggestion(suggestion: string): void {
    // Replace the last partial token with the suggestion, preserving any
    // earlier complete tokens and appending a trailing space so the user can
    // continue typing.
    const before = tagsInput.replace(/\S*$/, '')
    setTagsInput(`${before}${suggestion} `)
    setShowSuggestions(false)
    window.setTimeout(() => tagsInputRef.current?.focus(), 0)
  }

  if (!open) return null

  const trimmed = content.trim()
  const canSubmit = trimmed.length >= 2 && !busy

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    const tags = parseTagInput(tagsInput)
    const result = await retain({
      content: trimmed,
      tags: tags.length > 0 ? tags : undefined,
      classification: classification === '' ? undefined : classification,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      toast.error(result.error)
      return
    }
    const id = result.data.id ?? ''
    toast.success(id ? `Memory retained (${truncate(id, 12)})` : 'Memory retained')
    onSaved?.(id)
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape' && !busy) {
      e.preventDefault()
      onClose()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Retain new memory"
      onKeyDown={handleKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="w-[min(640px,94vw)] bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Retain a memory</h3>
            <p className="text-xs text-gray-400 mt-1">
              The daemon will embed and index this content for cross-session recall.
            </p>
          </div>
          <button
            onClick={() => { if (!busy) onClose() }}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Content
          </label>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder={'Paste or type the verbatim content you want remembered\u2026'}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
            disabled={busy}
          />
          <div className="text-[11px] text-gray-500 mt-1 flex justify-between">
            <span>{trimmed.length < 2 && content.length > 0 ? 'At least 2 characters required' : ''}</span>
            <span>{trimmed.length.toLocaleString()} chars</span>
          </div>
        </div>

        <div className="relative">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Tags
          </label>
          <input
            ref={tagsInputRef}
            type="text"
            value={tagsInput}
            onChange={(e) => { setTagsInput(e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => { window.setTimeout(() => setShowSuggestions(false), 100) }}
            onKeyDown={(e) => {
              if (!showSuggestions || visibleSuggestions.length === 0) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHighlightedIdx((i) => Math.min(i + 1, visibleSuggestions.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHighlightedIdx((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Tab' || (e.key === 'Enter' && visibleSuggestions.length > 0 && !(e.metaKey || e.ctrlKey))) {
                e.preventDefault()
                applySuggestion(visibleSuggestions[highlightedIdx])
              }
            }}
            placeholder="team:platform repo:clearpath domain:electron"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            disabled={busy}
            aria-autocomplete="list"
            aria-expanded={showSuggestions && visibleSuggestions.length > 0}
          />
          {showSuggestions && visibleSuggestions.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto"
            >
              {visibleSuggestions.map((s, i) => (
                <li
                  key={s}
                  role="option"
                  aria-selected={i === highlightedIdx}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s) }}
                  onMouseEnter={() => setHighlightedIdx(i)}
                  className={`px-3 py-1.5 text-sm font-mono cursor-pointer ${
                    i === highlightedIdx
                      ? 'bg-indigo-600/20 text-indigo-100'
                      : 'text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
          <div className="text-[11px] text-gray-500 mt-1">
            Space-separated. Tab / Enter to accept a suggestion.
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Classification
          </label>
          <select
            value={classification}
            onChange={(e) => setClassification(e.target.value as ClassificationLevel | '')}
            disabled={busy}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {CLASSIFICATIONS.map((c) => (
              <option key={c.value || 'none'} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700/60 rounded-md px-3 py-2 text-xs text-red-200 break-words">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          <span className="text-[11px] text-gray-500">
            {'Cmd/Ctrl+Enter to retain \u00B7 Esc to close'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => { if (!busy) onClose() }}
              disabled={busy}
              className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => { void handleSubmit() }}
              disabled={!canSubmit}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium transition-colors"
            >
              {busy ? 'Retaining\u2026' : 'Retain'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTagInput(input: string): string[] {
  // Accepts tokens separated by spaces or commas; empty strings discarded.
  // Intentionally permissive — the daemon validates on the retain call.
  const raw = input.split(/[\s,]+/).map((s) => s.trim()).filter((s) => s.length > 0)
  // Cap at 32 to avoid accidental runaway payloads from a paste.
  return raw.slice(0, 32)
}

/** Return the trailing (potentially-partial) token the user is still typing. */
function getCurrentTagToken(input: string): string {
  const match = input.match(/(\S*)$/)
  return match ? match[1] : ''
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return `${s.slice(0, n - 1)}\u2026`
}
