import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePricing, type EffectivePricingTable } from '../../contexts/PricingContext'
import type { ModelProvider } from '../../../../shared/pricing/defaults'

interface PricingSettingsState {
  remoteSyncEnabled: boolean
  remoteUrl: string
  lastSyncAt: number | null
  lastSyncError: string | null
}

const PROVIDER_LABEL: Record<ModelProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai:    'OpenAI',
  google:    'Google',
}

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  default:  { label: 'Default',           color: 'bg-gray-100 text-gray-600 border-gray-200' },
  override: { label: 'Override',          color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  included: { label: 'Included in plan',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  remote:   { label: 'Remote synced',     color: 'bg-violet-50 text-violet-700 border-violet-200' },
  fallback: { label: 'Fallback',          color: 'bg-amber-50 text-amber-700 border-amber-200' },
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleString()
}

/**
 * Cost & Pricing settings panel. Lists every model the app knows about, with
 * its effective rate, where that rate came from, and inline controls to
 * override or mark the model as "included in plan."
 *
 * Data flow: `usePricing()` provides the live merged table (defaults +
 * optional remote sync + user overrides). Mutations call IPC handlers which
 * persist to the `clear-path-pricing.json` electron-store and emit
 * `pricing:changed` so this panel — and CLIManager — re-fetch automatically.
 */
export default function PricingSettings(): JSX.Element {
  const { table, loaded, refresh } = usePricing()
  const [settings, setSettings] = useState<PricingSettingsState>({
    remoteSyncEnabled: false,
    remoteUrl: '',
    lastSyncAt: null,
    lastSyncError: null,
  })
  const [draftRemoteUrl, setDraftRemoteUrl] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // Load settings on mount and whenever pricing changes upstream (e.g., a
  // successful sync persists `lastSyncAt` so we want to display it).
  const loadSettings = useCallback(async (): Promise<void> => {
    try {
      const raw = await window.electronAPI.invoke('pricing:get-settings') as PricingSettingsState
      if (raw && typeof raw === 'object') {
        setSettings(raw)
        setDraftRemoteUrl(raw.remoteUrl ?? '')
      }
    } catch { /* keep prior — best effort */ }
  }, [])

  useEffect(() => { void loadSettings() }, [loadSettings])

  useEffect(() => {
    const off = window.electronAPI.on?.('pricing:changed', () => { void loadSettings() })
    return () => { if (typeof off === 'function') off() }
  }, [loadSettings])

  // Group models by provider for rendering. Alias entries are kept inline
  // under their target so users see `sonnet → claude-sonnet-4.5` together.
  const grouped = useMemo(() => groupByProvider(table), [table])

  const handleSetOverride = async (
    model: string,
    patch: { input?: number; output?: number; includedInPlan?: boolean },
  ): Promise<void> => {
    try {
      await window.electronAPI.invoke('pricing:set-override', { model, override: patch })
      refresh()
    } catch { /* push event will refresh on success — silent on failure */ }
  }

  const handleClearOverride = async (model: string): Promise<void> => {
    try {
      await window.electronAPI.invoke('pricing:clear-override', { model })
      refresh()
    } catch { /* see above */ }
  }

  const handleSaveSyncSettings = async (next: Partial<PricingSettingsState>): Promise<void> => {
    try {
      await window.electronAPI.invoke('pricing:set-settings', { settings: next })
      await loadSettings()
    } catch { /* see above */ }
  }

  const handleSyncNow = async (): Promise<void> => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const result = await window.electronAPI.invoke('pricing:sync-now') as
        | { ok: true; syncedAt: number }
        | { ok: false; error: string }
      if (result.ok) setSyncMessage('Sync complete.')
      else setSyncMessage(`Sync failed: ${result.error}`)
    } catch (err) {
      setSyncMessage(`Sync failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSyncing(false)
      await loadSettings()
    }
  }

  return (
    <div className="space-y-6" data-testid="pricing-settings">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cost &amp; Pricing</h1>
        <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">
          ClearPath estimates the cost of every turn using the rates below. Defaults are public
          retail API pricing. Override any row to match your enterprise plan, or mark a model as
          &quot;Included in plan&quot; if its cost is bundled into a flat subscription (the row will be
          tracked at $0). Changes apply to all future cost records.
        </p>
        {!loaded && (
          <p className="text-xs text-gray-400 mt-2">Loading effective pricing…</p>
        )}
      </div>

      {/* Per-model table, grouped by provider. */}
      {(['anthropic', 'openai', 'google'] as ModelProvider[]).map((provider) => {
        const rows = grouped[provider]
        if (!rows || rows.length === 0) return null
        return (
          <section
            key={provider}
            className="bg-white border border-gray-200 rounded-xl p-5"
            aria-labelledby={`pricing-${provider}-heading`}
          >
            <h2 id={`pricing-${provider}-heading`} className="text-sm font-semibold text-gray-900 mb-3">
              {PROVIDER_LABEL[provider]}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid={`pricing-table-${provider}`}>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-3 font-medium">Model</th>
                    <th className="py-2 px-3 font-medium text-right">Input $/M</th>
                    <th className="py-2 px-3 font-medium text-right">Output $/M</th>
                    <th className="py-2 px-3 font-medium">Source</th>
                    <th className="py-2 px-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <PricingRow
                      key={row.id}
                      row={row}
                      onOverride={(patch) => handleSetOverride(row.id, patch)}
                      onClear={() => handleClearOverride(row.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      {/* Remote sync settings. Opt-in. */}
      <section
        className="bg-white border border-gray-200 rounded-xl p-5 space-y-3"
        aria-labelledby="pricing-sync-heading"
      >
        <div>
          <h2 id="pricing-sync-heading" className="text-sm font-semibold text-gray-900">
            Remote price sync
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            Optionally fetch pricing from a hosted JSON file (e.g., a shared internal source).
            Disabled by default. User overrides always win over the remote layer; failed syncs do
            not clobber the previously cached values.
          </p>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <label htmlFor="pricing-sync-toggle" className="text-sm font-medium text-gray-900 cursor-pointer">
              Enable remote sync
            </label>
            <p className="text-xs text-gray-500 mt-0.5">
              When on, the app fetches the URL below on demand. https:// only.
            </p>
          </div>
          <button
            id="pricing-sync-toggle"
            role="switch"
            aria-checked={settings.remoteSyncEnabled}
            data-testid="pricing-sync-toggle"
            onClick={() =>
              void handleSaveSyncSettings({
                remoteSyncEnabled: !settings.remoteSyncEnabled,
                remoteUrl: draftRemoteUrl,
              })
            }
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
              settings.remoteSyncEnabled ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              settings.remoteSyncEnabled ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="url"
            value={draftRemoteUrl}
            onChange={(e) => setDraftRemoteUrl(e.target.value)}
            placeholder="https://example.com/pricing.json"
            data-testid="pricing-sync-url"
            disabled={!settings.remoteSyncEnabled}
            className="flex-1 bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() =>
              void handleSaveSyncSettings({
                remoteSyncEnabled: settings.remoteSyncEnabled,
                remoteUrl: draftRemoteUrl,
              })
            }
            disabled={!settings.remoteSyncEnabled || draftRemoteUrl === settings.remoteUrl}
            className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Save URL
          </button>
          <button
            type="button"
            data-testid="pricing-sync-now"
            onClick={() => void handleSyncNow()}
            disabled={!settings.remoteSyncEnabled || syncing}
            className="px-3 py-1.5 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <p>Last sync: <span className="text-gray-700">{formatTimestamp(settings.lastSyncAt)}</span></p>
          {settings.lastSyncError && (
            <p className="text-amber-700" role="status">
              Last error: {settings.lastSyncError}
            </p>
          )}
          {syncMessage && (
            <p
              className={syncMessage.startsWith('Sync complete') ? 'text-emerald-700' : 'text-amber-700'}
              role="status"
            >
              {syncMessage}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

// ── Per-row component ─────────────────────────────────────────────────────────

interface PricingRowProps {
  row: PricingRowData
  onOverride: (patch: { input?: number; output?: number; includedInPlan?: boolean }) => void
  onClear: () => void
}

function PricingRow({ row, onOverride, onClear }: PricingRowProps): JSX.Element {
  const [inputDraft, setInputDraft] = useState(String(row.input))
  const [outputDraft, setOutputDraft] = useState(String(row.output))
  const [editing, setEditing] = useState(false)

  // Re-sync drafts from props whenever the upstream effective rate changes
  // (sync completed, another override applied, included toggled). Only when
  // NOT actively editing — we don't want to clobber the user's typed value.
  useEffect(() => {
    if (editing) return
    setInputDraft(String(row.input))
    setOutputDraft(String(row.output))
  }, [row.input, row.output, editing])

  const sourceMeta = SOURCE_LABEL[row.source] ?? SOURCE_LABEL.default
  const isIncluded = row.source === 'included'
  const isOverridden = row.source === 'override' || row.source === 'included'

  const commit = (): void => {
    setEditing(false)
    const inputNum = parseFloat(inputDraft)
    const outputNum = parseFloat(outputDraft)
    const inputChanged = Number.isFinite(inputNum) && inputNum >= 0 && inputNum !== row.input
    const outputChanged = Number.isFinite(outputNum) && outputNum >= 0 && outputNum !== row.output
    if (!inputChanged && !outputChanged) return
    onOverride({
      input:  Number.isFinite(inputNum)  && inputNum  >= 0 ? inputNum  : undefined,
      output: Number.isFinite(outputNum) && outputNum >= 0 ? outputNum : undefined,
    })
  }

  return (
    <tr
      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
      data-testid={`pricing-row-${row.id}`}
    >
      <td className="py-2 pr-3">
        <div className="text-sm font-medium text-gray-900">{row.id}</div>
        {row.aliasOf && (
          <div className="text-[11px] text-gray-400">alias → {row.aliasOf}</div>
        )}
      </td>
      <td className="py-2 px-3 text-right">
        <input
          type="number"
          min={0}
          step={0.01}
          value={inputDraft}
          onChange={(e) => { setEditing(true); setInputDraft(e.target.value) }}
          onBlur={commit}
          disabled={isIncluded}
          aria-label={`Input price per million tokens for ${row.id}`}
          className="w-20 text-right bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </td>
      <td className="py-2 px-3 text-right">
        <input
          type="number"
          min={0}
          step={0.01}
          value={outputDraft}
          onChange={(e) => { setEditing(true); setOutputDraft(e.target.value) }}
          onBlur={commit}
          disabled={isIncluded}
          aria-label={`Output price per million tokens for ${row.id}`}
          className="w-20 text-right bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </td>
      <td className="py-2 px-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${sourceMeta.color}`}
          data-testid={`pricing-row-${row.id}-source`}
        >
          {sourceMeta.label}
        </span>
      </td>
      <td className="py-2 px-3 text-right">
        <div className="inline-flex items-center gap-2">
          <label className="inline-flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isIncluded}
              onChange={(e) => {
                if (e.target.checked) onOverride({ includedInPlan: true })
                else onClear()
              }}
              aria-label={`Included in plan for ${row.id}`}
              data-testid={`pricing-row-${row.id}-included`}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Included</span>
          </label>
          <button
            type="button"
            onClick={onClear}
            disabled={!isOverridden}
            aria-label={`Reset ${row.id} to default`}
            data-testid={`pricing-row-${row.id}-reset`}
            className="text-xs text-indigo-600 hover:text-indigo-800 disabled:text-gray-300 disabled:hover:text-gray-300"
          >
            Reset
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface PricingRowData {
  id: string
  input: number
  output: number
  source: string
  aliasOf?: string
  provider: ModelProvider
}

function groupByProvider(
  table: EffectivePricingTable,
): Record<ModelProvider, PricingRowData[]> {
  const groups: Record<ModelProvider, PricingRowData[]> = {
    anthropic: [],
    openai:    [],
    google:    [],
  }
  for (const [id, entry] of Object.entries(table.models)) {
    const provider = entry.provider as ModelProvider
    if (!groups[provider]) continue
    groups[provider].push({
      id,
      input: entry.input,
      output: entry.output,
      source: entry.source,
      aliasOf: entry.aliasOf,
      provider,
    })
  }
  // Sort canonical entries first, aliases after, alphabetically within each.
  for (const provider of Object.keys(groups) as ModelProvider[]) {
    groups[provider].sort((a, b) => {
      if (!!a.aliasOf !== !!b.aliasOf) return a.aliasOf ? 1 : -1
      return a.id.localeCompare(b.id)
    })
  }
  return groups
}
