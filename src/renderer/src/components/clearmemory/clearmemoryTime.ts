// Small helper — converts an epoch-ms timestamp (or undefined) into a
// compact relative-time string. Kept local to the clearmemory module so we
// don't fight the existing `timeAgo` copy in NotesManager (which has slightly
// different thresholds).

export function relativeTime(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return ''
  const diff = Date.now() - ms
  if (diff < 0) return new Date(ms).toLocaleString()
  const secs = Math.floor(diff / 1_000)
  if (secs < 30) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}
