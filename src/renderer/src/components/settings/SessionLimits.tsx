interface Props {
  /** Jump to the CLI Flags tab, pre-scoped to Claude. */
  onOpenFlags: () => void
}

/**
 * Session turn/budget/verbosity controls used to live here, but they overlapped
 * the Claude flags in the CLI Flags tab and — unlike those — never reached a
 * spawned session. They're now owned by **Settings → CLI Flags → Claude**, where
 * each value is applied as a real session default (see
 * `src/shared/sessionDefaultFlags.ts`). This panel redirects there so there's a
 * single source of truth rather than two controls that silently disagreed.
 */
export default function SessionLimits({ onOpenFlags }: Props): JSX.Element {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Session Limits</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Turn limits, budget, and verbose logging for Claude sessions
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 space-y-3">
        <p className="text-sm text-gray-700">
          These controls moved to{' '}
          <span className="font-medium text-gray-900">CLI Flags → Claude</span>, where they
          now apply as real session defaults:
        </p>
        <ul className="text-xs text-gray-600 space-y-1.5 ml-1">
          <li>
            <code className="font-mono text-gray-500">--max-turns</code> · <code className="font-mono text-gray-500">--max-budget-usd</code>
            {' '}— in the <span className="font-medium">Budget &amp; Limits</span> category
          </li>
          <li>
            <code className="font-mono text-gray-500">--verbose</code>
            {' '}— in the <span className="font-medium">Output &amp; Format</span> category
          </li>
        </ul>
        <button
          onClick={onOpenFlags}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          Open Claude CLI Flags
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
