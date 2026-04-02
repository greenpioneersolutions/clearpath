interface Props {
  maxBudgetUsd: number | null
  maxTurns: number | null
  verbose: boolean
  onBudgetChange: (budget: number | null) => void
  onTurnsChange: (turns: number | null) => void
  onVerboseChange: (verbose: boolean) => void
}

export default function BudgetLimits({
  maxBudgetUsd,
  maxTurns,
  verbose,
  onBudgetChange,
  onTurnsChange,
  onVerboseChange,
}: Props): JSX.Element {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Budget & Limits</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Controls for non-interactive (-p / --print) mode sessions
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-700">
        These settings only apply to headless/print mode sessions (Claude Code --print, Copilot --prompt).
        Interactive sessions do not enforce budget or turn limits.
      </div>

      {/* Max Budget */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-800">
            Max Budget <code className="text-xs text-gray-400 font-mono ml-1">--max-budget-usd</code>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-700 w-16 text-right">
              {maxBudgetUsd !== null ? `$${maxBudgetUsd.toFixed(2)}` : 'Off'}
            </span>
            {maxBudgetUsd !== null && (
              <button
                onClick={() => onBudgetChange(null)}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={50}
          step={0.5}
          value={maxBudgetUsd ?? 0}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            onBudgetChange(v > 0 ? v : null)
          }}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>$0 (off)</span>
          <span>$25</span>
          <span>$50</span>
        </div>
      </div>

      {/* Max Turns */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-800">
            Max Turns <code className="text-xs text-gray-400 font-mono ml-1">--max-turns</code>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-700 w-16 text-right">
              {maxTurns !== null ? maxTurns : 'Off'}
            </span>
            {maxTurns !== null && (
              <button
                onClick={() => onTurnsChange(null)}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={maxTurns ?? 0}
          onChange={(e) => {
            const v = parseInt(e.target.value)
            onTurnsChange(v > 0 ? v : null)
          }}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>0 (off)</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>

      {/* Verbose */}
      <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 bg-white">
        <div>
          <span className="text-sm font-medium text-gray-800">Verbose Logging</span>
          <code className="text-xs text-gray-400 font-mono ml-2">--verbose</code>
          <p className="text-xs text-gray-500 mt-0.5">Full turn-by-turn output</p>
        </div>
        <button
          onClick={() => onVerboseChange(!verbose)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            verbose ? 'bg-indigo-600' : 'bg-gray-300'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            verbose ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
      </div>
    </div>
  )
}
