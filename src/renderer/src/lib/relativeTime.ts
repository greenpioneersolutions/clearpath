/**
 * Friendly relative-time + count labels for the session-pill surfaces.
 *
 * The Recent Sessions card, Active Sessions card, and the Home "pick up where
 * you left off" block each used to carry their own terse `timeAgo` ("1h ago",
 * "1 msg"). Pulled out here so the three surfaces never drift and so the wording
 * stays spelled-out and friendly for non-technical users ("1 hour ago",
 * "1 message"). Intentionally dependency-free to match the inline versions it
 * replaced — not a general-purpose date library.
 */

/** "just now", "1 minute ago", "3 hours ago", "2 days ago" — singular/plural aware. */
export function timeAgo(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return plural(mins, 'minute')
  const hours = Math.floor(mins / 60)
  if (hours < 24) return plural(hours, 'hour')
  return plural(Math.floor(hours / 24), 'day')
}

/** "1 message" / "8 messages". */
export function messageCountLabel(count: number): string {
  return `${count} message${count === 1 ? '' : 's'}`
}

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`
}
