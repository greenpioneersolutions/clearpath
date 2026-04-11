import type { SessionInfo } from '../../types/ipc'
import type { OutputMessage } from '../OutputDisplay'
import ExtensionSlot from '../extensions/ExtensionSlot'

interface Props {
  session: SessionInfo
  messages: OutputMessage[]
  onContinue: () => void
  onSaveAsTemplate: () => void
  onDismiss: () => void
}

function formatDuration(startMs: number): string {
  const elapsed = Date.now() - startMs
  const secs = Math.floor(elapsed / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function SessionSummary({ session, messages, onContinue, onSaveAsTemplate, onDismiss }: Props): JSX.Element {
  const promptCount = messages.filter((m) => m.sender === 'user').length
  const errorCount = messages.filter((m) => m.output.type === 'error').length
  const toolUseCount = messages.filter((m) => m.output.type === 'tool-use').length
  const duration = formatDuration(session.startedAt)

  return (
    <div className="mx-auto max-w-lg py-8 px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="text-2xl mb-2">{errorCount > 0 ? '⚠️' : '✓'}</div>
          <h3 className="text-white font-semibold text-base">Session Complete</h3>
          <p className="text-gray-400 text-sm mt-0.5">
            {session.name ?? session.sessionId.slice(0, 8)} · {session.cli === 'copilot' ? 'Copilot' : 'Claude'}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Duration" value={duration} />
          <StatBox label="Prompts" value={String(promptCount)} />
          <StatBox label="Tool Uses" value={String(toolUseCount)} />
          <StatBox label="Errors" value={String(errorCount)} highlight={errorCount > 0} />
        </div>

        <ExtensionSlot slotName="session-summary:after-stats" className="pt-2" />

        {/* Actions */}
        <div className="space-y-2 pt-2">
          <button onClick={onContinue}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
            Continue in New Session
          </button>
          <div className="flex gap-2">
            <button onClick={onSaveAsTemplate}
              className="flex-1 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors">
              Save as Template
            </button>
            <button onClick={onDismiss}
              className="flex-1 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-800 transition-colors">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }): JSX.Element {
  return (
    <div className="bg-gray-800 rounded-lg px-3 py-2 text-center">
      <div className={`text-lg font-bold ${highlight ? 'text-red-400' : 'text-white'}`}>{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  )
}
