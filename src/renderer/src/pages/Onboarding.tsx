import { useState, useEffect, useCallback } from 'react'
import FirstRunWizard from '../components/onboarding/FirstRunWizard'
import GuidedTasks from '../components/onboarding/GuidedTasks'
import SkillProgression from '../components/onboarding/SkillProgression'

type Tab = 'guided' | 'progress'
type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert'

interface OnboardingState {
  completedOnboarding: boolean
  trainingModeEnabled: boolean
  featureUsage: Record<string, boolean>
  guidedTasksCompleted: string[]
  level: SkillLevel
  progress: number
  total: number
}

export default function Onboarding(): JSX.Element {
  const [state, setState] = useState<OnboardingState | null>(null)
  const [tab, setTab] = useState<Tab>('guided')
  const [showWizard, setShowWizard] = useState(false)

  const load = useCallback(async () => {
    const s = await window.electronAPI.invoke('onboarding:get-state') as OnboardingState
    setState(s)
    if (!s.completedOnboarding) setShowWizard(true)
  }, [])

  useEffect(() => { void load() }, [load])

  const handleWizardComplete = async (preset: string) => {
    await window.electronAPI.invoke('onboarding:complete')
    // Apply the chosen preset to settings
    const presetMap: Record<string, string> = {
      conservative: 'builtin-safe',
      balanced: 'builtin-power',
      'power-user': 'builtin-power',
    }
    if (presetMap[preset]) {
      await window.electronAPI.invoke('settings:load-profile', { id: presetMap[preset] })
    }
    setShowWizard(false)
    void load()
  }

  const handleToggleTraining = async () => {
    if (!state) return
    const result = await window.electronAPI.invoke('onboarding:set-training-mode', {
      enabled: !state.trainingModeEnabled,
    }) as { enabled: boolean }
    setState((prev) => prev ? { ...prev, trainingModeEnabled: result.enabled } : prev)
  }

  const handleCompleteTask = async (taskId: string) => {
    await window.electronAPI.invoke('onboarding:complete-guided-task', { taskId })
    void load()
  }

  if (!state) return <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>

  if (showWizard) {
    return <FirstRunWizard onComplete={(preset) => void handleWizardComplete(preset)} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Learning Center</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Guided walkthroughs, skill tracking, and training mode
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowWizard(true)}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Replay Wizard
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">Training Mode</span>
            <button
              onClick={() => void handleToggleTraining()}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                state.trainingModeEnabled ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                state.trainingModeEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </label>
        </div>
      </div>

      {state.trainingModeEnabled && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5 text-xs text-indigo-700">
          Training Mode is ON — tooltips explaining CLI commands will appear when you use the app.
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {([['guided', 'Guided Tasks'], ['progress', 'Skill Progress']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {tab === 'guided' ? (
          <GuidedTasks
            completedTaskIds={state.guidedTasksCompleted}
            onComplete={(id) => void handleCompleteTask(id)}
          />
        ) : (
          <SkillProgression
            featureUsage={state.featureUsage}
            currentLevel={state.level}
            progress={state.progress}
            total={state.total}
          />
        )}
      </div>
    </div>
  )
}
