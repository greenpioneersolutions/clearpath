import type { AppSettings } from '../../types/settings'
import { COPILOT_FLAGS, CLAUDE_FLAGS } from './flagDefs'

interface Props {
  cli: 'copilot' | 'claude'
  settings: AppSettings
}

function buildCommand(cli: 'copilot' | 'claude', settings: AppSettings): string {
  const parts: string[] = [cli === 'copilot' ? 'copilot' : 'claude']
  const flags = cli === 'copilot' ? COPILOT_FLAGS : CLAUDE_FLAGS

  // Model
  const model = settings.model[cli]
  if (model) parts.push(`--model ${model}`)

  // All flag overrides
  for (const flag of flags) {
    const key = `${flag.cli}:${flag.key}`
    const val = settings.flags[key]
    if (val === undefined || val === null || val === '' || val === false) continue

    if (flag.type === 'boolean' && val === true) {
      // Extract first flag name from label like "--experimental"
      const name = flag.flag.split('/')[0].trim()
      parts.push(name)
    } else if (flag.type === 'tags' && Array.isArray(val)) {
      const name = flag.flag.split('/')[0].trim().split(' ')[0]
      for (const item of val as string[]) {
        parts.push(`${name} ${quoteIfNeeded(item)}`)
      }
    } else if (flag.type === 'enum' || flag.type === 'string' || flag.type === 'number') {
      const name = flag.flag.split('/')[0].trim().split(' ')[0]
      parts.push(`${name} ${quoteIfNeeded(String(val))}`)
    }
  }

  // Budget / limits
  if (settings.maxBudgetUsd !== null) {
    parts.push(`--max-budget-usd ${settings.maxBudgetUsd}`)
  }
  if (settings.maxTurns !== null) {
    parts.push(`--max-turns ${settings.maxTurns}`)
  }
  if (settings.verbose) {
    parts.push('--verbose')
  }

  return parts.join(' ')
}

function quoteIfNeeded(s: string): string {
  if (/\s|['"*?(){}]/.test(s)) return `'${s.replace(/'/g, "'\\''")}'`
  return s
}

export default function LaunchCommandPreview({ cli, settings }: Props): JSX.Element {
  const command = buildCommand(cli, settings)
  const hasFlags = command.split(' ').length > 1

  const handleCopy = () => {
    void navigator.clipboard.writeText(command)
  }

  const handleRunInTerminal = () => {
    void window.electronAPI.invoke('settings:open-terminal', { command })
  }

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Launch Command Preview
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1"
          >
            Copy
          </button>
          <button
            onClick={handleRunInTerminal}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors px-2 py-1"
          >
            Run in Terminal
          </button>
        </div>
      </div>
      <div className="px-4 py-3">
        <pre className="text-sm font-mono whitespace-pre-wrap break-all leading-relaxed">
          <span className="text-green-400">$</span>{' '}
          {hasFlags ? (
            <span className="text-gray-200">{command}</span>
          ) : (
            <span className="text-gray-500">{command} <span className="italic">(no flags configured)</span></span>
          )}
        </pre>
      </div>
    </div>
  )
}
