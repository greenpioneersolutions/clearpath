import { useState, useCallback } from 'react'
import PermissionModeSelector from '../components/tools/PermissionModeSelector'
import ToolToggles from '../components/tools/ToolToggles'
import PermissionRequestHandler from '../components/tools/PermissionRequestHandler'
import type { ClaudePermissionMode, CopilotPermissionPreset } from '../types/tools'

type Tab = 'permissions' | 'tools' | 'requests'

const TABS: { key: Tab; label: string }[] = [
  { key: 'permissions', label: 'Permission Mode' },
  { key: 'tools', label: 'Tool Toggles' },
  { key: 'requests', label: 'Requests' },
]

export default function Tools(): JSX.Element {
  const [tab, setTab] = useState<Tab>('permissions')
  const [cli, setCli] = useState<'copilot' | 'claude'>('copilot')

  // Permission mode state
  const [claudeMode, setClaudeMode] = useState<ClaudePermissionMode>('default')
  const [copilotPreset, setCopilotPreset] = useState<CopilotPermissionPreset>('default')

  // Tool list state
  const [allowedTools, setAllowedTools] = useState<string[]>([])
  const [disallowedTools, setDisallowedTools] = useState<string[]>([])
  const [deniedTools, setDeniedTools] = useState<string[]>([])
  const [availableTools, setAvailableTools] = useState<string[]>([])
  const [excludedTools, setExcludedTools] = useState<string[]>([])

  // Generate the CLI flag preview string
  const generateFlagPreview = useCallback((): string => {
    const flags: string[] = []

    if (cli === 'claude') {
      if (claudeMode !== 'default') flags.push(`--permission-mode ${claudeMode}`)
      for (const t of allowedTools) flags.push(`--allowedTools ${t}`)
      for (const t of disallowedTools) flags.push(`--disallowedTools ${t}`)
    } else {
      if (copilotPreset === 'yolo') flags.push('--yolo')
      else if (copilotPreset === 'allow-all') flags.push('--allow-all')
      else if (copilotPreset === 'allow-all-tools') flags.push('--allow-all-tools')
      for (const t of allowedTools) flags.push(`--allow-tool ${t}`)
      for (const t of deniedTools) flags.push(`--deny-tool ${t}`)
      if (availableTools.length > 0) flags.push(`--available-tools ${availableTools.join(',')}`)
      if (excludedTools.length > 0) flags.push(`--excluded-tools ${excludedTools.join(',')}`)
    }

    if (flags.length === 0) return 'No flags configured'
    const binary = cli === 'copilot' ? 'copilot' : 'claude'
    return `${binary} ${flags.join(' ')}`
  }, [cli, claudeMode, copilotPreset, allowedTools, disallowedTools, deniedTools, availableTools, excludedTools])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tools & Permissions</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure tool permissions and handle permission requests
          </p>
        </div>

        {/* CLI selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">CLI:</span>
          {(['copilot', 'claude'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCli(c)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                cli === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {c === 'copilot' ? 'Copilot' : 'Claude'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {tab === 'permissions' ? (
          <PermissionModeSelector
            cli={cli}
            claudeMode={claudeMode}
            copilotPreset={copilotPreset}
            onClaudeModeChange={setClaudeMode}
            onCopilotPresetChange={setCopilotPreset}
          />
        ) : tab === 'tools' ? (
          <ToolToggles
            cli={cli}
            allowedTools={allowedTools}
            disallowedTools={disallowedTools}
            deniedTools={deniedTools}
            availableTools={availableTools}
            excludedTools={excludedTools}
            onAllowedChange={setAllowedTools}
            onDisallowedChange={setDisallowedTools}
            onDeniedChange={setDeniedTools}
            onAvailableChange={setAvailableTools}
            onExcludedChange={setExcludedTools}
          />
        ) : (
          <PermissionRequestHandler />
        )}
      </div>

      {/* CLI flag preview */}
      <div className="bg-gray-900 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            CLI Flag Preview
          </span>
          <button
            onClick={() => void navigator.clipboard.writeText(generateFlagPreview())}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Copy
          </button>
        </div>
        <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap break-all">
          {generateFlagPreview()}
        </pre>
      </div>
    </div>
  )
}
