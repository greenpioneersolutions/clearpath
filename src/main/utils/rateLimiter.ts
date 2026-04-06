/**
 * Simple sliding-window rate limiter for IPC handlers.
 * Prevents abuse of expensive operations (session spawning, file watching, etc.)
 */

interface RateLimitEntry {
  timestamps: number[]
  windowMs: number
  maxCalls: number
}

const limits = new Map<string, RateLimitEntry>()

/**
 * Register a rate limit for a named operation.
 * @param name   Unique identifier (e.g., IPC channel name)
 * @param maxCalls  Maximum calls allowed within the window
 * @param windowMs  Sliding window size in milliseconds
 */
export function defineRateLimit(name: string, maxCalls: number, windowMs: number): void {
  limits.set(name, { timestamps: [], windowMs, maxCalls })
}

/**
 * Check if an operation is allowed under its rate limit.
 * Returns { allowed: true } if within limits, { allowed: false, retryAfterMs } if throttled.
 */
export function checkRateLimit(name: string): { allowed: boolean; retryAfterMs?: number } {
  const entry = limits.get(name)
  if (!entry) return { allowed: true } // No limit defined = always allowed

  const now = Date.now()
  // Prune old timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < entry.windowMs)

  if (entry.timestamps.length >= entry.maxCalls) {
    const oldest = entry.timestamps[0]
    const retryAfterMs = entry.windowMs - (now - oldest)
    return { allowed: false, retryAfterMs }
  }

  entry.timestamps.push(now)
  return { allowed: true }
}

// ── Pre-defined limits for expensive operations ─────────────────────────────

// Session creation: max 5 per minute
defineRateLimit('cli:start-session', 5, 60_000)

// Sub-agent spawning: max 10 per minute
defineRateLimit('subagent:spawn', 10, 60_000)

// File watchers: max 20 per minute (prevent descriptor exhaustion)
defineRateLimit('files:watch', 20, 60_000)

// Webhook testing: max 5 per minute (prevent abuse as request proxy)
defineRateLimit('notifications:test-webhook', 5, 60_000)

// Git operations: max 30 per minute
defineRateLimit('git:log', 30, 60_000)
defineRateLimit('git:diff', 30, 60_000)

// Workspace cloning: max 3 per minute
defineRateLimit('workspace:clone-repo', 3, 60_000)

// Data destruction: max 2 per minute
defineRateLimit('data:clear-store', 2, 60_000)
defineRateLimit('data:clear-all', 1, 60_000)

// Scheduler manual execution: max 3 per minute
defineRateLimit('scheduler:run-now', 3, 60_000)

// Knowledge base generation: max 2 per minute (spawns multiple sub-agents)
defineRateLimit('kb:generate', 2, 60_000)
