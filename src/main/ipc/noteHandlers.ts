import type { IpcMain } from 'electron'
import { dialog, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { readFileSync, existsSync, statSync } from 'fs'
import { basename, extname } from 'path'
import { assertPathWithinRoots, getWorkspaceAllowedRoots, isSensitiveSystemPath } from '../utils/pathSecurity'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { addAuditEntry } from './complianceHandlers'

// ── Types ────────────────────────────────────────────────────────────────────

/** A text file attached to a note. Content is read from disk at prompt-injection time. */
export interface NoteAttachment {
  id: string
  path: string             // absolute file path on disk
  name: string             // display name (filename)
  sizeBytes: number        // file size at time of attachment
  addedAt: number
}

export interface Note {
  id: string
  title: string
  content: string
  tags: string[]           // user-defined tags for organization
  category: string         // meeting | conversation | reference | outcome | idea | custom
  source?: string          // "session:abc123" or "manual" — where it came from
  sessionName?: string     // human-readable session name if from a session
  attachments: NoteAttachment[]  // text file attachments
  createdAt: number
  updatedAt: number
  pinned: boolean
}

// Supported text file extensions — both CLIs can handle these as plain text
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.html', '.htm', '.css', '.scss', '.less',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.sh', '.bash', '.zsh', '.fish', '.ps1',
  '.sql', '.graphql', '.gql',
  '.env', '.ini', '.cfg', '.conf', '.properties',
  '.gitignore', '.dockerignore', '.editorconfig',
  '.log', '.diff', '.patch',
])

interface NoteStoreSchema {
  notes: Note[]
}

const store = new Store<NoteStoreSchema>({
  name: 'clear-path-notes',
  defaults: { notes: [] },
  encryptionKey: getStoreEncryptionKey(),
})

// ── Registration ─────────────────────────────────────────────────────────────

