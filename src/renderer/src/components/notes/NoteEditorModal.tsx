import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView, keymap } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { NOTE_CATEGORIES, type NoteCategory } from '../../lib/noteCategoryColors'
import type { Note, NoteAttachment } from '../../types/note'
import {
  wrapInline,
  prefixLines,
  numberLines,
  insertLink,
  insertCodeBlock,
} from './markdownCommands'

type ViewMode = 'edit' | 'split' | 'preview'
type SaveStatus = 'idle' | 'saving' | 'saved'

// ── Toolbar ──────────────────────────────────────────────────────────────────

function ToolbarButton({
  label,
  title,
  onClick,
  mono,
}: {
  label: string
  title: string
  onClick: () => void
  mono?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors ${
        mono ? 'font-mono' : 'font-semibold'
      }`}
    >
      {label}
    </button>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────

export default function NoteEditorModal({
  note,
  onChange,
  onClose,
  onUseInNextSession,
}: {
  note: Note
  /** Refresh the list after a persisted change. */
  onChange: () => void
  /** Clear the selection / dismiss the overlay (no save — call flush first). */
  onClose: () => void
  /** Navigate to a new session pre-seeded with this note (no save — flush first). */
  onUseInNextSession: () => void
}): JSX.Element {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [category, setCategory] = useState<NoteCategory | string>(note.category)
  const [tags, setTags] = useState<string[]>(note.tags)
  const [pinned, setPinned] = useState(note.pinned)
  const [attachments, setAttachments] = useState<NoteAttachment[]>(note.attachments)
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [attachError, setAttachError] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const viewRef = useRef<EditorView | null>(null)
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialMount = useRef(true)

  // ── Persistence ─────────────────────────────────────────────────────────
  // Debounced autosave keeps the list in sync without writing on every key.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    setSaveStatus('saving')
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(() => {
      void (async () => {
        await window.electronAPI.invoke('notes:update', {
          id: note.id,
          title: title.trim() || 'Untitled note',
          content,
          category,
          tags,
          pinned,
          attachments,
        })
        onChange()
        setSaveStatus('saved')
      })()
    }, 350)
    return () => {
      if (saveRef.current) clearTimeout(saveRef.current)
    }
  }, [title, content, category, tags, pinned, attachments, note.id, onChange])

  // Flush any pending write immediately — used by the explicit footer actions
  // so navigation/close never races the debounce timer.
  const flush = useCallback(async () => {
    if (saveRef.current) {
      clearTimeout(saveRef.current)
      saveRef.current = null
    }
    setSaveStatus('saving')
    await window.electronAPI.invoke('notes:update', {
      id: note.id,
      title: title.trim() || 'Untitled note',
      content,
      category,
      tags,
      pinned,
      attachments,
    })
    onChange()
    setSaveStatus('saved')
  }, [note.id, title, content, category, tags, pinned, attachments, onChange])

  // Tag autocomplete — fetched once per note.
  useEffect(() => {
    void (async () => {
      const all = (await window.electronAPI.invoke('notes:tags')) as string[]
      setTagSuggestions(all)
    })()
  }, [note.id])

  // ── Overlay chrome: scroll lock + Esc to save & close ─────────────────────
  const handleSaveAndClose = useCallback(async () => {
    await flush()
    onClose()
  }, [flush, onClose])

  const handleUse = useCallback(async () => {
    await flush()
    onUseInNextSession()
  }, [flush, onUseInNextSession])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void handleSaveAndClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [handleSaveAndClose])

  // ── Tags ──────────────────────────────────────────────────────────────────
  const addTag = useCallback(
    (raw: string) => {
      const t = raw.trim().replace(/^#/, '')
      if (!t || tags.includes(t)) return
      setTags((prev) => [...prev, t])
      setTagInput('')
    },
    [tags],
  )
  const removeTag = useCallback((t: string) => {
    setTags((prev) => prev.filter((x) => x !== t))
  }, [])

  // ── Attachments ─────────────────────────────────────────────────────────
  const handleAttachFiles = useCallback(async () => {
    setAttachError('')
    const result = (await window.electronAPI.invoke('notes:pick-files')) as {
      canceled?: boolean
      attachments?: NoteAttachment[]
      errors?: string[]
    }
    if (result.canceled) return
    if (result.attachments) setAttachments((prev) => [...prev, ...result.attachments!])
    if (result.errors?.length) setAttachError(result.errors.join('; '))
  }, [])
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this note? This cannot be undone.')) return
    await window.electronAPI.invoke('notes:delete', { id: note.id })
    onChange()
    onClose()
  }, [note.id, onChange, onClose])

  // ── Editor wiring ─────────────────────────────────────────────────────────
  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      keymap.of([
        { key: 'Mod-b', run: (v) => (wrapInline(v, '**'), true) },
        { key: 'Mod-i', run: (v) => (wrapInline(v, '*'), true) },
        { key: 'Mod-k', run: (v) => (insertLink(v), true) },
      ]),
    ],
    [],
  )

  // Run a toolbar command against the live editor view.
  const cmd = useCallback(
    (fn: (v: EditorView) => void) => () => {
      if (viewRef.current) fn(viewRef.current)
    },
    [],
  )

  const showEditor = viewMode !== 'preview'
  const showPreview = viewMode !== 'edit'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Edit note"
    >
      {/* Backdrop — clicking saves and closes */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => void handleSaveAndClose()}
      />

      {/* Card */}
      <div
        data-testid="notes-editor-modal"
        className="relative z-10 flex flex-col w-full max-w-5xl h-[88vh] rounded-2xl border border-gray-700 shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--brand-dark-card)' }}
      >
        {/* Header — title + view toggle + close */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 flex-shrink-0">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled note"
            aria-label="Note title"
            className="flex-1 min-w-0 bg-transparent text-lg font-semibold text-white border-0 focus:outline-none placeholder-gray-600"
          />
          <SaveIndicator status={saveStatus} />
          <div className="flex items-center bg-gray-800 rounded-lg p-0.5 text-xs flex-shrink-0">
            {(['edit', 'split', 'preview'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                  viewMode === m ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={() => void handleSaveAndClose()}
            aria-label="Close editor"
            className="text-gray-400 hover:text-gray-200 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Meta row — category, pin, tags */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-800 flex-shrink-0 flex-wrap">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            className="text-xs bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 capitalize"
          >
            {NOTE_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="accent-indigo-500"
            />
            Pin
          </label>
          <div className="h-4 w-px bg-gray-700" />
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-[12rem]">
            {tags.map((t) => (
              <span
                key={t}
                className="text-[11px] bg-gray-800 border border-gray-700 rounded-full px-2 py-0.5 text-gray-300 flex items-center gap-1"
              >
                #{t}
                <button
                  onClick={() => removeTag(t)}
                  aria-label={`Remove tag ${t}`}
                  className="text-gray-500 hover:text-red-400"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag(tagInput)
                }
              }}
              list={`tag-suggestions-${note.id}`}
              placeholder="Add tag…"
              aria-label="Add tag"
              className="text-xs bg-transparent text-gray-200 placeholder-gray-600 focus:outline-none w-24 py-0.5"
            />
            <datalist id={`tag-suggestions-${note.id}`}>
              {tagSuggestions
                .filter((t) => !tags.includes(t))
                .map((t) => (
                  <option key={t} value={t} />
                ))}
            </datalist>
          </div>
        </div>

        {/* Toolbar */}
        {showEditor && (
          <div className="flex items-center gap-0.5 px-4 py-1.5 border-b border-gray-800 flex-shrink-0 flex-wrap">
            <ToolbarButton label="B" title="Bold (⌘B)" onClick={cmd((v) => wrapInline(v, '**'))} />
            <ToolbarButton label="I" title="Italic (⌘I)" onClick={cmd((v) => wrapInline(v, '*'))} />
            <div className="h-4 w-px bg-gray-700 mx-1" />
            <ToolbarButton label="H1" title="Heading 1" mono onClick={cmd((v) => prefixLines(v, '# '))} />
            <ToolbarButton label="H2" title="Heading 2" mono onClick={cmd((v) => prefixLines(v, '## '))} />
            <div className="h-4 w-px bg-gray-700 mx-1" />
            <ToolbarButton label="•" title="Bullet list" onClick={cmd((v) => prefixLines(v, '- '))} />
            <ToolbarButton label="1." title="Numbered list" mono onClick={cmd(numberLines)} />
            <ToolbarButton label="❝" title="Quote" onClick={cmd((v) => prefixLines(v, '> '))} />
            <div className="h-4 w-px bg-gray-700 mx-1" />
            <ToolbarButton label="‹›" title="Inline code" mono onClick={cmd((v) => wrapInline(v, '`'))} />
            <ToolbarButton label="{ }" title="Code block" mono onClick={cmd(insertCodeBlock)} />
            <ToolbarButton label="🔗" title="Link (⌘K)" onClick={cmd(insertLink)} />
          </div>
        )}

        {/* Body — editor / split / preview */}
        <div className="flex-1 flex min-h-0">
          {showEditor && (
            <div className={`${showPreview ? 'w-1/2 border-r border-gray-800' : 'w-full'} overflow-auto`}>
              <CodeMirror
                value={content}
                height="100%"
                theme={oneDark}
                extensions={extensions}
                onChange={(val) => setContent(val)}
                onCreateEditor={(view) => {
                  viewRef.current = view
                }}
                placeholder="Write your note in markdown…"
                aria-label="Note body"
                className="h-full text-sm"
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  highlightActiveLine: true,
                }}
              />
            </div>
          )}
          {showPreview && (
            <div className={`${showEditor ? 'w-1/2' : 'w-full'} overflow-auto px-6 py-4`}>
              <div className="prose-chat max-w-none" data-testid="notes-preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {content || '_Nothing to preview yet._'}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* Attachments */}
        <div className="px-5 py-2 border-t border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">
              Attachments {attachments.length > 0 && `(${attachments.length})`}
            </span>
            <button
              type="button"
              onClick={() => void handleAttachFiles()}
              className="text-[10px] text-indigo-300 hover:text-indigo-200"
            >
              + Add files
            </button>
            {attachError && <span className="text-[10px] text-red-400">{attachError}</span>}
          </div>
          {attachments.length > 0 && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-md px-2 py-1 text-xs"
                >
                  <span className="text-gray-300 max-w-[12rem] truncate">{a.name}</span>
                  <span className="text-[10px] text-gray-500">{(a.sizeBytes / 1024).toFixed(1)}KB</span>
                  <button
                    onClick={() => removeAttachment(a.id)}
                    aria-label={`Remove attachment ${a.name}`}
                    className="text-gray-500 hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-800 px-5 py-3 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => void handleSaveAndClose()}
            data-testid="notes-save-close"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Save &amp; close
          </button>
          <button
            onClick={() => void handleUse()}
            data-testid="notes-use-in-session"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-100 text-xs font-medium rounded-lg transition-colors border border-gray-700"
          >
            Use in next session →
          </button>
          <button
            onClick={() => void handleDelete()}
            className="ml-auto px-3 py-2 text-red-400 hover:text-red-300 text-xs font-medium border border-red-900/40 hover:border-red-800 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Save status pill ─────────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: SaveStatus }): JSX.Element | null {
  if (status === 'idle') return null
  return (
    <span
      className={`text-[10px] flex-shrink-0 ${status === 'saving' ? 'text-gray-500' : 'text-teal-400'}`}
      data-testid="notes-save-status"
    >
      {status === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}
