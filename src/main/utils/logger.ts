/**
 * Centralized logger with configurable log levels.
 * In production builds (no ELECTRON_RENDERER_URL), defaults to 'warn'.
 * In development, defaults to 'debug'.
 *
 * Set CLEARPATH_LOG_LEVEL env var to override: 'debug' | 'info' | 'warn' | 'error' | 'none'
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
}

const isDev = !!process.env['ELECTRON_RENDERER_URL']
const configuredLevel = (process.env['CLEARPATH_LOG_LEVEL'] as LogLevel) || (isDev ? 'debug' : 'warn')
const currentPriority = LEVEL_PRIORITY[configuredLevel] ?? LEVEL_PRIORITY.warn

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= currentPriority
}

export const log = {
  /** Debug: verbose operational detail. NEVER include prompt content, secrets, or AI output. */
  debug: (...args: unknown[]): void => {
    if (shouldLog('debug')) console.log(...args)
  },

  /** Info: significant lifecycle events (session start/stop, turn completion). */
  info: (...args: unknown[]): void => {
    if (shouldLog('info')) console.log(...args)
  },

  /** Warn: unexpected but recoverable situations. */
  warn: (...args: unknown[]): void => {
    if (shouldLog('warn')) console.warn(...args)
  },

  /** Error: failures that need attention. */
  error: (...args: unknown[]): void => {
    if (shouldLog('error')) console.error(...args)
  },

  /** Current log level (for diagnostics). */
  level: configuredLevel,
}
