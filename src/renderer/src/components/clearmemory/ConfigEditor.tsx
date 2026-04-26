import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ClearMemoryConfig, ClearMemoryTier } from '../../../../shared/clearmemory/types'
import { configGet, configSet } from '../../lib/clearmemoryClient'
import { toast } from '../../lib/toast'

// ── ConfigEditor ─────────────────────────────────────────────────────────────
// Reads ~/.clearmemory/config.toml via `clearmemory:config-get`, lets the
// user edit the narrow set of fields the UI exposes, and writes them back
// via `clearmemory:config-set` (which triggers a daemon restart).

interface TierOption {
  value: ClearMemoryTier
  label: string
  cost: string
  description: string
}

const TIER_OPTIONS: ReadonlyArray<TierOption> = [
  {
    value: 'offline',
    label: 'Offline',
    cost: '~200 MB RAM, ~500 MB disk',
    description: 'Embedding-only retrieval. No LLM. Zero network.',
  },
  {
    value: 'local_llm',
    label: 'Local LLM',
    cost: '~4 GB RAM, ~5 GB disk',
    description: 'Adds a local LLM for reflection + synthesis. Stays on-device.',
  },
  {
    value: 'cloud',
    label: 'Cloud',
    cost: 'API-key costs',
    description: 'Uses a hosted model for the smartest synthesis. Requires auth.',
  },
]

interface NumberField {
  key: keyof ClearMemoryConfig
  label: string
  min: number
  max: number
  step?: number
  hint?: string
}

const RETRIEVAL_FIELDS: ReadonlyArray<NumberField> = [
  { key: 'topK', label: 'top_k', min: 1, max: 50, hint: 'How many memories to return per recall.' },
  { key: 'tokenBudget', label: 'token_budget', min: 512, max: 16384, step: 128, hint: 'Max tokens injected per prompt.' },
]

const RETENTION_FIELDS: ReadonlyArray<NumberField> = [
  { key: 'retentionTimeThresholdDays', label: 'time_threshold_days', min: 1, max: 3650, hint: 'Memories older than this may be decayed.' },
  { key: 'retentionSizeThresholdGb', label: 'size_threshold_gb', min: 1, max: 1000, hint: 'Target cap on on-disk store size.' },
  { key: 'retentionPerformanceThresholdMs', label: 'performance_threshold_ms', min: 50, max: 5000, hint: 'Trigger decay when recall p95 slips above this.' },
]

function sameConfig(a: ClearMemoryConfig, b: ClearMemoryConfig): boolean {
  const keys: Array<keyof ClearMemoryConfig> = [
    'tier', 'topK', 'tokenBudget',
    'retentionTimeThresholdDays', 'retentionSizeThresholdGb', 'retentionPerformanceThresholdMs',
    'encryptionEnabled',
  ]
  for (const k of keys) {
    if ((a[k] ?? null) !== (b[k] ?? null)) return false
  }
  return true
}

