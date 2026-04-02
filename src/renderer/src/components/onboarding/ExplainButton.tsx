import { useState, useCallback } from 'react'

interface Props {
  /** The last exchange text from the session to explain */
  lastExchange: string
  sessionId: string
}

export default function ExplainButton({ lastExchange, sessionId }: Props): JSX.Element {
  const [explanation, setExplanation] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const handleExplain = useCallback(async () => {
    if (!lastExchange.trim()) return
    setLoading(true)
    setIsOpen(true)

    // Send a follow-up prompt asking for explanation
    const explainPrompt = `Explain in plain English what just happened in this conversation. What did the AI do, why, and what should the user check? Be concise and non-technical. Here is the last exchange:\n\n${lastExchange.slice(-2000)}`

    await window.electronAPI.invoke('cli:send-input', {
      sessionId,
      input: explainPrompt,
    })

    setExplanation('Explanation sent as follow-up prompt — check the session output above.')
    setLoading(false)
  }, [lastExchange, sessionId])

  return (
    <div className="relative">
      <button
        onClick={() => void handleExplain()}
        disabled={loading || !lastExchange.trim()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-40"
        title="Explain what just happened in plain English"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {loading ? 'Asking...' : 'What just happened?'}
      </button>

      {isOpen && explanation && (
        <div className="absolute bottom-full right-0 mb-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-indigo-600">Explanation</span>
            <button onClick={() => { setIsOpen(false); setExplanation(null) }}
              className="text-xs text-gray-400 hover:text-gray-600">Close</button>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{explanation}</p>
        </div>
      )}
    </div>
  )
}
