import { useState, useRef, useEffect } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { BackendId } from '../../../shared/backends'
import { providerOf, BACKEND_SHORT_LABELS } from '../../../shared/backends'
import type { SessionInfo } from '../types/ipc'

// ── Types ─────────────────────────────────────────────────────────────────

export interface SessionSettingsOptions {
  cli: BackendId
  name?: string
  workingDirectory?: string
  initialPrompt?: string
  model?: string
}

/** Only the fields an edit-mode submit can change. */
export interface SessionSettingsEditChanges {
  model?: string
  name?: string
}

const MODEL_TIERS: Record<string, { group: string; models: string[] }[]> = {
  copilot: [
    { group: 'Free', models: ['gpt-5-mini', 'gpt-4.1', 'gpt-4o'] },
    { group: '0.33x', models: ['claude-haiku-4.5', 'gemini-3-flash'] },
    { group: '1x', models: ['claude-sonnet-4.5', 'claude-sonnet-4.6', 'gpt-5', 'gemini-3-pro'] },
    { group: '3x', models: ['claude-opus-4.5', 'claude-opus-4.6'] },
  ],
  claude: [
    { group: 'Claude', models: ['sonnet', 'haiku', 'opus'] },
  ],
}

interface Props {
  /** 'create' = new session (all 5 fields) · 'edit' = mid-session (model + name only). */
  mode?: 'create' | 'edit'
  /** Required for `edit` mode — the session whose settings are being edited. */
  existingSession?: SessionInfo
  /** Current model for the existing session (used to pre-populate the model select in edit mode). */
  currentModel?: string
  /** Create-mode submit path. Receives the full set of options. */
  onStart?: (opts: SessionSettingsOptions) => void
  /** Edit-mode submit path. Receives only the fields that actually changed. */
  onSave?: (changes: SessionSettingsEditChanges) => void
  onClose: () => void
  defaultCli?: BackendId
}

/**
 * Dual-mode session settings modal.
 *
 * - In `create` mode this is the original "New session" dialog — 5 fields,
 *   `onStart` fires with everything the user entered.
 * - In `edit` mode CLI and working directory are read-only (can't change
 *   them mid-session), the initial-prompt field is hidden entirely, and
 *   `onSave` fires with only the fields that actually changed.
 *
 * The name field is always editable; the caller decides whether to wire it
 * to `cli:rename-session` (the IPC already exists, see handlers.ts).
 */
export default function SessionSettingsModal({
  mode = 'create',
  existingSession,
  currentModel,
  onStart,
  onSave,
  onClose,
  defaultCli,
}: Props): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const isEdit = mode === 'edit' && !!existingSession

  // Initial values differ by mode. In edit mode we seed from `existingSession`.
  const initialCli: BackendId = isEdit
    ? existingSession!.cli
    : (defaultCli ?? 'copilot-cli')
  const [cli, setCli] = useState<BackendId>(initialCli)
  const [model, setModel] = useState<string>(isEdit ? (currentModel ?? '') : '')
  const [name, setName] = useState<string>(isEdit ? (existingSession!.name ?? '') : '')
  const [workingDirectory, setWorkingDirectory] = useState<string>(
    isEdit ? (existingSession?.workingDirectory ?? '') : ''
  )
  const [initialPrompt, setInitialPrompt] = useState('')

  // Keep form in sync if the caller swaps in a different session while the
  // modal is mounted (rare, but cheap insurance).
  useEffect(() => {
    if (isEdit && existingSession) {
      setCli(existingSession.cli)
      setName(existingSession.name ?? '')
      setModel(currentModel ?? '')
      setWorkingDirectory(existingSession.workingDirectory ?? '')
    }
  }, [isEdit, existingSession, currentModel])

  useFocusTrap(panelRef, true)

  const titleText = isEdit ? 'Edit session' : 'New session'
  const submitLabel = isEdit ? 'Save changes' : 'Start Session'
  const submitAriaLabel = isEdit ? 'Save session changes' : 'Start new session'

  const handleSubmit = () => {
    if (isEdit && onSave) {
      const changes: SessionSettingsEditChanges = {}
      if (model && model !== (currentModel ?? '')) changes.model = model
      const trimmedName = name.trim()
      const originalName = existingSession!.name ?? ''
      if (trimmedName && trimmedName !== originalName) changes.name = trimmedName
      onSave(changes)
    } else if (onStart) {
      onStart({
        cli,
        name: name.trim() || undefined,
        workingDirectory: workingDirectory.trim() || undefined,
        initialPrompt: initialPrompt.trim() || undefined,
        model: model || undefined,
      })
    }
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  const cliLabel = (c: BackendId) => (providerOf(c) === 'copilot' ? 'GitHub Copilot' : 'Claude Code')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-settings-title"
        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md p-6"
      >
        <h2 id="session-settings-title" className="text-lg font-semibold text-white mb-5">
          {titleText}
        </h2>

        <div className="space-y-4">
          {/* CLI selector — read-only in edit mode */}
          <div>
            <label id="cli-selection-label" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              CLI {isEdit && <span className="normal-case text-gray-500 font-normal">(locked for this session)</span>}
            </label>
            <div className="flex gap-2" role="group" aria-labelledby="cli-selection-label">
              {(['copilot-cli', 'claude-cli'] as const).map((c) => {
                const selected = cli === c
                return (
                  <button
                    key={c}
                    onClick={() => { if (!isEdit) { setCli(c); setModel('') } }}
                    disabled={isEdit}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selected
                        ? isEdit
                          ? 'bg-gray-700 text-gray-400 border border-gray-600'
                          : 'bg-indigo-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    } ${isEdit ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    {cliLabel(c)}
                    {isEdit && selected && (
                      <span className="ml-1 text-[10px] text-gray-500">({BACKEND_SHORT_LABELS[c]})</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Model selector — editable in both modes */}
          <div>
            <label htmlFor="session-model" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Model{' '}
              <span className="normal-case text-gray-500 font-normal">(this session only)</span>
            </label>
            <select
              id="session-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="">{isEdit ? 'Keep current' : 'Use default'}</option>
              {(MODEL_TIERS[providerOf(cli)] ?? []).map((tier) => (
                <optgroup key={tier.group} label={tier.group}>
                  {tier.models.map((m) => <option key={m} value={m}>{m}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Session name — editable in both modes */}
          <div>
            <label htmlFor="session-name" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Session Name{' '}
              <span className="normal-case text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              id="session-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fix auth bug"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Working directory — read-only in edit mode */}
          <div>
            <label htmlFor="working-directory" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Working Directory{' '}
              <span className="normal-case text-gray-500 font-normal">
                {isEdit ? '(locked for this session)' : '(optional)'}
              </span>
            </label>
            <input
              type="text"
              id="working-directory"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/Users/me/my-project"
              disabled={isEdit}
              className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 font-mono outline-none focus:border-indigo-500 transition-colors ${
                isEdit ? 'cursor-not-allowed opacity-70' : ''
              }`}
            />
          </div>

          {/* Initial prompt — hidden in edit mode */}
          {!isEdit && (
            <div>
              <label htmlFor="initial-prompt" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
                Initial Prompt{' '}
                <span className="normal-case text-gray-500 font-normal">(optional)</span>
              </label>
              <textarea
                id="initial-prompt"
                value={initialPrompt}
                onChange={(e) => setInitialPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
                }}
                rows={3}
                placeholder="What should I help you with?"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors resize-none"
              />
              <p className="text-xs text-gray-600 mt-1">⌘↵ to start</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            aria-label={isEdit ? 'Cancel session edit' : 'Cancel new session'}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            aria-label={submitAriaLabel}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