export default function ConfigEditor(): JSX.Element {
  const [saved, setSaved] = useState<ClearMemoryConfig | null>(null)
  const [draft, setDraft] = useState<ClearMemoryConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    const r = await configGet()
    if (!r.ok) {
      setLoadError(r.error)
      return
    }
    setSaved(r.data)
    setDraft(r.data)
  }, [])

  useEffect(() => { void load() }, [load])

  const dirty = useMemo(() => {
    if (!saved || !draft) return false
    return !sameConfig(saved, draft)
  }, [saved, draft])

  const encryptionFlipped = useMemo(() => {
    if (!saved || !draft) return false
    return saved.encryptionEnabled !== draft.encryptionEnabled
  }, [saved, draft])

  const handleTier = useCallback((tier: ClearMemoryTier) => {
    setDraft((d) => (d ? { ...d, tier } : d))
  }, [])

  const handleNumber = useCallback((key: keyof ClearMemoryConfig, value: string) => {
    setDraft((d) => {
      if (!d) return d
      if (value === '') return { ...d, [key]: undefined } as ClearMemoryConfig
      const n = Number(value)
      if (!Number.isFinite(n)) return d
      return { ...d, [key]: n } as ClearMemoryConfig
    })
  }, [])

  const handleEncryption = useCallback((next: boolean) => {
    setDraft((d) => (d ? { ...d, encryptionEnabled: next } : d))
  }, [])

  const handleReset = useCallback(() => {
    if (!saved) return
    setDraft(saved)
  }, [saved])

  const handleSave = useCallback(async () => {
    if (!draft || !saved) return
    // Compute a minimal patch — only fields that differ from saved.
    const patch: Partial<ClearMemoryConfig> = {}
    if (draft.tier !== saved.tier) patch.tier = draft.tier
    if (draft.topK !== saved.topK) patch.topK = draft.topK
    if (draft.tokenBudget !== saved.tokenBudget) patch.tokenBudget = draft.tokenBudget
    if (draft.retentionTimeThresholdDays !== saved.retentionTimeThresholdDays) {
      patch.retentionTimeThresholdDays = draft.retentionTimeThresholdDays
    }
    if (draft.retentionSizeThresholdGb !== saved.retentionSizeThresholdGb) {
      patch.retentionSizeThresholdGb = draft.retentionSizeThresholdGb
    }
    if (draft.retentionPerformanceThresholdMs !== saved.retentionPerformanceThresholdMs) {
      patch.retentionPerformanceThresholdMs = draft.retentionPerformanceThresholdMs
    }
    if (draft.encryptionEnabled !== saved.encryptionEnabled) {
      patch.encryptionEnabled = draft.encryptionEnabled
    }
    if (Object.keys(patch).length === 0) return

    setSaving(true)
    toast.info('Config saved. Restarting daemon…')
    try {
      const r = await configSet(patch)
      if (!r.ok) {
        toast.error(r.error || 'Failed to save config')
        return
      }
      setSaved(r.data)
      setDraft(r.data)
      toast.success('Config saved. Daemon restarted.')
    } finally {
      setSaving(false)
    }
  }, [draft, saved])

  if (loadError) {
    return (
      <div className="bg-red-900/30 border border-red-700/60 rounded-xl p-4 text-sm text-red-200">
        Failed to load config: {loadError}
        <div className="mt-2">
          <button
            onClick={() => { void load() }}
            className="text-xs px-3 py-1.5 rounded-md bg-red-800/50 hover:bg-red-800 border border-red-700 text-red-100"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!draft || !saved) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-gray-800 rounded animate-pulse" />
        <div className="h-32 bg-gray-900 border border-gray-700 rounded-xl animate-pulse" />
        <div className="h-24 bg-gray-900 border border-gray-700 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Configure how Clear Memory stores and retrieves. Changes are written to
        <code className="mx-1 text-gray-300">~/.clearmemory/config.toml</code>
        and the daemon restarts automatically.
      </p>

      {/* ── Tier ───────────────────────────────────────────────────────────── */}
      <section className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Tier</h3>
          <span className="text-xs text-gray-500">general.tier</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIER_OPTIONS.map((t) => {
            const selected = draft.tier === t.value
            return (
              <label
                key={t.value}
                className={`cursor-pointer rounded-lg p-3 border transition-colors ${
                  selected
                    ? 'bg-indigo-600/15 border-indigo-500'
                    : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                }`}
              >
                <input
                  type="radio"
                  name="cm-cfg-tier"
                  value={t.value}
                  checked={selected}
                  onChange={() => handleTier(t.value)}
                  className="sr-only"
                />
                <div className={`text-sm font-medium ${selected ? 'text-indigo-200' : 'text-gray-200'}`}>
                  {t.label}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">{t.cost}</div>
                <div className="text-xs text-gray-400 mt-2">{t.description}</div>
              </label>
            )
          })}
        </div>
      </section>

      {/* ── Retrieval ──────────────────────────────────────────────────────── */}
      <section className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Retrieval</h3>
          <span className="text-xs text-gray-500">[retrieval]</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {RETRIEVAL_FIELDS.map((field) => (
            <NumberInput
              key={field.key}
              field={field}
              value={draft[field.key] as number | undefined}
              onChange={(v) => handleNumber(field.key, v)}
            />
          ))}
        </div>
      </section>

      {/* ── Retention ──────────────────────────────────────────────────────── */}
      <section className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Retention</h3>
          <span className="text-xs text-gray-500">[retention]</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {RETENTION_FIELDS.map((field) => (
            <NumberInput
              key={field.key}
              field={field}
              value={draft[field.key] as number | undefined}
              onChange={(v) => handleNumber(field.key, v)}
            />
          ))}
        </div>
      </section>

      {/* ── Encryption ─────────────────────────────────────────────────────── */}
      <section className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Encryption</h3>
          <span className="text-xs text-gray-500">[encryption]</span>
        </div>
        <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-4 py-3">
          <div>
            <div className="text-sm text-gray-200">Encryption at rest</div>
            <div className="text-[11px] text-gray-500">Encrypts stored memories on disk.</div>
          </div>
          <button
            onClick={() => handleEncryption(!draft.encryptionEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              draft.encryptionEnabled ? 'bg-indigo-600' : 'bg-gray-600'
            }`}
            role="switch"
            aria-checked={draft.encryptionEnabled}
            aria-label="Toggle encryption at rest"
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                draft.encryptionEnabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {encryptionFlipped && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Flipping encryption post-init requires
            <code className="mx-1 bg-black/40 px-1 rounded">clearmemory auth rotate-key</code>
            to re-encrypt existing data. Run that from a terminal after saving, or your memories
            may become unreadable.
          </div>
        )}
      </section>

      {/* ── Save/Reset ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { void handleSave() }}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handleReset}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 text-sm"
        >
          Reset to saved
        </button>
      </div>
    </div>
  )
}

function NumberInput({
  field,
  value,
  onChange,
}: {
  field: NumberField
  value: number | undefined
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        {field.label}
      </label>
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {field.hint && <div className="text-[11px] text-gray-500 mt-1">{field.hint}</div>}
      <div className="text-[11px] text-gray-600 mt-0.5">Range: {field.min}–{field.max}</div>
    </div>
  )
}
