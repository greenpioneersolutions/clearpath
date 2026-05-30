import { useState, useEffect } from 'react'
import type { BackendId } from '../../../../shared/backends'

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
    title: 'Which assistant will you use?',
    body: 'Pick the AI you work with most. ClearPath supports both equally — this just sets your default so new sessions, models, and settings start where you want. You can switch any time.',
    icon: '🧭',
  },
  {
    title: 'Where do you keep your code?',
    body: "Point ClearPath at the folder with your projects so the AI can actually read your files. You can add more later in Configure → Local Setup.",
    icon: '📁',
  },
  {
    title: 'Choose Your Comfort Level',
    body: 'Pick a starting preset for how much autonomy the AI gets. You can always change this later in Settings.',
    icon: '🛡️',
  },
]

/** Index of the primary-CLI slide (kept in sync with SLIDES above). */
const CLI_SLIDE = 2
/** Index of the folder-picker slide (kept in sync with SLIDES above). */
const FOLDER_SLIDE = 3

/** The two providers offered as a primary, mapped to their CLI backend id. */
const CLI_CHOICES: { id: 'copilot' | 'claude'; name: string; backend: BackendId; blurb: string }[] = [
  { id: 'copilot', name: 'GitHub Copilot', backend: 'copilot-cli', blurb: 'Default model: Claude Sonnet. Uses your GitHub plan.' },
  { id: 'claude', name: 'Claude Code', backend: 'claude-cli', blurb: 'Anthropic’s CLI. Sonnet, Opus, or Haiku.' },
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
  const [primaryCli, setPrimaryCli] = useState<'copilot' | 'claude' | null>(null)
  const [folders, setFolders] = useState<Array<{ label: string; path: string }>>([])
  const [folderError, setFolderError] = useState<string | null>(null)

  const isLastSlide = step === SLIDES.length - 1
  const isCliSlide = step === CLI_SLIDE
  const isFolderSlide = step === FOLDER_SLIDE

  // Pre-select the primary when only one CLI is installed, so the common
  // single-CLI user can just click Next. A two-CLI (or zero-CLI) user picks.
  useEffect(() => {
    void (async () => {
      try {
        const s = await window.electronAPI.invoke('cli:check-installed') as
          | { copilot?: boolean; claude?: boolean } | null
        if (s?.claude && !s?.copilot) setPrimaryCli('claude')
        else if (s?.copilot && !s?.claude) setPrimaryCli('copilot')
      } catch { /* detection is best-effort — user can still choose */ }
    })()
  }, [])

  const handleAddFolder = async () => {
    setFolderError(null)
    try {
      const res = await window.electronAPI.invoke('locations:add-approved') as
        | { entry?: { label: string; path: string }; canceled?: boolean; error?: string }
        | null
      if (!res || res.canceled) return
      if (res.error) { setFolderError(res.error); return }
      if (!res.entry) return
      const entry = res.entry
      // The first folder added becomes the default working directory so sessions
      // are anchored to the user's code even before they pick a workspace.
      if (folders.length === 0) {
        await window.electronAPI.invoke('locations:set-default-cwd', { path: entry.path })
      }
      setFolders((prev) => (prev.some((f) => f.path === entry.path) ? prev : [...prev, entry]))
    } catch {
      setFolderError('Could not add that folder. Please try another.')
    }
  }

  const handleNext = async () => {
    if (isLastSlide) {
      // Persist the chosen primary as preferredBackend so the rest of the app
      // (quick-start, Settings CLI toggle, model defaults) orients around it.
      // Skipped silently when the user didn't pick one.
      if (primaryCli) {
        try {
          const choice = CLI_CHOICES.find((c) => c.id === primaryCli)
          const settings = await window.electronAPI.invoke('settings:get') as Record<string, unknown>
          await window.electronAPI.invoke('settings:set', {
            settings: { ...settings, preferredBackend: choice?.backend },
          })
        } catch { /* non-fatal — preset + onboarding still complete */ }
      }
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

        {/* Primary-CLI picker on the "Which assistant will you use?" slide */}
        {isCliSlide && (
          <div className="space-y-2 mb-6">
            {CLI_CHOICES.map((c) => (
              <button
                key={c.id}
                onClick={() => setPrimaryCli(c.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  primaryCli === c.id
                    ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-semibold text-gray-800">{c.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{c.blurb}</div>
              </button>
            ))}
            <p className="text-xs text-gray-400 text-center pt-1">
              Not sure? Pick either — you can switch any time in Settings.
            </p>
          </div>
        )}

        {/* Folder picker on the "Where do you keep your code?" slide */}
        {isFolderSlide && (
          <div className="mb-6">
            {folders.length > 0 && (
              <ul className="mb-3 space-y-1.5" data-testid="wizard-folder-list">
                {folders.map((f) => (
                  <li
                    key={f.path}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-left"
                  >
                    <span className="text-green-600">✓</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">{f.label}</span>
                      <span className="block text-xs text-gray-500 truncate">{f.path}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              data-testid="wizard-add-folder"
              onClick={() => void handleAddFolder()}
              className="w-full py-2.5 text-sm font-medium text-indigo-700 border-2 border-dashed border-indigo-300 rounded-xl hover:bg-indigo-50 transition-colors"
            >
              {folders.length === 0 ? '+ Choose a folder…' : '+ Add another folder'}
            </button>
            {folderError && <p className="mt-2 text-xs text-red-600">{folderError}</p>}
            <p className="mt-2 text-xs text-gray-400 text-center">This step is optional — you can skip it.</p>
          </div>
        )}

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
            onClick={() => void handleNext()}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-colors"
          >
            {isLastSlide ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
