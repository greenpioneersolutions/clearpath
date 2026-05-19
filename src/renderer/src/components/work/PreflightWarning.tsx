import { useMemo } from 'react'

/**
 * Token Coach Phase 5 — single pre-flight warning banner.
 *
 * Reads a severity-prefixed note from `cli:prompt-shaped.notes` (e.g.
 * `"warn: this prompt would cost ~$0.04. 60% from agent prompt"`) and renders
 * it as a small banner above the chat input.
 *
 * The action buttons we expose depend on the message content — we sniff a few
 * keywords to decide which CTAs are useful. This is intentionally simple:
 * the pipeline writes plain English, the renderer matches a handful of
 * keywords, and the user has 1–2 obvious next steps. If a banner doesn't
 * match any pattern, only "Send anyway" is shown.
 *
 * Mounting/unmounting is owned by the parent stack — this component is pure.
 */

export type PreflightSeverity = 'warn' | 'info'

export interface PreflightWarningProps {
  /** Raw note string with severity prefix (e.g. "warn: ...") */
  note: string
  /** Open the Notes picker on the chat input. */
  onTrim?: () => void
  /** Dispatch /compact to the active session. */
  onCompact?: () => void
  /** Dismiss this banner (user acknowledges, sends anyway). */
  onDismiss: () => void
}

interface Parsed {
  severity: PreflightSeverity
  message: string
}

export function parseSeverity(note: string): Parsed {
  const m = note.match(/^(warn|info):\s*(.*)$/s)
  if (m) {
    return { severity: m[1] as PreflightSeverity, message: m[2].trim() }
  }
  // Default: treat unprefixed notes as info.
  return { severity: 'info', message: note.trim() }
}

export default function PreflightWarning(props: PreflightWarningProps): JSX.Element {
  const { note, onTrim, onCompact, onDismiss } = props
  const { severity, message } = useMemo(() => parseSeverity(note), [note])

  // Decide which action buttons to render based on the message content.
  const showCompact = /context window|\/compact/i.test(message) && !!onCompact
  const showTrim = /(notes? is|context sources is|trimming)/i.test(message) && !!onTrim

  const colorClasses = severity === 'warn'
    ? 'border-amber-700/50 bg-amber-900/20 text-amber-200'
    : 'border-teal-700/50 bg-teal-900/20 text-teal-200'

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 px-3 py-2 mx-4 mt-2 mb-0 rounded-lg border text-xs ${colorClasses}`}
      data-testid="preflight-warning"
    >
      <SeverityIcon severity={severity} />
      <span className="flex-1 leading-relaxed">{message}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {showTrim && onTrim && (
          <button
            type="button"
            onClick={onTrim}
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-800/60 hover:bg-gray-700/60 text-gray-200 transition-colors"
          >
            Trim
          </button>
        )}
        {showCompact && onCompact && (
          <button
            type="button"
            onClick={onCompact}
            className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-800/60 hover:bg-gray-700/60 text-gray-200 transition-colors"
          >
            Compact
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss warning"
          className="px-2 py-0.5 rounded text-[11px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
        >
          Send anyway
        </button>
      </div>
    </div>
  )
}

function SeverityIcon({ severity }: { severity: PreflightSeverity }): JSX.Element {
  if (severity === 'warn') {
    return (
      <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  )
}
