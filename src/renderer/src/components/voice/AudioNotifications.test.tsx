// @vitest-environment jsdom
import '@testing-library/jest-dom'

describe('AudioNotifications', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('playNotificationSound does not throw', async () => {
    const { playNotificationSound } = await import('./AudioNotifications')
    // The function catches errors gracefully (no AudioContext in jsdom)
    expect(() => playNotificationSound('complete')).not.toThrow()
    expect(() => playNotificationSound('error')).not.toThrow()
    expect(() => playNotificationSound('permission')).not.toThrow()
    expect(() => playNotificationSound('rate-limit')).not.toThrow()
  })

  it('playNotificationSound uses AudioContext when available', async () => {
    const mockStart = vi.fn()
    const mockStop = vi.fn()
    const mockConnect = vi.fn()

    // Define a global AudioContext mock that jsdom doesn't provide
    ;(globalThis as Record<string, unknown>).AudioContext = class {
      currentTime = 0
      destination = {}
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn() },
          connect: mockConnect,
          start: mockStart,
          stop: mockStop,
        }
      }
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        }
      }
    }

    const { playNotificationSound } = await import('./AudioNotifications')
    playNotificationSound('complete')

    expect(mockStart).toHaveBeenCalled()
    expect(mockStop).toHaveBeenCalled()
    expect(mockConnect).toHaveBeenCalled()
  })

  it('speakText calls speechSynthesis.speak', async () => {
    const mockSpeak = vi.fn()
    const mockCancel = vi.fn()
    Object.defineProperty(window, 'speechSynthesis', {
      value: { speak: mockSpeak, cancel: mockCancel, speaking: false },
      writable: true,
      configurable: true,
    })

    class MockUtterance {
      text: string
      rate = 1.0
      pitch = 1.0
      volume = 0.8
      constructor(text: string) { this.text = text }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: MockUtterance,
      writable: true,
      configurable: true,
    })

    const { speakText } = await import('./AudioNotifications')
    speakText('Hello world')
    expect(mockCancel).toHaveBeenCalled()
    expect(mockSpeak).toHaveBeenCalled()
  })

  it('stopSpeaking calls speechSynthesis.cancel', async () => {
    const mockCancel = vi.fn()
    Object.defineProperty(window, 'speechSynthesis', {
      value: { cancel: mockCancel, speaking: false },
      writable: true,
      configurable: true,
    })

    const { stopSpeaking } = await import('./AudioNotifications')
    stopSpeaking()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('isSpeaking returns true when speaking', async () => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: { speaking: true, cancel: vi.fn() },
      writable: true,
      configurable: true,
    })

    const { isSpeaking } = await import('./AudioNotifications')
    expect(isSpeaking()).toBe(true)
  })

  it('isSpeaking returns false when not speaking', async () => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: { speaking: false, cancel: vi.fn() },
      writable: true,
      configurable: true,
    })

    const { isSpeaking } = await import('./AudioNotifications')
    expect(isSpeaking()).toBe(false)
  })
})
