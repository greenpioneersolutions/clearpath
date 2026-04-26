import { useState, useRef, useEffect } from 'react'
import { MODEL_TIERS, defaultModelLabel } from '../data/modelTiers'
import type { BackendId } from '../../../shared/backends'
import { providerOf } from '../../../shared/backends'

interface Props {
  cli: BackendId
  /** Current model name (e.g. "gpt-4.1"). When undefined, shows the default model label. */
  currentModel?: string
  /** Called with the chosen model name. The Work page wires this to send `/model <name>`. */
  onChange: (model: string) => void
  /** Disable the chip (e.g. while session is processing). */
  disabled?: boolean
}

/**
 * Compact pill-style model selector for the chat input row.
 *
 * Click to open a small grouped dropdown of available models for the active CLI.
 * Selecting a model fires onChange — the Work page is responsible for actually
 * dispatching the `/model <name>` slash command to the running session.
 */
export default function ModelChip({ cli, currentModel, onChange, disabled }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const provider = providerOf(cli)
  const tiers = MODEL_TIERS[provider] ?? []
  const display = currentModel?.trim() ? currentModel : defaultModelLabel(provider)

  const handlePick = (model: string) => {
    setOpen(false)
    onChange(model)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title="Switch model for this session"
        aria-label={`Current model: ${display}. Click to change.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition-colors ${
          disabled
            ? 'opacity-50 cursor-not-allowed text-gray-500'
            : open
              ? 'bg-indigo-900/40 border-indigo-600/60 text-indigo-200'
              : 'bg-gray-800/70 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600'
        }`}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <span className="truncate max-w-[120px]">{display}</span>
        <svg
          className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Model picker"
          className="absolute bottom-full left-0 mb-2 w-56 rounded-xl shadow-2xl z-50 overflow-hidden animate-fadeIn"
          style={{ backgroundColor: 'var(--brand-dark-card)', border: '1px solid var(--brand-dark-border)' }}
        >
          <div className="px-3 py-2 border-b border-gray-800">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Switch model
            </p>
            <p className="text-[10px] text-gray-600 mt-0.5">
              Sends <code className="text-gray-400">/model</code> to this session.
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {tiers.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-3">No models available</p>
            )}
            {tiers.map((tier) => (
              <div key={tier.group}>
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-900/60">
                  {tier.group}
                </div>
                {tier.models.map((m) => {
                  const selected = m === currentModel
                  return (
                    <button
                      key={m}
                      role="option"
                      aria-selected={selected}
                      onClick={() => handlePick(m)}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                        selected
                          ? 'bg-indigo-900/30 text-indigo-200'
                          : 'text-gray-200 hover:bg-gray-800'
                      }`}
                    >
                      <span>{m}</span>
                      {selected && (
                        <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
