// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import SpeechToText from './SpeechToText'

// Mock SpeechRecognition
const mockStart = vi.fn()
const mockStop = vi.fn()
const mockAbort = vi.fn()

class MockSpeechRecognition {
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  start = mockStart
  stop = mockStop
  abort = mockAbort
}

beforeEach(() => {
  Object.defineProperty(window, 'SpeechRecognition', {
    value: MockSpeechRecognition,
    writable: true,
  })
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    value: MockSpeechRecognition,
    writable: true,
  })
  mockStart.mockReset()
  mockStop.mockReset()
  mockAbort.mockReset()
})

describe('SpeechToText', () => {
  const defaultProps = {
    onTranscript: vi.fn(),
    handsFreeMode: false,
    onHandsFreeSend: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onTranscript.mockReset()
    defaultProps.onHandsFreeSend.mockReset()
  })

  it('renders the microphone button', () => {
    render(<SpeechToText {...defaultProps} />)
    const btn = screen.getByTitle('Start voice input')
    expect(btn).toBeInTheDocument()
  })

  it('starts listening on button click', () => {
    render(<SpeechToText {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Start voice input'))
    expect(mockStart).toHaveBeenCalled()
  })

  it('shows stop button while listening', () => {
    render(<SpeechToText {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Start voice input'))
    expect(screen.getByTitle('Stop listening')).toBeInTheDocument()
  })

  it('shows disabled button when speech recognition is not supported', () => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, writable: true })
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, writable: true })

    render(<SpeechToText {...defaultProps} />)
    const btn = screen.getByTitle('Speech recognition not supported in this environment')
    expect(btn).toBeDisabled()
  })
})
