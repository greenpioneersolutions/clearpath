// ── ClearMemory config.toml round-trip helper ────────────────────────────────
// The upstream `clearmemory` CLI exposes `config show` / `config edit` /
// `config path` but NO `config set` subcommand. To mutate config we read the
// file, patch the narrow set of keys the UI knows about, and write it back
// atomically. Unknown keys and comments are preserved by round-tripping lines
// verbatim — we only touch lines whose key matches one we recognise.
//
// This module never pulls in a real TOML library — the schema is flat tables
// with scalar values (string | number | boolean) so a line-oriented parser is
// sufficient and auditable.

import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'

import { resolveClearMemoryBinary } from './binaryResolver'
import type { ClearMemoryConfig, ClearMemoryTier } from '../../shared/clearmemory/types'
import { log } from '../utils/logger'

const execFileAsync = promisify(execFile)

// ── Schema map ───────────────────────────────────────────────────────────────
// Maps ClearMemoryConfig fields ↔ (section, key) pairs in config.toml.
// Ordered so we can iterate when appending new sections/keys.

type TomlScalar = string | number | boolean

interface FieldSpec {
  section: string
  key: string
  readonly type: 'string' | 'number' | 'boolean'
}

const FIELD_MAP: Record<keyof Omit<ClearMemoryConfig,
  // legacy aliases we don't round-trip
  'retentionThresholdDays' | 'retentionMaxMemories'
>, FieldSpec> = {
  tier: { section: 'general', key: 'tier', type: 'string' },
  topK: { section: 'retrieval', key: 'top_k', type: 'number' },
  tokenBudget: { section: 'retrieval', key: 'token_budget', type: 'number' },
  retentionTimeThresholdDays: { section: 'retention', key: 'time_threshold_days', type: 'number' },
  retentionSizeThresholdGb: { section: 'retention', key: 'size_threshold_gb', type: 'number' },
  retentionPerformanceThresholdMs: { section: 'retention', key: 'performance_threshold_ms', type: 'number' },
  encryptionEnabled: { section: 'encryption', key: 'enabled', type: 'boolean' },
}

const DEFAULT_CONFIG: ClearMemoryConfig = {
  tier: 'offline',
  topK: 10,
  tokenBudget: 4096,
  retentionTimeThresholdDays: 90,
  retentionSizeThresholdGb: 2,
  retentionPerformanceThresholdMs: 200,
  encryptionEnabled: true,
}

const ALLOWED_TIERS: ReadonlySet<ClearMemoryTier> = new Set<ClearMemoryTier>([
  'offline', 'local_llm', 'cloud',
])

// ── Path discovery ───────────────────────────────────────────────────────────

/**
 * Discover where ClearMemory keeps `config.toml`. Prefer asking the CLI
 * (`clearmemory config path`); fall back to the canonical `~/.clearmemory`
 * location if the CLI doesn't respond within a small timeout.
 */
export async function getConfigPath(): Promise<string> {
  const resolved = await resolveClearMemoryBinary()
  if (resolved.source !== 'missing') {
    try {
      const { stdout } = await execFileAsync(resolved.path, ['config', 'path'], {
        timeout: 5_000,
      })
      const firstLine = stdout.toString().split(/\r?\n/).find((l) => l.trim().length > 0)?.trim()
      if (firstLine && firstLine.endsWith('.toml')) return firstLine
    } catch (err) {
      log.warn('[clearmemory:config] `config path` failed — falling back to ~/.clearmemory/config.toml: %s', (err as Error).message)
    }
  }
  return join(homedir(), '.clearmemory', 'config.toml')
}

// ── Parse ────────────────────────────────────────────────────────────────────

interface ParsedToml {
  /** Original line text, preserved verbatim. */
  lines: string[]
  /** `[section.key]` → index into `lines`, pointing at the `key = value` line. */
  index: Map<string, number>
  /** `[section]` → index of the header line (for inserting new keys). */
  sectionHeaders: Map<string, number>
}

/**
 * Shallow TOML parser. Recognises:
 *   [table]
 *   key = "value" | 42 | 3.14 | true | false
 *   # comment  (ignored)
 * Leading/trailing whitespace is tolerated. Quoted strings may contain escaped
 * quotes (`\"`). Multi-line values, inline tables, and arrays are not
 * supported — the upstream schema doesn't use them.
 */
