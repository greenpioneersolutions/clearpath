// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'

vi.mock('./AudioNotifications', () => ({
  speakText: vi.fn(),
  stopSpeaking: vi.fn(),
  isSpeaking: vi.fn().mockReturnValue(false),
}))

// Mock SpeechRecognition
class MockSpeechRecognition {
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
}

Object.defineProperty(window, 'SpeechRecognition', {
  value: MockSpeechRecognition,
  writable: true,
})
Object.defineProperty(window, 'webkitSpeechRecognition', {
  value: MockSpeechRecognition,
  writable: true,
})

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
})

import VoicePanel from './VoicePanel'

describe('VoicePanel', () => {
  const onSendToSession = vi.fn()

  beforeEach(() => {
    onSendToSession.mockReset()
  })

  it('renders microphone button', () => {
    render(<MemoryRouter><VoicePanel onSendToSession={onSendToSession} /></MemoryRouter>)
    expect(screen.getByTitle('Start voice input')).toBeInTheDocument()
  })

  it('renders HF (hands-free) toggle button', () => {
    render(<MemoryRouter><VoicePanel onSendToSession={onSendToSession} /></MemoryRouter>)
    const hfBtn = screen.getByText('HF')
    expect(hfBtn).toBeInTheDocument()
  })

  it('toggles hands-free mode on click', () => {
    render(<MemoryRouter><VoicePanel onSendToSession={onSendToSession} /></MemoryRouter>)
    const hfBtn = screen.getByText('HF')
    expect(hfBtn.className).toContain('text-gray-400')
    fireEvent.click(hfBtn)
    expect(hfBtn.className).toContain('bg-green-100')
  })

  it('renders TTS toggle button', () => {
    render(<MemoryRouter><VoicePanel onSendToSession={onSendToSession} /></MemoryRouter>)
    const ttsBtn = screen.getByTitle('Read responses aloud')
    expect(ttsBtn).toBeInTheDocument()
  })

  it('toggles TTS on click', () => {
    render(<MemoryRouter><VoicePanel onSendToSession={onSendToSession} /></MemoryRouter>)
    const ttsBtn = screen.getByTitle('Read responses aloud')
    fireEvent.click(ttsBtn)
    expect(ttsBtn.className).toContain('bg-blue-100')
  })
})
