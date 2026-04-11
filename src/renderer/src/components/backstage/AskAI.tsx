import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// ── Types ────────────────────────────────────────────────────────────────────

type AIMode = 'cloud' | 'local'

interface ContextPreview {
  context: string
  tokenEstimate: number
  entityRefs: string[]
}

interface LocalAIAnswer {
  answer: string
  entitiesUsed: string[]
  model: string
}

interface SummaryResult {
  text: string
  model: string
}

const EXAMPLE_QUESTIONS = [
  'How many services do we have?',
  'What does the platform team own?',
  'Which services are deprecated?',
  'What are the main systems?',
  'How is the payments system structured?',
]

// ── Component ────────────────────────────────────────────────────────────────

export default function AskAI(): JSX.Element {
  const navigate = useNavigate()
  const [mode, setMode] = useState<AIMode>('cloud')
  const [question, setQuestion] = useState('')
  const [localAiAvailable, setLocalAiAvailable] = useState(false)

  // Cloud mode state
  const [contextPreview, setContextPreview] = useState<ContextPreview | null>(null)
  const [buildingContext, setBuildingContext] = useState(false)

  // Local mode state
  const [localAnswer, setLocalAnswer] = useState<LocalAIAnswer | null>(null)
  const [localLoading, setLocalLoading] = useState(false)

  // Summary state
  const [summary, setSummary] = useState<SummaryResult | null>(null)
  const [generatingSummary, setGeneratingSummary] = useState(false)

  // Entities used (collapsible)
  const [showEntities, setShowEntities] = useState(false)

  // Detect local AI availability
  useEffect(() => {
    void (async () => {
      try {
        const result = (await window.electronAPI.invoke('local-models:detect')) as {
          available: boolean
        } | null
        setLocalAiAvailable(!!result?.available)
      } catch {
        setLocalAiAvailable(false)
      }
    })()
  }, [])

  // Cloud AI: build context
  const handleCloudSubmit = useCallback(async () => {
    if (!question.trim()) return
    setBuildingContext(true)
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:build-ai-context', {
        question,
      })) as { success: boolean; context?: string; tokenEstimate?: number; entityRefs?: string[] }
      if (result.success) {
        setContextPreview({
          context: result.context ?? '',
          tokenEstimate: result.tokenEstimate ?? 0,
          entityRefs: result.entityRefs ?? [],
        })
      }
    } catch {
      // silent
    } finally {
      setBuildingContext(false)
    }
  }, [question])

  // Cloud AI: start a new CLI session with catalog context baked in, navigate to Work
  const sendToSession = async () => {
    if (!contextPreview) return
    try {
      const contextBlock = `[Reference context from Backstage catalog]\n\n${contextPreview.context}\n\n---\n\n${question}`

      // Start the CLI process — this spawns the child process and sends the initial prompt
      const { sessionId } = (await window.electronAPI.invoke('cli:start-session', {
        cli: 'copilot',
        mode: 'interactive',
        name: `Backstage: ${question.slice(0, 40)}${question.length > 40 ? '...' : ''}`,
      })) as { sessionId: string }

      // Now send the actual prompt with context into the running session
      await window.electronAPI.invoke('cli:send-input', {
        sessionId,
        input: contextBlock,
      })

      // Navigate to Work — it will pick up the running session via cli:list-sessions
      navigate('/work')
    } catch {
      navigate('/work')
    }
  }

  // Local AI: ask question
  const handleLocalSubmit = useCallback(async () => {
    if (!question.trim()) return
    setLocalLoading(true)
    setLocalAnswer(null)
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:ask-local-ai', {
        question,
      })) as { success: boolean; answer?: string; entitiesUsed?: string[]; model?: string }
      if (result.success) {
        setLocalAnswer({
          answer: result.answer ?? '',
          entitiesUsed: result.entitiesUsed ?? [],
          model: result.model ?? 'unknown',
        })
      }
    } catch {
      // silent
    } finally {
      setLocalLoading(false)
    }
  }, [question])

  // Generate summary
  const handleGenerateSummary = async () => {
    setGeneratingSummary(true)
    setSummary(null)
    try {
      const result = (await window.electronAPI.invoke('backstage-explorer:generate-summary', {
        scope: 'full-catalog',
      })) as { success: boolean; text?: string; model?: string }
      if (result.success) {
        setSummary({
          text: result.text ?? '',
          model: result.model ?? 'unknown',
        })
      }
    } catch {
      // silent
    } finally {
      setGeneratingSummary(false)
    }
  }

  const handleSubmit = () => {
    if (mode === 'cloud') {
      void handleCloudSubmit()
    } else {
      void handleLocalSubmit()
    }
  }

  const setExampleQuestion = (q: string) => {
    setQuestion(q)
  }

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setMode('cloud')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'cloud'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Cloud AI
        </button>
        <button
          onClick={() => setMode('local')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'local'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Local AI
        </button>
      </div>

      {/* Question input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          placeholder={mode === 'cloud' ? 'Ask about your catalog (builds context for AI session)...' : 'Ask about your catalog (answered locally)...'}
          className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button
          onClick={handleSubmit}
          disabled={!question.trim() || buildingContext || localLoading}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {buildingContext || localLoading ? 'Working...' : mode === 'cloud' ? 'Build Context' : 'Ask'}
        </button>
      </div>

      {/* Quick-start examples */}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => setExampleQuestion(q)}
            className="text-xs px-2.5 py-1 bg-gray-50 text-gray-600 border border-gray-200 rounded-full hover:bg-gray-100 hover:border-gray-300 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Cloud mode: context preview */}
      {mode === 'cloud' && contextPreview && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">Context Preview</h4>
            <span className="text-xs text-gray-400">~{contextPreview.tokenEstimate} tokens</span>
          </div>
          <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap">
            {contextPreview.context}
          </pre>

          {/* Entities used */}
          {contextPreview.entityRefs.length > 0 && (
            <div>
              <button
                onClick={() => setShowEntities(!showEntities)}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                {showEntities ? 'Hide' : 'Show'} entities used ({contextPreview.entityRefs.length})
              </button>
              {showEntities && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {contextPreview.entityRefs.map((ref) => (
                    <span key={ref} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                      {ref}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => void sendToSession()}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Send to Session
          </button>
        </div>
      )}

      {/* Local mode: not available message */}
      {mode === 'local' && !localAiAvailable && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-sm text-amber-800 font-medium">Local AI not detected</p>
          <p className="text-xs text-amber-600 mt-1">
            Install Ollama for local AI — ask unlimited catalog questions without cloud API costs.
          </p>
          <a
            href="https://ollama.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-xs text-indigo-600 hover:text-indigo-500 font-medium"
          >
            Install Ollama
          </a>
        </div>
      )}

      {/* Local mode: loading */}
      {mode === 'local' && localLoading && (
        <div className="flex items-center gap-3 py-8 justify-center">
          <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Thinking locally...</span>
        </div>
      )}

      {/* Local mode: answer */}
      {mode === 'local' && localAnswer && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">Answer</h4>
            <span className="text-[10px] text-gray-400">via {localAnswer.model}</span>
          </div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {localAnswer.answer}
          </div>

          {/* Entities used */}
          {localAnswer.entitiesUsed.length > 0 && (
            <div>
              <button
                onClick={() => setShowEntities(!showEntities)}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                {showEntities ? 'Hide' : 'Show'} entities used ({localAnswer.entitiesUsed.length})
              </button>
              {showEntities && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {localAnswer.entitiesUsed.map((ref) => (
                    <span key={ref} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                      {ref}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Generate Summary button */}
      <div className="border-t border-gray-200 pt-4">
        <button
          onClick={() => void handleGenerateSummary()}
          disabled={generatingSummary}
          className="px-4 py-2 text-sm font-medium bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {generatingSummary ? 'Generating Summary...' : 'Generate Catalog Summary'}
        </button>

        {summary && (
          <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900">Catalog Summary</h4>
              <span className="text-[10px] text-gray-400">via {summary.model}</span>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {summary.text}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