function parseToml(text: string): ParsedToml {
  const lines = text.split(/\r?\n/)
  const index = new Map<string, number>()
  const sectionHeaders = new Map<string, number>()
  let currentSection = ''

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()
    if (trimmed.length === 0) continue
    if (trimmed.startsWith('#')) continue

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim()
      if (!sectionHeaders.has(currentSection)) {
        sectionHeaders.set(currentSection, i)
      }
      continue
    }

    // key = value (possibly followed by trailing comment)
    const kvMatch = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=/)
    if (kvMatch && currentSection) {
      const key = kvMatch[1]
      const qualified = `${currentSection}.${key}`
      // First occurrence wins — we treat redefinitions as broken config.
      if (!index.has(qualified)) index.set(qualified, i)
    }
  }

  return { lines, index, sectionHeaders }
}

/** Extract the scalar RHS of a `key = value` line. Returns `null` on parse failure. */
function parseScalarValue(line: string, type: FieldSpec['type']): TomlScalar | null {
  // Strip everything up to and including the first `=`.
  const eqIdx = line.indexOf('=')
  if (eqIdx < 0) return null
  // Strip any trailing `# comment`.
  let rhs = line.slice(eqIdx + 1)
  const hashIdx = indexOfUnquotedHash(rhs)
  if (hashIdx >= 0) rhs = rhs.slice(0, hashIdx)
  rhs = rhs.trim()
  if (rhs.length === 0) return null

  if (type === 'string') {
    // Accept "..." or '...'. Unquoted bare strings are tolerated for the
    // narrow tier/string case.
    if ((rhs.startsWith('"') && rhs.endsWith('"')) ||
        (rhs.startsWith("'") && rhs.endsWith("'"))) {
      return rhs.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'")
    }
    return rhs
  }

  if (type === 'boolean') {
    if (rhs === 'true') return true
    if (rhs === 'false') return false
    return null
  }

  // number
  const n = Number(rhs)
  if (!Number.isFinite(n)) return null
  return n
}

/** Return first `#` outside double-quoted spans, or -1. */
function indexOfUnquotedHash(s: string): number {
  let inQuotes = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"' && s[i - 1] !== '\\') inQuotes = !inQuotes
    else if (ch === '#' && !inQuotes) return i
  }
  return -1
}

/** Serialise a scalar to TOML syntax. */
function formatScalar(value: TomlScalar, type: FieldSpec['type']): string {
  if (type === 'string') return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  if (type === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Read `config.toml` and return a normalised ClearMemoryConfig. Missing keys
 * fall back to DEFAULT_CONFIG so the renderer always receives a fully-populated
 * object. If the file doesn't exist yet we return defaults.
 */
export async function readConfigToml(): Promise<{ path: string; config: ClearMemoryConfig }> {
  const path = await getConfigPath()
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return { path, config: { ...DEFAULT_CONFIG } }
  }

  const parsed = parseToml(text)
  const config: ClearMemoryConfig = { ...DEFAULT_CONFIG }

  for (const [field, spec] of Object.entries(FIELD_MAP) as Array<[keyof typeof FIELD_MAP, FieldSpec]>) {
    const qualified = `${spec.section}.${spec.key}`
    const lineIdx = parsed.index.get(qualified)
    if (lineIdx == null) continue
    const parsedValue = parseScalarValue(parsed.lines[lineIdx], spec.type)
    if (parsedValue == null) continue
    if (field === 'tier') {
      if (typeof parsedValue === 'string' && ALLOWED_TIERS.has(parsedValue as ClearMemoryTier)) {
        config.tier = parsedValue as ClearMemoryTier
      }
      continue
    }
    // TypeScript narrowing via spec.type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(config as any)[field] = parsedValue
  }

  return { path, config }
}

/**
 * Validate a ClearMemoryConfig patch. Returns { ok: true } or
 * { ok: false, error }. This is the single choke-point for schema validation —
 * both the `config-set` IPC handler and any future bulk-apply code should
 * funnel through here.
 */
export function validateConfigPatch(patch: Partial<ClearMemoryConfig>): { ok: true } | { ok: false; error: string } {
  if (patch.tier != null && !ALLOWED_TIERS.has(patch.tier)) {
    return { ok: false, error: `Invalid tier: ${String(patch.tier)}` }
  }
  const ranges: Array<[keyof ClearMemoryConfig, number, number]> = [
    ['topK', 1, 50],
    ['tokenBudget', 512, 16384],
    ['retentionTimeThresholdDays', 1, 3650],
    ['retentionSizeThresholdGb', 1, 1000],
    ['retentionPerformanceThresholdMs', 50, 5000],
  ]
  for (const [field, min, max] of ranges) {
    const v = patch[field]
    if (v == null) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
      return { ok: false, error: `${String(field)} must be a number in [${min}, ${max}]` }
    }
  }
  if (patch.encryptionEnabled != null && typeof patch.encryptionEnabled !== 'boolean') {
    return { ok: false, error: 'encryptionEnabled must be a boolean' }
  }
  return { ok: true }
}

