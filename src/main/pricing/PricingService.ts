import { EventEmitter } from 'events'
import { request } from 'https'
import type { IncomingMessage } from 'http'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { DEFAULT_PRICING_TABLE, type PricingTable, type ModelPriceEntry } from '../../shared/pricing/defaults'

/**
 * A user override for a single model. `includedInPlan` overrides input/output
 * and zeroes them out — for users whose Copilot plan or enterprise contract
 * comps the model and the retail price wouldn't reflect their actual spend.
 */
export interface PricingOverride {
  input?: number
  output?: number
  includedInPlan?: boolean
}

export interface PricingSettings {
  remoteSyncEnabled: boolean
  remoteUrl: string
  lastSyncAt: number | null
  lastSyncError: string | null
}

interface PricingStoreSchema {
  overrides: Record<string, PricingOverride>
  remote: PricingTable | null
  settings: PricingSettings
}

const DEFAULT_SETTINGS: PricingSettings = {
  remoteSyncEnabled: false,
  remoteUrl: '',
  lastSyncAt: null,
  lastSyncError: null,
}

export type PricingSource = 'default' | 'remote' | 'override' | 'included' | 'fallback'

export interface EffectivePriceEntry extends ModelPriceEntry {
  source: PricingSource
}

export interface EffectivePricingTable {
  lastUpdated: string
  source: string
  models: Record<string, EffectivePriceEntry>
}

const REMOTE_SYNC_TIMEOUT_MS = 5_000
const REMOTE_SYNC_MAX_BYTES = 256 * 1024  // 256 KB cap on remote payload size

/**
 * PricingService is the single owner of "what does a token cost." It layers:
 *
 *   defaults  →  remote (if sync enabled)  →  user overrides
 *
 * …and exposes a flattened "effective table" that CLIManager uses to record
 * costs and that the renderer's PricingContext displays.
 *
 * Mutations emit `changed`; main/index.ts wires that to a webContents.send
 * so the renderer's PricingContext can refresh without polling.
 */
export class PricingService extends EventEmitter {
  private _store: Store<PricingStoreSchema> | null = null

