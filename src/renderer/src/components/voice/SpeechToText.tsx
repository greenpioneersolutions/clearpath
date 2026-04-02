import { useState, useRef, useCallback, useEffect } from 'react'

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent {
  error: string
}

// Web Speech API types (not in default TS lib)
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}

interface Props {
  onTranscript: (text: string) => void
  handsFreeMode: boolean
  onHandsFreeSend: (text: string) => void
}

export default function SpeechToText({ onTranscript, handsFreeMode, onHandsFreeSend }: Props): JSX.Element {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transcriptRef = useRef('')

  const isSupported = typeof window !== 'undefined' &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition)

  const startListening = useCallback(() => {
    if (!isSupported) { setError('Speech recognition not supported'); return }

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let final = ''
      let interimText = ''

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interimText += result[0].transcript
        }
      }

      setInterim(interimText)

      if (final) {
        transcriptRef.current += final
        onTranscript(transcriptRef.current.trim())

        // Hands-free: auto-send after 2s pause
        if (handsFreeMode) {
          if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
          pauseTimerRef.current = setTimeout(() => {
            if (transcriptRef.current.trim()) {
              onHandsFreeSend(transcriptRef.current.trim())
              transcriptRef.current = ''
              setInterim('')
            }
          }, 2000)
        }
      }
    }

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== 'no-speech') {
        setError(`Speech error: ${e.error}`)
        setListening(false)
      }
    }

    recognition.onend = () => {
      if (listening && handsFreeMode) {
        // Auto-restart in hands-free mode
        try { recognition.start() } catch { setListening(false) }
      } else {
        setListening(false)
      }
    }

    transcriptRef.current = ''
    recognition.start()
    setListening(true)
    setError('')
  }, [isSupported, handsFreeMode, onTranscript, onHandsFreeSend, listening])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort()
      recognitionRef.current = null
    }
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
    setListening(false)
    setInterim('')
  }, [])

  // Cleanup on unmount
  useEffect(() => () => stopListening(), [stopListening])

  if (!isSupported) {
    return (
      <button disabled className="p-2 text-gray-400 cursor-not-allowed" title="Speech recognition not supported in this environment">
        <MicIcon muted />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={listening ? stopListening : startListening}
        className={`p-2 rounded-lg transition-all ${
          listening
            ? 'bg-red-500 text-white animate-pulse'
            : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
        }`}
        title={listening ? 'Stop listening' : 'Start voice input'}
      >
        <MicIcon muted={!listening} />
      </button>

      {listening && (
        <div className="flex items-center gap-1.5">
          {/* Waveform visualizer */}
          <div className="flex items-end gap-0.5 h-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="w-0.5 bg-red-400 rounded-full animate-pulse"
                style={{
                  height: `${Math.random() * 12 + 4}px`,
                  animationDelay: `${i * 100}ms`,
                  animationDuration: `${500 + Math.random() * 500}ms`,
                }}
              />
            ))}
          </div>
          {interim && (
            <span className="text-xs text-gray-400 italic max-w-[150px] truncate">{interim}</span>
          )}
        </div>
      )}

      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}

function MicIcon({ muted }: { muted: boolean }): JSX.Element {
  return muted ? (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9v-2a7 7 0 007-7h2a9 9 0 01-18 0h2a7 7 0 007 7v2H8v2h8v-2h-4z" />
    </svg>
  )
}
