import { useState } from 'react'

interface Props {
  onComplete: (preset: string) => void
}

const SLIDES = [
  {
    title: 'Welcome to Clear Path',
    body: 'A friendly GUI wrapper for GitHub Copilot CLI and Claude Code CLI. No terminal skills required — just type what you want done in plain English.',
    icon: '🚀',
  },
  {
    title: 'How It Works',
    body: 'You describe tasks in a chat-like interface. The app translates your input into CLI commands, spawns the right AI agent, and streams the results back to you in real-time.',
    icon: '⚡',
  },
  {
    title: 'Choose Your Comfort Level',
    body: 'Pick a starting preset for how much autonomy the AI gets. You can always change this later in Settings.',
    icon: '🛡️',
  },
]

const PRESETS = [
  {
    id: 'conservative',
    name: 'Conservative',
    description: 'The AI asks permission before every action. Best for learning and safety.',
    color: 'border-green-300 bg-green-50',
    active: 'border-green-500 ring-2 ring-green-200',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Auto-approve file edits, but prompt for shell commands. Good default.',
    color: 'border-blue-300 bg-blue-50',
    active: 'border-blue-500 ring-2 ring-blue-200',
  },
  {
    id: 'power-user',
    name: 'Power User',
    description: 'Auto-approve most operations. For experienced users who trust the AI.',
    color: 'border-purple-300 bg-purple-50',
    active: 'border-purple-500 ring-2 ring-purple-200',
  },
]

export default function FirstRunWizard({ onComplete }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const [preset, setPreset] = useState('balanced')

  const isLastSlide = step === SLIDES.length - 1

  const handleNext = () => {
    if (isLastSlide) {
      onComplete(preset)
    } else {
      setStep((s) => s + 1)
    }
  }

  const slide = SLIDES[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-indigo-900 via-gray-900 to-gray-950">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {SLIDES.map((_, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i === step ? 'bg-indigo-600' : i < step ? 'bg-indigo-300' : 'bg-gray-200'
            }`} />
          ))}
        </div>

        {/* Slide content */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">{slide.icon}</div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">{slide.title}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{slide.body}</p>
        </div>

        {/* Preset selector on last slide */}
        {isLastSlide && (
          <div className="space-y-2 mb-6">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  preset === p.id ? p.active : p.color
                }`}
              >
                <div className="text-sm font-semibold text-gray-800">{p.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{p.description}</div>
              </button>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-colors"
          >
            {isLastSlide ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
