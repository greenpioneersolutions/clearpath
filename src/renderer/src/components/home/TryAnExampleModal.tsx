import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import type { PromptSuggestion } from '../../types/starter-pack'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Called with the picked prompt text. The modal closes itself afterwards. */
  onPick: (prompt: string) => void
}

export default function TryAnExampleModal({ isOpen, onClose, onPick }: Props): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, isOpen)

  const [prompts, setPrompts] = useState<PromptSuggestion[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!isOpen || loaded) return
    let cancelled = false
    void (async () => {
      try {
        const list = await window.electronAPI.invoke('starter-pack:get-all-prompts') as PromptSuggestion[] | null
        if (cancelled) return
        setPrompts(list ?? [])
      } catch {
        if (!cancelled) setPrompts([])
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen, loaded])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // launchpad-spotlight prompts belong to the Sessions QuickStartCard cold-start
  // chips, not this modal. Filter them out so they don't leak into "More".
  const visible = prompts.filter((p) => p.category !== 'launchpad-spotlight')
  const spotlight = visible.filter((p) => p.category === 'spotlight')
  const others = visible.filter((p) => p.category !== 'spotlight')

  const handlePick = (p: PromptSuggestion) => {
    onPick(p.displayText)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="try-example-title"
        className="relative w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
      >
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 id="try-example-title" className="text-base font-semibold text-gray-900">
              Try an example
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Pick a prompt to drop it into the input. You can edit it before sending.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-5">
          {!loaded && (
            <p className="text-sm text-gray-500">Loading examples…</p>
          )}

          {loaded && prompts.length === 0 && (
            <p className="text-sm text-gray-500">No examples available right now.</p>
          )}

          {spotlight.length > 0 && (
            <ExampleGroup title="Recommended" items={spotlight} onPick={handlePick} />
          )}

          {others.length > 0 && (
            <ExampleGroup title="More" items={others} onPick={handlePick} />
          )}
        </div>
      </div>
    </div>
  )
}

function ExampleGroup({
  title,
  items,
  onPick,
}: {
  title: string
  items: PromptSuggestion[]
  onPick: (p: PromptSuggestion) => void
}): JSX.Element {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p.id}>
            <div className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all">
              <p className="text-sm text-gray-800">{p.displayText}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-gray-400">via {p.targetAgentId}</span>
                <button
                  onClick={() => onPick(p)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  Use this prompt →
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
