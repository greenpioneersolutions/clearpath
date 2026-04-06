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
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#111827' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid #1F2937' }}>
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#9CA3AF' }}>
          Launch Command Preview
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="text-xs transition-colors px-2 py-1"
            style={{ color: '#6B7280' }}
            aria-label="Copy command to clipboard"
          >
            Copy
          </button>
          <button
            onClick={handleRunInTerminal}
            className="text-xs transition-colors px-2 py-1"
            style={{ color: '#818CF8' }}
            aria-label="Run command in terminal"
          >
            Run in Terminal
          </button>
        </div>
      </div>
      <div className="px-4 py-3">
        <pre className="text-sm font-mono whitespace-pre-wrap break-all leading-relaxed" style={{ color: '#E5E7EB' }}>
          <span style={{ color: '#4ADE80' }}>$</span>{' '}
          {hasFlags ? (
            <span>{command}</span>
          ) : (
            <span style={{ color: '#6B7280' }}>{command} <span className="italic">(no flags configured)</span></span>
          )}
        </pre>
      </div>
    </div>
  )
}