/**
 * Apply a partial patch to the on-disk config.toml, round-tripping unknown
 * keys/comments. Writes atomically via a .tmp + rename dance. Returns the
 * merged ClearMemoryConfig after save.
 */
export async function writeConfigPatch(patch: Partial<ClearMemoryConfig>): Promise<ClearMemoryConfig> {
  const validation = validateConfigPatch(patch)
  if (!validation.ok) throw new Error(validation.error)

  const path = await getConfigPath()

  // Ensure parent directory exists (first-time setup).
  mkdirSync(dirname(path), { recursive: true })

  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    text = ''
  }

  const parsed = parseToml(text)
  const lines = [...parsed.lines]
  // Mutable copies we can update as we append.
  const index = new Map(parsed.index)
  const sectionHeaders = new Map(parsed.sectionHeaders)

  for (const [field, value] of Object.entries(patch) as Array<[keyof ClearMemoryConfig, TomlScalar | undefined]>) {
    if (value === undefined) continue
    const spec = (FIELD_MAP as Record<string, FieldSpec | undefined>)[field]
    if (!spec) continue

    const qualified = `${spec.section}.${spec.key}`
    const newLine = `${spec.key} = ${formatScalar(value, spec.type)}`

    const existingIdx = index.get(qualified)
    if (existingIdx != null) {
      // Preserve any leading indentation + trailing comment on the original
      // line so user notes survive round-trip.
      const original = lines[existingIdx]
      const indent = (original.match(/^\s*/)?.[0]) ?? ''
      const commentIdx = indexOfUnquotedHash(original)
      const trailing = commentIdx >= 0 ? '  ' + original.slice(commentIdx).trim() : ''
      lines[existingIdx] = `${indent}${newLine}${trailing ? ' ' + trailing : ''}`
      continue
    }

    const sectionIdx = sectionHeaders.get(spec.section)
    if (sectionIdx != null) {
      // Insert directly after the section header.
      lines.splice(sectionIdx + 1, 0, newLine)
      // Bump indices after the insertion point.
      for (const [k, i] of index) if (i > sectionIdx) index.set(k, i + 1)
      for (const [k, i] of sectionHeaders) if (i > sectionIdx) sectionHeaders.set(k, i + 1)
      index.set(qualified, sectionIdx + 1)
    } else {
      // Brand-new section — append at end.
      if (lines.length > 0 && lines[lines.length - 1].trim().length > 0) lines.push('')
      const headerIdx = lines.length
      lines.push(`[${spec.section}]`)
      lines.push(newLine)
      sectionHeaders.set(spec.section, headerIdx)
      index.set(qualified, headerIdx + 1)
    }
  }

  // Ensure trailing newline.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  lines.push('')

  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, lines.join('\n'), 'utf8')
  renameSync(tmpPath, path)

  // Re-read so the caller sees the fully-merged shape (including unchanged
  // on-disk keys we didn't touch).
  const { config } = await readConfigToml()
  return config
}

/** Exported for tests and defensive fallbacks. */
export function getDefaultConfig(): ClearMemoryConfig {
  return { ...DEFAULT_CONFIG }
}

/** Check that config.toml exists — handy for `config show` fallback. */
export async function configFileExists(): Promise<boolean> {
  return existsSync(await getConfigPath())
}
