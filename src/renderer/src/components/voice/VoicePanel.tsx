import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import SpeechToText from './SpeechToText'
import { matchVoiceCommand } from './VoiceCommands'
import { speakText, stopSpeaking, isSpeaking } from './AudioNotifications'

interface Props {
  onSendToSession: (text: string) => void
  lastResponse?: string
}

export default function VoicePanel({ onSendToSession, lastResponse }: Props): JSX.Element {
  const [handsFree, setHandsFree] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [commandFeedback, setCommandFeedback] = useState('')
  const navigate = useNavigate()

  const handleTranscript = useCallback((text: string) => {
    setTranscript(text)
  }, [])

  const handleSend = useCallback((text: string) => {
    // Check for voice commands first
    const cmd = matchVoiceCommand(text)
    if (cmd) {
      setCommandFeedback(`Command: ${cmd.description}`)
      setTimeout(() => setCommandFeedback(''), 2000)

      if (cmd.action.startsWith('navigate:')) {
        navigate(cmd.action.replace('navigate:', ''))
      } else if (cmd.action === 'killall') {
        void window.electronAPI.invoke('subagent:kill-all')
      }
      setTranscript('')
      return
    }

    // Otherwise send as prompt to active session
    onSendToSession(text)
    setTranscript('')
  }, [navigate, onSendToSession])

  const handleTtsToggle = () => {
    if (isSpeaking()) stopSpeaking()
    setTtsEnabled(!ttsEnabled)
  }

  // Auto-read responses when TTS is enabled
  if (ttsEnabled && lastResponse) {
    speakText(lastResponse)
  }

  return (
    <div className="flex items-center gap-2">
      <SpeechToText
        onTranscript={handleTranscript}
        handsFreeMode={handsFree}
        onHandsFreeSend={handleSend}
      />

      {/* Hands-free toggle */}
      <button
        onClick={() => setHandsFree(!handsFree)}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          handsFree
            ? 'bg-green-100 text-green-700'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }`}
        title={handsFree ? 'Hands-free mode ON (auto-sends after 2s pause)' : 'Enable hands-free mode'}
      >
        HF
      </button>

      {/* TTS toggle */}
      <button
        onClick={handleTtsToggle}
        className={`p-1.5 rounded-lg text-xs transition-colors ${
          ttsEnabled
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }`}
        title={ttsEnabled ? 'Text-to-speech ON' : 'Read responses aloud'}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
      </button>

      {/* Transcript preview */}
      {transcript && (
        <div className="flex items-center gap-1.5 max-w-[200px]">
          <span className="text-xs text-gray-500 truncate italic">{transcript}</span>
          <button
            onClick={() => handleSend(transcript)}
            className="text-xs text-indigo-600 hover:text-indigo-800 flex-shrink-0"
          >
            Send
          </button>
        </div>
      )}

      {commandFeedback && (
        <span className="text-xs text-green-600 animate-pulse">{commandFeedback}</span>
      )}
    </div>
  )
}
