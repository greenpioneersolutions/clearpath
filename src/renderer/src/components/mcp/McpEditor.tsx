import { useMemo, useState } from 'react'
import type { McpRegistryEntry, McpRegistryUpdateResponse } from '../../types/mcp'

interface Props {
  entry: McpRegistryEntry
  onClose: () => void
  onSaved: () => void
  onError?: (message: string) => void
  onWarning?: (message: string) => void
}

interface PlainEnvRow {
  key: string
  value: string
}

interface SecretRow {
  key: string
  /** true once the user decides to replace this secret. */
  replacing: boolean
  /** new plaintext value (only when replacing=true) */
  value: string
  revealed: boolean
}

export default function McpEditor({
  entry,
  onClose,
  onSaved,
  onError,
  onWarning,
}: Props): JSX.Element {
  const [name, setName] = useState(entry.name)
  const [command, setCommand] = useState(entry.command)
  const [argsText, setArgsText] = useState(entry.args.join(' '))
  const [targetCopilot, setTargetCopilot] = useState(entry.targets.copilot)
  const [targetClaude, setTargetClaude] = useState(entry.targets.claude)
  const [scope, setScope] = useState<'global' | 'project'>(entry.scope)

  const [plainRows, setPlainRows] = useState<PlainEnvRow[]>(
    Object.entries(entry.env).map(([k, v]) => ({ key: k, value: v })),
  )

  const [secretRows, setSecretRows] = useState<SecretRow[]>(
    Object.keys(entry.secretRefs).map((k) => ({
      key: k,
      replacing: false,
      value: '',
      revealed: false,
    })),
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updatePlainRow = (idx: number, patch: Partial<PlainEnvRow>) =>
    setPlainRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const removePlainRow = (idx: number) =>
    setPlainRows((prev) => prev.filter((_, i) => i !== idx))

  const addPlainRow = () =>
    setPlainRows((prev) => [...prev, { key: '', value: '' }])

  const updateSecretRow = (idx: number, patch: Partial<SecretRow>) =>
    setSecretRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const hasValidScope = scope === 'global' || Boolean(entry.projectPath)
  const canSubmit =
    name.trim().length > 0 &&
    command.trim().length > 0 &&
    (targetCopilot || targetClaude) &&
    hasValidScope &&
    !saving

  const touchedSecrets = useMemo(
    () => secretRows.filter((r) => r.replacing && r.value.trim().length > 0),
    [secretRows],
  )

  const handleSubmit = async () => {
    setError(null)

    if (!name.trim() || !command.trim()) {
      setError('Name and command are required.')
      return
    }
    if (!targetCopilot && !targetClaude) {
      setError('Pick at least one target (CoPilot or Claude Code).')
      return
    }

    const env: Record<string, string> = {}
    for (const row of plainRows) {
      const k = row.key.trim()
      if (!k) continue
      env[k] = row.value
    }

    const args = argsText.trim() ? argsText.trim().split(/\s+/) : []

    const partial: Partial<McpRegistryEntry> = {
      name: name.trim(),
      command: command.trim(),
      args,
      env,
      targets: { copilot: targetCopilot, claude: targetClaude },
      scope,
    }

    const secrets: Record<string, string> = {}
    for (const row of touchedSecrets) {
      secrets[row.key] = row.value
    }

    setSaving(true)
    try {
      const result = (await window.electronAPI.invoke('mcp:registry-update', {
        id: entry.id,
        partial,
        secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
      })) as McpRegistryUpdateResponse

      if (!result.success) {
        setError(result.error ?? 'Failed to save.')
        onError?.(result.error ?? 'Failed to save.')
        return
      }

      if (result.warning) onWarning?.(result.warning)
      onSaved()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      onError?.(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mcp-editor-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 sticky top-0 bg-white z-10">
          <div>
            <h2 id="mcp-editor-title" className="text-lg font-semibold text-gray-900">
              Edit {entry.name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Changes apply to both CoPilot and Claude Code next session.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-sm"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Display name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4FC4]"
            />
          </div>

          {/* Command + args */}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-700">Command & arguments</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4FC4] font-mono"
            />
            <input
              type="text"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4FC4] font-mono"
            />
          </div>

          {/* Secrets section */}
          {secretRows.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Secrets</label>
              <div className="space-y-2">
                {secretRows.map((row, idx) => (
                  <div key={row.key} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-gray-700">{row.key}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        secret
                      </span>
                    </div>
                    {!row.replacing ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 italic">(••• unchanged)</span>
                        <button
                          type="button"
                          onClick={() => updateSecretRow(idx, { replacing: true })}
                          className="text-xs text-[#5B4FC4] hover:underline"
                        >
                          Replace secret
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type={row.revealed ? 'text' : 'password'}
                          value={row.value}
                          onChange={(e) => updateSecretRow(idx, { value: e.target.value })}
                          placeholder="Enter new value"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4FC4]"
                        />
                        <button
                          type="button"
                          onClick={() => updateSecretRow(idx, { revealed: !row.revealed })}
                          className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
                        >
                          {row.revealed ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSecretRow(idx, { replacing: false, value: '', revealed: false })
                          }
                          className="text-xs text-gray-400 hover:text-gray-600 px-1"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plain env vars */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Environment variables</label>
            {plainRows.length === 0 && (
              <p className="text-xs text-gray-400 mb-2">None.</p>
            )}
            <div className="space-y-2">
              {plainRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) => updatePlainRow(idx, { key: e.target.value })}
                    placeholder="KEY"
                    className="w-1/3 border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#5B4FC4]"
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => updatePlainRow(idx, { value: e.target.value })}
                    placeholder="value"
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4FC4]"
                  />
                  <button
                    type="button"
                    onClick={() => removePlainRow(idx)}
                    className="text-xs text-gray-400 hover:text-red-500 px-1.5 py-1"
                    aria-label={`Remove ${row.key || 'row'}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addPlainRow}
              className="mt-2 text-xs text-[#5B4FC4] hover:underline"
            >
              + Add variable
            </button>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Where should this apply?</label>
            <div className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="edit-scope"
                  value="global"
                  checked={scope === 'global'}
                  onChange={() => setScope('global')}
                  className="mt-1 accent-[#5B4FC4]"
                />
                <div>
                  <div className="font-medium">Global (all projects)</div>
                </div>
              </label>
              <label
                className={`flex items-start gap-2 text-sm cursor-pointer ${
                  !entry.projectPath ? 'opacity-50 cursor-not-allowed' : 'text-gray-700'
                }`}
                title={!entry.projectPath ? 'This entry has no project path bound — scope is locked to global.' : ''}
              >
                <input
                  type="radio"
                  name="edit-scope"
                  value="project"
                  checked={scope === 'project'}
                  onChange={() => setScope('project')}
                  disabled={!entry.projectPath}
                  className="mt-1 accent-[#5B4FC4]"
                />
                <div>
                  <div className="font-medium">This project only</div>
                  <div className="text-xs text-gray-500">{entry.projectPath ?? 'No project path bound.'}</div>
                </div>
              </label>
            </div>
          </div>

          {/* Targets */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Available in</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={targetCopilot}
                  onChange={(e) => setTargetCopilot(e.target.checked)}
                  className="accent-[#5B4FC4]"
                />
                CoPilot CLI
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={targetClaude}
                  onChange={(e) => setTargetClaude(e.target.checked)}
                  className="accent-[#5B4FC4]"
                />
                Claude Code CLI
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="px-4 py-2 bg-[#5B4FC4] text-white text-sm font-medium rounded-lg hover:bg-[#4a41a8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
