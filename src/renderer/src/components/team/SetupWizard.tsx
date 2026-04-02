import { useState, useEffect } from 'react'

interface SetupStatus {
  copilotInstalled: boolean
  claudeInstalled: boolean
  copilotPath: string | null
  claudePath: string | null
}

const STEPS = [
  { key: 'cli', label: 'CLI Tools Installed' },
  { key: 'auth', label: 'Authentication Configured' },
  { key: 'settings', label: 'Team Settings Applied' },
  { key: 'verify', label: 'Verification Complete' },
] as const

export default function SetupWizard(): JSX.Element {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [authChecked, setAuthChecked] = useState(false)
  const [settingsApplied, setSettingsApplied] = useState(false)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    void (async () => {
      const s = await window.electronAPI.invoke('team:check-setup') as SetupStatus
      setStatus(s)
      if (s.copilotInstalled || s.claudeInstalled) setCurrentStep(1)
    })()
  }, [])

  const handleCheckAuth = async () => {
    const result = await window.electronAPI.invoke('cli:check-auth') as { copilot: boolean; claude: boolean }
    setAuthChecked(result.copilot || result.claude)
    if (result.copilot || result.claude) setCurrentStep(2)
  }

  const handleApplySettings = async () => {
    // Try to import from shared folder
    const folder = await window.electronAPI.invoke('team:get-shared-folder') as string | null
    if (folder) {
      const configs = await window.electronAPI.invoke('team:list-shared-configs') as Array<{ path: string }>
      if (configs.length > 0) {
        await window.electronAPI.invoke('team:apply-shared-config', { path: configs[0].path })
      }
    }
    setSettingsApplied(true)
    setCurrentStep(3)
  }

  const handleVerify = () => {
    setVerified(true)
  }

  if (!status) return <div className="py-8 text-center text-gray-400 text-sm">Checking setup...</div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">New Member Setup Wizard</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Walk through the setup steps to get started with your team's configuration
        </p>
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const isComplete = i === 0 ? (status.copilotInstalled || status.claudeInstalled)
            : i === 1 ? authChecked
            : i === 2 ? settingsApplied
            : verified
          const isCurrent = i === currentStep

          return (
            <div key={step.key} className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
              isComplete ? 'border-green-200 bg-green-50' : isCurrent ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-white'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                isComplete ? 'bg-green-500 text-white' : isCurrent ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-400'
              }`}>
                {isComplete ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-xs font-bold">{i + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <span className={`text-sm font-medium ${isComplete ? 'text-green-700' : isCurrent ? 'text-indigo-700' : 'text-gray-500'}`}>
                  {step.label}
                </span>
                {i === 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Copilot: {status.copilotInstalled ? `Installed (${status.copilotPath})` : 'Not found'}
                    {' · '}
                    Claude: {status.claudeInstalled ? `Installed (${status.claudePath})` : 'Not found'}
                  </p>
                )}
              </div>
              {isCurrent && !isComplete && (
                <button
                  onClick={() => {
                    if (i === 1) void handleCheckAuth()
                    else if (i === 2) void handleApplySettings()
                    else if (i === 3) handleVerify()
                  }}
                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex-shrink-0"
                >
                  {i === 1 ? 'Check Auth' : i === 2 ? 'Apply Settings' : 'Verify'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {verified && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center">
          <p className="text-sm font-medium text-green-700">Setup complete! You're ready to go.</p>
        </div>
      )}

      {!status.copilotInstalled && !status.claudeInstalled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
          <p className="text-sm text-yellow-800 font-medium mb-2">No CLI tools detected</p>
          <div className="space-y-1 text-xs text-yellow-700 font-mono">
            <p>npm install -g @github/copilot</p>
            <p>npm install -g @anthropic-ai/claude-code</p>
          </div>
        </div>
      )}
    </div>
  )
}
