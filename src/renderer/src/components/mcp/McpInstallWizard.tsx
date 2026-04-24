import { useEffect, useMemo, useState } from 'react'
import type {
  McpCatalogEntry,
  McpCatalogEnvVarSchema,
  McpRegistryAddResponse,
  McpRegistryEntryInput,
  McpRegistryTargets,
} from '../../types/mcp'

interface Props {
  catalogEntry?: McpCatalogEntry
  onClose: () => void
  onSaved: (displayName: string, targets: McpRegistryTargets) => void
  onWarning?: (message: string) => void
  onError?: (message: string) => void
}

interface EnvRow {
  key: string
  value: string
  // For catalog-driven rows, this mirrors the schema entry.
  schema?: McpCatalogEnvVarSchema
  // Whether a secret input is currently revealed.
  revealed?: boolean
}

export default function McpInstallWizard({
  catalogEntry,
  onClose,
  onSaved,
  onWarning,
  onError,
}: Props): JSX.Element {
  const isCustom = !catalogEntry

  // ── Form state ──────────────────────────────────────────────────────────
  const [name, setName] = useState(catalogEntry?.displayName ?? '')
  const [command, setCommand] = useState(catalogEntry?.command ?? '')
  const [argsText, setArgsText] = useState((catalogEntry?.args ?? []).join(' '))
  const [advancedUnlocked, setAdvancedUnlocked] = useState(isCustom)
  const [scope, setScope] = useState<'global' | 'project'>('global')
  const [targetCopilot, setTargetCopilot] = useState(true)
  const [targetClaude, setTargetClaude] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warningBanner, setWarningBanner] = useState<string | null>(null)

  const [envRows, setEnvRows] = useState<EnvRow[]>(
    (catalogEntry?.envSchema ?? []).map((s) => ({
      key: s.name,
      value: '',
      schema: s,
      revealed: false,
    })),
  )

  const [projectPath, setProjectPath] = useState<string | undefined>(undefined)

  useEffect(() => {
    // Try to learn the active workspace path to decide if "project" scope is viable.
    ;(async () => {
      try {
        const id = (await window.electronAPI.invoke('workspace:get-active')) as string | null
        if (!id) return
        const list = (await window.electronAPI.invoke('workspace:list')) as Array<{ id: string; rootPath?: string }>
        const ws = list.find((w) => w.id === id)
        if (ws?.rootPath) setProjectPath(ws.rootPath)
      } catch {
        // Non-fatal; scope just stays restricted to global.
      }
    })()
  }, [])

  const projectScopeDisabled = !projectPath

  // ── Mutators ────────────────────────────────────────────────────────────

  const updateRow = (idx: number, patch: Partial<EnvRow>) =>
    setEnvRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const addCustomEnvRow = () =>
    setEnvRows((prev) => [...prev, { key: '', value: '' }])

  const removeRow = (idx: number) =>
    setEnvRows((prev) => prev.filter((_, i) => i !== idx))

  // ── Validation ──────────────────────────────────────────────────────────

  const missingRequired = useMemo(() => {
    return envRows.filter(
      (r) => r.schema?.required && !r.value.trim(),
    )
  }, [envRows])

  const canSubmit =
    name.trim().length > 0 &&
    command.trim().length > 0 &&
    (targetCopilot || targetClaude) &&
    missingRequired.length === 0 &&
    !saving

  // ── Submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setError(null)
    setWarningBanner(null)

    if (!name.trim() || !command.trim()) {
      setError('Name and command are required.')
      return
    }
    if (!targetCopilot && !targetClaude) {
      setError('Pick at least one target (CoPilot or Claude Code).')
      return
    }
    if (missingRequired.length > 0) {
      setError(
        `Missing required value for: ${missingRequired.map((r) => r.key).join(', ')}`,
      )
      return
    }

    // Split env rows into plain env + secrets map.
    const env: Record<string, string> = {}
    const secrets: Record<string, string> = {}
    for (const row of envRows) {
      const key = row.key.trim()
      if (!key) continue
      if (row.schema?.secret) {
        if (row.value.trim()) secrets[key] = row.value
      } else {
        env[key] = row.value
      }
    }

    const args = argsText.trim() ? argsText.trim().split(/\s+/) : []

    const entry: McpRegistryEntryInput = {
      name: name.trim(),
      description: catalogEntry?.description,
      command: command.trim(),
      args,
      env,
      secretRefs: {},
      scope: projectScopeDisabled ? 'global' : scope,
      projectPath: scope === 'project' ? projectPath : undefined,
      targets: { copilot: targetCopilot, claude: targetClaude },
      enabled: true,
      source: isCustom ? 'custom' : 'catalog',
      catalogId: catalogEntry?.id,
    }

    setSaving(true)
    try {
      const result = (await window.electronAPI.invoke('mcp:registry-add', {
        entry,
        secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
      })) as McpRegistryAddResponse

      if (!result.success) {
        setError(result.error ?? 'Failed to add connection.')
        onError?.(result.error ?? 'Failed to add connection.')
        return
      }

      if (result.warning) {
        setWarningBanner(result.warning)
        onWarning?.(result.warning)
      }

      onSaved(name.trim(), entry.targets)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      onError?.(msg)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const argsReadonly = Boolean(catalogEntry) && !advancedUnlocked

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mcp-install-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 sticky top-0 bg-white z-10">
          <div>
            <h2 id="mcp-install-title" className="text-lg font-semibold text-gray-900">
              {catalogEntry ? `Install ${catalogEntry.displayName}` : 'Add custom connection'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {catalogEntry?.description ?? 'Point ClearPath at any MCP server by giving it a name, command, and args.'}
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

          {warningBanner && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">{warningBanner}</p>
            </div>
          )}

          {/* Display name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Display name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GitHub"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4FC4]"
            />
          </div>

          {/* Command + args (readonly if catalog, unlockable) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-700">
                Command & arguments
              </label>
              {catalogEntry && (
                <button
                  type="button"
                  onClick={() => setAdvancedUnlocked((v) => !v)}
                  className="text-[11px] text-[#5B4FC4] hover:underline"
                >
                  {advancedUnlocked ? 'Lock advanced' : 'Edit advanced'}
                </button>
              )}
            </div>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. npx"
              readOnly={argsReadonly}
              className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4FC4] font-mono ${
                argsReadonly ? 'bg-gray-50 text-gray-500' : ''
              }`}
            />
            <input
              type="text"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder="e.g. -y @modelcontextprotocol/server-filesystem /tmp"
              readOnly={argsReadonly}
              className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4FC4] font-mono ${
                argsReadonly ? 'bg-gray-50 text-gray-500' : ''
              }`}
            />
          </div>

          {/* Env vars */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Environment variables
            </label>
            {envRows.length === 0 && isCustom && (
              <p className="text-xs text-gray-400 mb-2">None yet. Add any keys the server needs.</p>
            )}
            <div className="space-y-2">
              {envRows.map((row, idx) => {
                const isSecret = Boolean(row.schema?.secret)
                const required = Boolean(row.schema?.required)
                return (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-1">
                          {row.schema ? (
                            <span className="text-xs font-mono text-gray-700">
                              {row.key}
                              {required && <span className="text-red-500 ml-0.5">*</span>}
                            </span>
                          ) : (
                            <input
                              type="text"
                              value={row.key}
                              onChange={(e) => updateRow(idx, { key: e.target.value })}
                              placeholder="KEY"
                              className="text-xs font-mono border border-gray-300 rounded px-2 py-1 flex-1"
                            />
                          )}
                          {isSecret && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              secret
                            </span>
                          )}
                        </div>
                        {row.schema?.description && (
                          <p className="text-[11px] text-gray-500 mb-1.5">{row.schema.description}</p>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type={isSecret && !row.revealed ? 'password' : 'text'}
                            value={row.value}
                            onChange={(e) => updateRow(idx, { value: e.target.value })}
                            placeholder={row.schema?.placeholder ?? 'value'}
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B4FC4]"
                          />
                          {isSecret && (
                            <button
                              type="button"
                              onClick={() => updateRow(idx, { revealed: !row.revealed })}
                              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
                            >
                              {row.revealed ? 'Hide' : 'Show'}
                            </button>
                          )}
                        </div>
                      </div>
                      {!row.schema && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-xs text-gray-400 hover:text-red-500 px-1.5 py-1"
                          aria-label={`Remove ${row.key || 'row'}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {isCustom && (
              <button
                type="button"
                onClick={addCustomEnvRow}
                className="mt-2 text-xs text-[#5B4FC4] hover:underline"
              >
                + Add variable
              </button>
            )}
          </div>

          {/* Scope */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Where should this apply?</label>
            <div className="space-y-1.5">
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  value="global"
                  checked={scope === 'global'}
                  onChange={() => setScope('global')}
                  className="mt-1 accent-[#5B4FC4]"
                />
                <div>
                  <div className="font-medium">Global (all projects)</div>
                  <div className="text-xs text-gray-500">
                    Available everywhere you run CoPilot or Claude Code on this machine.
                  </div>
                </div>
              </label>
              <label
                className={`flex items-start gap-2 text-sm cursor-pointer ${
                  projectScopeDisabled ? 'opacity-50 cursor-not-allowed' : 'text-gray-700'
                }`}
                title={projectScopeDisabled ? 'No workspace is selected — pick one in the sidebar to use project scope.' : ''}
              >
                <input
                  type="radio"
                  name="scope"
                  value="project"
                  checked={scope === 'project'}
                  onChange={() => setScope('project')}
                  disabled={projectScopeDisabled}
                  className="mt-1 accent-[#5B4FC4]"
                />
                <div>
                  <div className="font-medium">This project only</div>
                  <div className="text-xs text-gray-500">
                    {projectPath ?? 'No workspace is currently active.'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Targets */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Available in <span className="text-red-500">*</span>
            </label>
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
            {saving ? 'Saving...' : catalogEntry ? 'Install' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
