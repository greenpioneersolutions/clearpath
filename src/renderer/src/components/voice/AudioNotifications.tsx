/**
 * Audio notifications for key events.
 * Uses the Web Audio API to generate simple tones.
 */

type SoundType = 'complete' | 'permission' | 'error' | 'rate-limit'

const SOUNDS: Record<SoundType, { frequency: number; duration: number; type: OscillatorType }> = {
  complete:    { frequency: 880, duration: 200, type: 'sine' },
  permission:  { frequency: 660, duration: 300, type: 'triangle' },
  error:       { frequency: 330, duration: 400, type: 'square' },
  'rate-limit': { frequency: 440, duration: 500, type: 'sine' },
}

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

export function playNotificationSound(type: SoundType): void {
  try {
    const ctx = getAudioContext()
    const sound = SOUNDS[type]

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.type = sound.type
    oscillator.frequency.setValueAtTime(sound.frequency, ctx.currentTime)

    // Fade out
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + sound.duration / 1000)

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + sound.duration / 1000)
  } catch {
    // Audio not available — silently ignore
  }
}

/**
 * Text-to-speech for reading responses aloud.
 */
export function speakText(text: string): void {
  if (!('speechSynthesis' in window)) return

  // Cancel any ongoing speech
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.0
  utterance.pitch = 1.0
  utterance.volume = 0.8

  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

export function isSpeaking(): boolean {
  return 'speechSynthesis' in window && window.speechSynthesis.speaking
}