  private get store(): Store<PricingStoreSchema> {
    if (!this._store) {
      this._store = new Store<PricingStoreSchema>({
        name: 'clear-path-pricing',
        encryptionKey: getStoreEncryptionKey(),
        defaults: {
          overrides: {},
          remote: null,
          settings: { ...DEFAULT_SETTINGS },
        },
      })
    }
    return this._store
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Defaults shipped with the app — never mutated. */
  getDefaults(): PricingTable {
    return DEFAULT_PRICING_TABLE
  }

  /** User overrides as stored. Empty record if none. */
  getOverrides(): Record<string, PricingOverride> {
    return { ...this.store.get('overrides', {}) }
  }

  /** Cached remote table (null if remote sync has never succeeded). */
  getRemote(): PricingTable | null {
    return this.store.get('remote', null)
  }

  /** Current sync settings + last-sync metadata. */
  getSettings(): PricingSettings {
    return { ...this.store.get('settings', { ...DEFAULT_SETTINGS }) }
  }

  /**
   * Merge defaults → remote → overrides and return the effective rates that
   * CLIManager and the renderer should use. Each entry carries a `source`
   * tag so the Cost Settings UI can show where each row's price came from.
   */
  getEffectiveTable(): EffectivePricingTable {
    const defaults = this.getDefaults()
    const remote = this.getRemote()
    const overrides = this.getOverrides()

    const ids = new Set<string>([
      ...Object.keys(defaults.models),
      ...(remote ? Object.keys(remote.models) : []),
      ...Object.keys(overrides),
    ])

    const models: Record<string, EffectivePriceEntry> = {}
    for (const id of ids) {
      const def = defaults.models[id]
      const rem = remote?.models[id]
      const ovr = overrides[id]

      // Start from defaults, then layer remote, then layer user override.
      let entry: ModelPriceEntry =
        def ?? rem ?? { input: 3, output: 15, provider: 'anthropic' }
      let source: PricingSource = def ? 'default' : rem ? 'remote' : 'fallback'

      if (rem) {
        entry = { ...entry, ...rem }
        if (!def) source = 'remote'
        else if (rem.input !== def.input || rem.output !== def.output) source = 'remote'
      }

      if (ovr) {
        if (ovr.includedInPlan) {
          entry = { ...entry, input: 0, output: 0 }
          source = 'included'
        } else {
          // Apply override values; leave provider + aliasOf untouched.
          entry = {
            ...entry,
            input:  typeof ovr.input  === 'number' ? ovr.input  : entry.input,
            output: typeof ovr.output === 'number' ? ovr.output : entry.output,
          }
          source = 'override'
        }
      }

      models[id] = { ...entry, source }
    }

    return {
      lastUpdated: defaults.lastUpdated,
      source: defaults.source,
      models,
    }
  }

  /**
   * Update or insert a single override. Pass `undefined` for input/output to
   * inherit the default value for that field; pass `includedInPlan: true` to
   * zero the cost regardless of input/output.
   */
  setOverride(model: string, override: PricingOverride): void {
    if (!model || typeof model !== 'string') return
    const cleaned: PricingOverride = {}
    if (typeof override.input === 'number' && override.input >= 0)
      cleaned.input = override.input
    if (typeof override.output === 'number' && override.output >= 0)
      cleaned.output = override.output
    if (override.includedInPlan === true) cleaned.includedInPlan = true
    if (Object.keys(cleaned).length === 0) {
      this.clearOverride(model)
      return
    }
    const overrides = this.store.get('overrides', {})
    overrides[model] = cleaned
    this.store.set('overrides', overrides)
    this.emit('changed')
  }

  /** Remove a single override, reverting that model to defaults (or remote). */
  clearOverride(model: string): void {
    const overrides = this.store.get('overrides', {})
    if (!(model in overrides)) return
    delete overrides[model]
    this.store.set('overrides', overrides)
    this.emit('changed')
  }

  /** Update sync settings. Does NOT fetch — the caller invokes syncFromRemote. */
  setSettings(patch: Partial<PricingSettings>): void {
    const current = this.getSettings()
    const next: PricingSettings = { ...current, ...patch }
    if (typeof next.remoteSyncEnabled !== 'boolean') next.remoteSyncEnabled = false
    if (typeof next.remoteUrl !== 'string') next.remoteUrl = ''
    this.store.set('settings', next)
    this.emit('changed')
  }

  /**
   * Fetch the remote pricing JSON and store it as the middle layer. Time-boxed
   * to 5s, byte-capped to 256KB. Schema validation is strict — a malformed
   * response is rejected without clobbering the existing cached table.
   *
   * Returns `{ ok: true, syncedAt }` on success or `{ ok: false, error }` on
   * failure. Never throws.
   */
  async syncFromRemote(): Promise<{ ok: true; syncedAt: number } | { ok: false; error: string }> {
    const settings = this.getSettings()
    if (!settings.remoteSyncEnabled) {
      const error = 'Remote sync is not enabled.'
      this.persistSyncResult(null, error)
      return { ok: false, error }
    }
    if (!/^https:\/\//i.test(settings.remoteUrl)) {
      const error = 'Remote URL must start with https://.'
      this.persistSyncResult(null, error)
      return { ok: false, error }
    }

    try {
      const raw = await this.fetchRemote(settings.remoteUrl)
      const parsed = JSON.parse(raw) as unknown
      const table = this.validatePricingTable(parsed)
      if (!table) {
        const error = 'Remote response did not match the expected pricing schema.'
        this.persistSyncResult(null, error)
        return { ok: false, error }
      }
      const now = Date.now()
      this.store.set('remote', table)
      this.persistSyncResult(now, null)
      this.emit('changed')
      return { ok: true, syncedAt: now }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.persistSyncResult(null, msg)
      return { ok: false, error: msg }
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private persistSyncResult(syncedAt: number | null, error: string | null): void {
    const current = this.getSettings()
    this.store.set('settings', {
      ...current,
      lastSyncAt: syncedAt ?? current.lastSyncAt,
      lastSyncError: error,
    })
  }

  private fetchRemote(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = request(
        url,
        { method: 'GET', headers: { 'User-Agent': 'clear-path-app' }, timeout: REMOTE_SYNC_TIMEOUT_MS },
        (res: IncomingMessage) => {
          if (res.statusCode !== 200) {
            res.resume()
            reject(new Error(`HTTP ${res.statusCode} fetching pricing`))
            return
          }
          let received = 0
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk: string) => {
            received += chunk.length
            if (received > REMOTE_SYNC_MAX_BYTES) {
              res.destroy()
              reject(new Error('Remote pricing payload exceeded size cap'))
              return
            }
            body += chunk
          })
          res.on('end', () => resolve(body))
          res.on('error', (err: Error) => reject(err))
        },
      )
      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Remote pricing fetch timed out'))
      })
      req.end()
    })
  }

  /**
   * Validate a parsed JSON value against the PricingTable shape. Returns the
   * validated value or null on failure. Strict-ish: rejects anything that
   * could lead to undefined input/output downstream.
   */
  private validatePricingTable(value: unknown): PricingTable | null {
    if (!value || typeof value !== 'object') return null
    const v = value as Record<string, unknown>
    if (typeof v.lastUpdated !== 'string' || typeof v.source !== 'string') return null
    if (!v.models || typeof v.models !== 'object') return null

    const models: Record<string, ModelPriceEntry> = {}
    for (const [id, raw] of Object.entries(v.models as Record<string, unknown>)) {
      if (typeof id !== 'string' || id.length === 0) return null
      if (!raw || typeof raw !== 'object') return null
      const m = raw as Record<string, unknown>
      const input = m.input
      const output = m.output
      const provider = m.provider
      if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) return null
      if (typeof output !== 'number' || !Number.isFinite(output) || output < 0) return null
      if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'google') return null
      const entry: ModelPriceEntry = { provider, input, output }
      if (typeof m.aliasOf === 'string' && m.aliasOf.length > 0) entry.aliasOf = m.aliasOf
      models[id] = entry
    }
    return {
      lastUpdated: v.lastUpdated,
      source: v.source,
      models,
    }
  }
}