export function registerNoteHandlers(ipcMain: IpcMain): void {

  // List all notes, newest first. Optional filters.
  ipcMain.handle('notes:list', (_e, args?: { category?: string; tag?: string; search?: string; pinnedOnly?: boolean }) => {
    let notes = store.get('notes')

    if (args?.category) notes = notes.filter((n) => n.category === args.category)
    if (args?.tag) notes = notes.filter((n) => n.tags.includes(args.tag!))
    if (args?.pinnedOnly) notes = notes.filter((n) => n.pinned)
    if (args?.search) {
      const q = args.search.toLowerCase()
      notes = notes.filter((n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    return notes.sort((a, b) => {
      // Pinned first, then by updatedAt
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.updatedAt - a.updatedAt
    })
  })

  // Get a single note
  ipcMain.handle('notes:get', (_e, args: { id: string }) => {
    return store.get('notes').find((n) => n.id === args.id) ?? null
  })

  // Create a new note
  ipcMain.handle('notes:create', (_e, args: {
    title: string; content: string; tags?: string[]; category?: string
    source?: string; sessionName?: string; pinned?: boolean; attachments?: NoteAttachment[]
  }) => {
    const note: Note = {
      id: randomUUID(),
      title: args.title,
      content: args.content,
      tags: args.tags ?? [],
      category: args.category ?? 'reference',
      source: args.source,
      sessionName: args.sessionName,
      attachments: args.attachments ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: args.pinned ?? false,
    }
    const notes = store.get('notes')
    notes.push(note)
    store.set('notes', notes)
    return note
  })

  // Update a note
  ipcMain.handle('notes:update', (_e, args: {
    id: string; title?: string; content?: string; tags?: string[]
    category?: string; pinned?: boolean; attachments?: NoteAttachment[]
  }) => {
    const notes = store.get('notes')
    const idx = notes.findIndex((n) => n.id === args.id)
    if (idx === -1) return { error: 'Note not found' }

    const note = notes[idx]
    if (args.title !== undefined) note.title = args.title
    if (args.content !== undefined) note.content = args.content
    if (args.tags !== undefined) note.tags = args.tags
    if (args.category !== undefined) note.category = args.category
    if (args.pinned !== undefined) note.pinned = args.pinned
    if (args.attachments !== undefined) note.attachments = args.attachments
    note.updatedAt = Date.now()

    notes[idx] = note
    store.set('notes', notes)
    return note
  })

  // Delete a note
  ipcMain.handle('notes:delete', (_e, args: { id: string }) => {
    const notes = store.get('notes')
    const target = notes.find((n) => n.id === args.id)
    store.set('notes', notes.filter((n) => n.id !== args.id))
    addAuditEntry({ actionType: 'config-change', summary: `Note deleted: ${target?.title ?? args.id}`, details: JSON.stringify({ id: args.id }) })
    return { success: true }
  })

  // Get all unique tags across notes
  ipcMain.handle('notes:tags', () => {
    const notes = store.get('notes')
    const tags = new Set<string>()
    for (const n of notes) n.tags.forEach((t) => tags.add(t))
    return Array.from(tags).sort()
  })

  // Get note count by category
  ipcMain.handle('notes:stats', () => {
    const notes = store.get('notes')
    const cats: Record<string, number> = {}
    for (const n of notes) cats[n.category] = (cats[n.category] ?? 0) + 1
    return { total: notes.length, byCategory: cats }
  })

  // ── File attachment handlers ───────────────────────────────────────────────

  // Pick text files via native dialog and return attachment metadata
  ipcMain.handle('notes:pick-files', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const dialogOpts = {
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [
        { name: 'Text Files', extensions: ['txt', 'md', 'csv', 'json', 'yaml', 'yml', 'xml', 'html', 'log', 'diff', 'patch', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties', 'sql', 'graphql'] },
        { name: 'Code Files', extensions: ['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp', 'cs', 'sh', 'bash', 'css', 'scss'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    }
    const result = await (win ? dialog.showOpenDialog(win, dialogOpts) : dialog.showOpenDialog(dialogOpts))
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    const attachments: NoteAttachment[] = []
    const errors: string[] = []

    for (const filePath of result.filePaths) {
      const ext = extname(filePath).toLowerCase()

      // Check if it's a text file we can safely read
      if (!TEXT_EXTENSIONS.has(ext) && ext !== '') {
        // Try to read it anyway — if it's valid UTF-8, allow it
        try {
          const buf = readFileSync(filePath)
          // Quick binary check: if >5% of bytes are non-text control chars, reject
          let controlCount = 0
          for (let i = 0; i < Math.min(buf.length, 8192); i++) {
            const b = buf[i]
            if (b < 32 && b !== 9 && b !== 10 && b !== 13) controlCount++
          }
          if (controlCount / Math.min(buf.length, 8192) > 0.05) {
            errors.push(`${basename(filePath)}: binary file — only text files are supported`)
            continue
          }
        } catch {
          errors.push(`${basename(filePath)}: could not read file`)
          continue
        }
      }

      try {
        const stat = statSync(filePath)
        // Cap at 500KB per file to avoid bloating prompts
        if (stat.size > 512_000) {
          errors.push(`${basename(filePath)}: file too large (${(stat.size / 1024).toFixed(0)}KB, max 500KB)`)
          continue
        }
        attachments.push({
          id: randomUUID(),
          path: filePath,
          name: basename(filePath),
          sizeBytes: stat.size,
          addedAt: Date.now(),
        })
      } catch {
        errors.push(`${basename(filePath)}: could not read file info`)
      }
    }

    return { attachments, errors }
  })

  // Read a single attachment's content from disk (for preview or injection)
  ipcMain.handle('notes:read-attachment', (_e, args: { path: string }) => {
    try {
      // Path validation: only allow reading from within home directory, block sensitive paths
      assertPathWithinRoots(args.path, getWorkspaceAllowedRoots())
      if (isSensitiveSystemPath(args.path)) return { error: 'Access denied — sensitive path' }
      if (!existsSync(args.path)) return { error: 'File not found — it may have been moved or deleted' }
      const content = readFileSync(args.path, 'utf8')
      return { content }
    } catch (err) {
      const msg = String(err)
      if (msg.includes('Path not allowed')) return { error: 'Path not allowed' }
      return { error: 'Could not read file' }
    }
  })

  // Get full note content including attachment text — used for prompt injection
  // Returns the note content + all readable attachment contents as one block
  ipcMain.handle('notes:get-full-content', (_e, args: { id: string }) => {
    const note = store.get('notes').find((n) => n.id === args.id)
    if (!note) return { error: 'Note not found' }

    const parts: string[] = []

    // Note body
    if (note.content.trim()) {
      parts.push(note.content)
    }

    // Attachments
    const attachments = note.attachments ?? []
    for (const att of attachments) {
      try {
        if (existsSync(att.path)) {
          const text = readFileSync(att.path, 'utf8')
          parts.push(`--- Attached file: ${att.name} ---\n${text}`)
        } else {
          parts.push(`--- Attached file: ${att.name} (file not found at ${att.path}) ---`)
        }
      } catch {
        parts.push(`--- Attached file: ${att.name} (could not read) ---`)
      }
    }

    return { content: parts.join('\n\n'), attachmentCount: attachments.length }
  })

  // Build the framed reference-context block sent to the AI when one or more
  // notes are attached to a prompt. The XML-ish format makes it unambiguous to
  // the model that this block is curated reference material — not part of the
  // user's instruction — and where each note begins/ends. We deliberately
  // *omit* the note's UUID; the model cites by title to avoid leaking
  // internal identifiers into AI output that might be saved or echoed back.
  ipcMain.handle('notes:get-bundle-for-prompt', (_e, args: { ids: string[] }) => {
    const allNotes = store.get('notes')
    const bundle = (args.ids ?? [])
      .map((id) => allNotes.find((n) => n.id === id))
      .filter((n): n is Note => Boolean(n))

    if (bundle.length === 0) {
      return { framedPrompt: '', noteCount: 0, attachmentCount: 0 }
    }

    let totalAttachments = 0
    const noteBlocks: string[] = []

    for (const note of bundle) {
      const attachments = note.attachments ?? []
      totalAttachments += attachments.length

      const sourceAttr = note.source && note.source !== 'manual'
        ? note.source                                 // e.g. "session:abc123"
        : 'manual'
      const sourceLabel = note.sessionName && note.source && note.source !== 'manual'
        ? `session:${note.sessionName}`
        : sourceAttr

      const openTag = `<note title="${escapeAttr(note.title)}" category="${escapeAttr(note.category)}" tags="${escapeAttr(note.tags.join(','))}" source="${escapeAttr(sourceLabel)}">`

      const innerParts: string[] = []
      if (note.content.trim()) innerParts.push(note.content)

      for (const att of attachments) {
        try {
          if (existsSync(att.path)) {
            const text = readFileSync(att.path, 'utf8')
            innerParts.push(`[attachment: ${att.name}]\n${text}`)
          } else {
            innerParts.push(`[attachment: ${att.name}] (file not found at ${att.path})`)
          }
        } catch {
          innerParts.push(`[attachment: ${att.name}] (could not read)`)
        }
      }

      noteBlocks.push(`${openTag}\n${innerParts.join('\n\n')}\n</note>`)
    }

    const preamble =
      'The user has attached the following notes as reference context. ' +
      'Treat them as authoritative information curated by the user. ' +
      'Use them when relevant to their request; cite by title if you reference one.'

    const framedPrompt =
      `${preamble}\n\n<notes count="${bundle.length}">\n${noteBlocks.join('\n')}\n</notes>`

    return {
      framedPrompt,
      noteCount: bundle.length,
      attachmentCount: totalAttachments,
    }
  })
}

/**
 * Escape a string for safe inclusion in a double-quoted XML attribute. We
 * escape the four characters that could break the XML-ish framing the model
 * relies on; everything else (including emoji + non-ASCII) passes through.
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
