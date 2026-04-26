// ── Minimal toast notifications ─────────────────────────────────────────────
// We didn't have an existing toast/notification primitive in the renderer
// (the NotificationManager is a persisted inbox, not an ephemeral popup), so
// this is a tiny dependency-free event bus that components subscribe to.
// The `<ToastHost />` component (see components/clearmemory/ToastHost.tsx)
// renders the current stack.
//
// API:
//   toast.success('Saved')        // 3s auto-dismiss
//   toast.error('Oh no', { ms: 6000 })
//   toast.info('FYI')
//   toast.subscribe(fn) → unsubscribe()

export type ToastLevel = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  level: ToastLevel
  message: string
  ttlMs: number
  createdAt: number
}

type Listener = (items: readonly ToastItem[]) => void

const DEFAULT_TTL_MS = 3_000

let nextId = 0
let items: ToastItem[] = []
const listeners = new Set<Listener>()

function emit(): void {
  const snapshot = [...items]
  for (const fn of listeners) fn(snapshot)
}

function push(level: ToastLevel, message: string, opts?: { ms?: number }): string {
  const id = `t-${Date.now().toString(36)}-${nextId++}`
  const ttlMs = Math.max(500, opts?.ms ?? DEFAULT_TTL_MS)
  items = [...items, { id, level, message, ttlMs, createdAt: Date.now() }]
  emit()

  window.setTimeout(() => dismiss(id), ttlMs)
  return id
}

function dismiss(id: string): void {
  const next = items.filter((t) => t.id !== id)
  if (next.length === items.length) return
  items = next
  emit()
}

function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  // Fire immediately so fresh subscribers see current state.
  fn([...items])
  return () => { listeners.delete(fn) }
}

export const toast = {
  success: (msg: string, opts?: { ms?: number }): string => push('success', msg, opts),
  error: (msg: string, opts?: { ms?: number }): string => push('error', msg, opts),
  info: (msg: string, opts?: { ms?: number }): string => push('info', msg, opts),
  dismiss,
  subscribe,
}
