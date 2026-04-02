import type { ClaudePermissionMode, CopilotPermissionPreset } from '../../types/tools'

const CLAUDE_MODES: { value: ClaudePermissionMode; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'Prompt for each tool use' },
  { value: 'plan', label: 'Plan', description: 'Auto-approve reads, prompt for writes' },
  { value: 'acceptEdits', label: 'Accept Edits', description: 'Auto-approve file edits, prompt for shell commands' },
  { value: 'auto', label: 'Auto', description: 'Auto-approve most operations' },
  { value: 'bypassPermissions', label: 'Bypass All', description: 'Skip all permission prompts (dangerous)' },
]

const COPILOT_PRESETS: { value: CopilotPermissionPreset; label: string; description: string }[] = [
  { value: 'default', label: 'Default', description: 'Prompt for each tool use' },
  { value: 'allow-all', label: 'Allow All', description: 'Enable all permissions' },
  { value: 'allow-all-tools', label: 'Allow All Tools', description: 'Auto-approve all file system paths' },
  { value: 'yolo', label: 'YOLO', description: 'Auto-approve everything without prompts (dangerous)' },
]

interface Props {
  cli: 'copilot' | 'claude'
  claudeMode: ClaudePermissionMode
  copilotPreset: CopilotPermissionPreset
  onClaudeModeChange: (mode: ClaudePermissionMode) => void
  onCopilotPresetChange: (preset: CopilotPermissionPreset) => void
}

export default function PermissionModeSelector({
  cli,
  claudeMode,
  copilotPreset,
  onClaudeModeChange,
  onCopilotPresetChange,
}: Props): JSX.Element {
  const items = cli === 'claude' ? CLAUDE_MODES : COPILOT_PRESETS
  const current = cli === 'claude' ? claudeMode : copilotPreset

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Permission Mode</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Controls how {cli === 'claude' ? 'Claude Code' : 'Copilot'} handles tool permission requests
        </p>
      </div>

      <div className="grid gap-2">
        {items.map((item) => {
          const isActive = current === item.value
          const isDangerous = item.value === 'bypassPermissions' || item.value === 'yolo'

          return (
            <button
              key={item.value}
              onClick={() => {
                if (cli === 'claude') onClaudeModeChange(item.value as ClaudePermissionMode)
                else onCopilotPresetChange(item.value as CopilotPermissionPreset)
              }}
              className={`text-left px-4 py-3 rounded-lg border transition-all ${
                isActive
                  ? isDangerous
                    ? 'border-red-400 bg-red-50 ring-1 ring-red-200'
                    : 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isActive ? (isDangerous ? 'text-red-700' : 'text-indigo-700') : 'text-gray-800'}`}>
                  {item.label}
                </span>
                {isActive && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    isDangerous ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'
                  }`}>
                    Active
                  </span>
                )}
                {isDangerous && !isActive && (
                  <span className="text-xs text-red-400">Caution</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
