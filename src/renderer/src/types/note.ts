// Shared Note shape used by the Notes page and its editor overlay.
// Mirrors the persisted shape returned by the `notes:*` IPC handlers
// (src/main/ipc/noteHandlers.ts).

export interface NoteAttachment {
  id: string
  path: string
  name: string
  sizeBytes: number
  addedAt: number
}

export interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  category: string
  source?: string
  sessionName?: string
  attachments: NoteAttachment[]
  createdAt: number
  updatedAt: number
  pinned: boolean
}
