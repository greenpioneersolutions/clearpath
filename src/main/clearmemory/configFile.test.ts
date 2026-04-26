/**
 * configFile tests — round-trip TOML I/O against a real temp directory.
 * We mock the *path discovery* side of the module (binaryResolver + homedir)
 * so writes land under an isolated, test-owned directory. Actual fs calls are
 * unmocked so the atomic .tmp + rename behavior is exercised end-to-end.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const TMP_ROOT = mkdtempSync(join(tmpdir(), 'clearmemory-configFile-'))
const CONFIG_PATH = join(TMP_ROOT, '.clearmemory', 'config.toml')

// Redirect homedir() at the env level — Node honors HOME on darwin/linux and
// USERPROFILE on win32. This is less invasive than mocking 'os' directly
// (which breaks Vite's internal path resolution).
const ORIGINAL_HOME = process.env.HOME
const ORIGINAL_USERPROFILE = process.env.USERPROFILE
process.env.HOME = TMP_ROOT
process.env.USERPROFILE = TMP_ROOT

// Short-circuit the CLI probe so getConfigPath falls back to homedir/.clearmemory.
vi.mock('./binaryResolver', () => ({
  resolveClearMemoryBinary: () =>
    Promise.resolve({ source: 'missing' as const, path: '', error: 'not installed' }),
}))

// Silence module logging.
vi.mock('../utils/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Import AFTER the mocks so they take effect.
import {
  readConfigToml,
  writeConfigPatch,
  validateConfigPatch,
  getDefaultConfig,
} from './configFile'

afterAll(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true })
  if (ORIGINAL_HOME === undefined) delete process.env.HOME
  else process.env.HOME = ORIGINAL_HOME
  if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = ORIGINAL_USERPROFILE
})

function resetConfigFile(initial?: string): void {
  rmSync(CONFIG_PATH, { force: true })
  if (initial != null) {
    mkdirSync(join(TMP_ROOT, '.clearmemory'), { recursive: true })
    writeFileSync(CONFIG_PATH, initial, 'utf8')
  }
}

// ── validateConfigPatch ─────────────────────────────────────────────────────

describe('validateConfigPatch', () => {
  it('accepts every known tier', () => {
    expect(validateConfigPatch({ tier: 'offline' })).toEqual({ ok: true })
    expect(validateConfigPatch({ tier: 'local_llm' })).toEqual({ ok: true })
    expect(validateConfigPatch({ tier: 'cloud' })).toEqual({ ok: true })
  })

  it('rejects unknown tiers', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validateConfigPatch({ tier: 'bogus' as any }).ok).toBe(false)
  })

  it('enforces numeric ranges', () => {
    expect(validateConfigPatch({ topK: 10 }).ok).toBe(true)
    expect(validateConfigPatch({ topK: 0 }).ok).toBe(false)
    expect(validateConfigPatch({ topK: 51 }).ok).toBe(false)

    expect(validateConfigPatch({ tokenBudget: 4096 }).ok).toBe(true)
    expect(validateConfigPatch({ tokenBudget: 256 }).ok).toBe(false)
    expect(validateConfigPatch({ tokenBudget: 20000 }).ok).toBe(false)

    expect(validateConfigPatch({ retentionTimeThresholdDays: 90 }).ok).toBe(true)
    expect(validateConfigPatch({ retentionSizeThresholdGb: 2 }).ok).toBe(true)
    expect(validateConfigPatch({ retentionPerformanceThresholdMs: 200 }).ok).toBe(true)
    expect(validateConfigPatch({ retentionPerformanceThresholdMs: 10 }).ok).toBe(false)
  })

  it('requires boolean for encryptionEnabled', () => {
    expect(validateConfigPatch({ encryptionEnabled: true }).ok).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validateConfigPatch({ encryptionEnabled: 1 as any }).ok).toBe(false)
  })

  it('treats empty patch as valid (no-op)', () => {
    expect(validateConfigPatch({})).toEqual({ ok: true })
  })
})

// ── readConfigToml ──────────────────────────────────────────────────────────

describe('readConfigToml', () => {
  beforeEach(() => resetConfigFile())

  it('returns defaults when the file does not exist', async () => {
    const { config } = await readConfigToml()
    expect(config).toEqual(getDefaultConfig())
  })

  it('parses a full config file', async () => {
    resetConfigFile([
      '[general]',
      'tier = "local_llm"',
      '',
      '[retrieval]',
      'top_k = 15',
      'token_budget = 8192',
      '',
      '[retention]',
      'time_threshold_days = 30',
      'size_threshold_gb = 5',
      'performance_threshold_ms = 300',
      '',
      '[encryption]',
      'enabled = false',
      '',
    ].join('\n'))
    const { config } = await readConfigToml()
    expect(config).toEqual({
      tier: 'local_llm',
      topK: 15,
      tokenBudget: 8192,
      retentionTimeThresholdDays: 30,
      retentionSizeThresholdGb: 5,
      retentionPerformanceThresholdMs: 300,
      encryptionEnabled: false,
    })
  })

  it('falls back to defaults for missing keys and ignores unknown sections', async () => {
    resetConfigFile([
      '# user comment',
      '[general]',
      'tier = "cloud"',
      '',
      '[custom-upstream-section]',
      'unknown = "value"',
    ].join('\n'))
    const { config } = await readConfigToml()
    expect(config.tier).toBe('cloud')
    expect(config.topK).toBe(getDefaultConfig().topK)
    expect(config.tokenBudget).toBe(getDefaultConfig().tokenBudget)
  })

  it('ignores malformed tier values', async () => {
    resetConfigFile('[general]\ntier = "malicious-tier"\n')
    const { config } = await readConfigToml()
    expect(config.tier).toBe(getDefaultConfig().tier)
  })

  it('handles trailing comments on value lines', async () => {
    resetConfigFile('[retrieval]\ntop_k = 20   # picked by perf team\n')
    const { config } = await readConfigToml()
    expect(config.topK).toBe(20)
  })
})

// ── writeConfigPatch ────────────────────────────────────────────────────────

describe('writeConfigPatch', () => {
  beforeEach(() => resetConfigFile())

  it('writes a new file when none exists', async () => {
    const result = await writeConfigPatch({ tier: 'local_llm', topK: 12 })
    expect(result.tier).toBe('local_llm')
    expect(result.topK).toBe(12)

    const saved = readFileSync(CONFIG_PATH, 'utf8')
    expect(saved).toContain('[general]')
    expect(saved).toContain('tier = "local_llm"')
    expect(saved).toContain('[retrieval]')
    expect(saved).toContain('top_k = 12')
  })

  it('updates a known key in place without clobbering siblings', async () => {
    resetConfigFile([
      '[general]',
      'tier = "offline"',
      '',
      '[retrieval]',
      'top_k = 10',
      'token_budget = 4096',
    ].join('\n'))

    await writeConfigPatch({ topK: 25 })

    const saved = readFileSync(CONFIG_PATH, 'utf8')
    expect(saved).toContain('top_k = 25')
    expect(saved).toContain('token_budget = 4096')
    expect(saved).toContain('tier = "offline"')
  })

  it('preserves unknown keys, comments, and unknown sections when patching', async () => {
    resetConfigFile([
      '# Generated by clearmemory init',
      '# Do not edit while daemon is running.',
      '',
      '[general]',
      'tier = "offline"',
      'user_field = "keep me"',
      '',
      '[retrieval]',
      'top_k = 10',
      'future_tunable = 999',
      '',
      '[unknown-section]',
      'anything_goes = true',
    ].join('\n'))

    await writeConfigPatch({ topK: 42, tier: 'local_llm' })

    const saved = readFileSync(CONFIG_PATH, 'utf8')
    expect(saved).toContain('# Generated by clearmemory init')
    expect(saved).toContain('# Do not edit while daemon is running.')
    expect(saved).toContain('user_field = "keep me"')
    expect(saved).toContain('future_tunable = 999')
    expect(saved).toContain('[unknown-section]')
    expect(saved).toContain('anything_goes = true')
    expect(saved).toContain('tier = "local_llm"')
    expect(saved).toContain('top_k = 42')
  })

  it('appends a missing section when the patch adds one', async () => {
    resetConfigFile('[general]\ntier = "offline"\n')

    await writeConfigPatch({ encryptionEnabled: false })

    const saved = readFileSync(CONFIG_PATH, 'utf8')
    expect(saved).toContain('[encryption]')
    expect(saved).toContain('enabled = false')
    expect(saved).toContain('[general]')
    expect(saved).toContain('tier = "offline"')
  })

  it('rejects invalid patches before touching disk', async () => {
    resetConfigFile('[retrieval]\ntop_k = 5\n')
    await expect(writeConfigPatch({ topK: 9999 })).rejects.toThrow(/topK/)
    const saved = readFileSync(CONFIG_PATH, 'utf8')
    expect(saved).toContain('top_k = 5') // untouched
  })

  it('preserves trailing comments on updated value lines', async () => {
    resetConfigFile('[retrieval]\ntop_k = 10   # default\n')
    await writeConfigPatch({ topK: 33 })
    const saved = readFileSync(CONFIG_PATH, 'utf8')
    const topKLine = saved.split('\n').find((l) => l.trimStart().startsWith('top_k'))!
    expect(topKLine).toContain('33')
    expect(topKLine).toContain('# default')
  })
})
