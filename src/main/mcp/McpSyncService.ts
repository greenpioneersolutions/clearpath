/**
 * McpSyncService — source-of-truth renderer for MCP server config.
 *
 * ClearPath's `McpRegistry` (`clear-path-mcps.json`) is authoritative. The four
 * native CLI config files
 *   - `~/.copilot/mcp-config.json`
 *   - `~/.claude/mcp-config.json`
 *   - `<project>/.github/copilot/mcp-config.json`
 *   - `<project>/.claude/mcp-config.json`
 * are **rendered output**, not inputs. `syncAll()` writes them atomically on
 * every registry mutation so both CLIs pick the changes up via their normal
 * precedence rules — no launch-flag plumbing required.
 *
 * The one exception is `importExisting()`, which runs once on first launch to
 * pull any pre-existing native entries into the registry (marked `source:
 * 'imported'`). After that, the registry owns the truth.
 *
 * Because the native files are rendered, manual edits to them will be
 * clobbered on the next sync. To avoid silent overwrites, `syncAll()` records
 * each file's mtime; `detectExternalChanges()` flags any file whose mtime has
 * advanced since the last sync so the UI can prompt the user to adopt the
 * external changes or overwrite them.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { log } from '../utils/logger'
import {
  safeReadJson,
  validateMcpServer,
  type McpConfigFile,
  type McpServerEntry,
} from '../ipc/toolHandlers'
import type { McpRegistry } from './McpRegistry'
import type { McpSecretsVault } from './McpSecretsVault'
import type {
  McpRegistryEntry,
  McpRegistryEntryInput,
  McpSyncResult,
} from '../../renderer/src/types/mcp'

// ── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve the native MCP config file for a given CLI + scope + project path.
 * Uses the registry's `scope: 'global' | 'project'` terminology (which maps to
 * the CLI-side `user | project` convention).
 *
 * @param homeOverride - Optional override for the home directory. Used by
 *   integration tests to write into a tmp directory without monkey-patching
 *   `os.homedir()`.
 */
export function resolveNativeConfigPath(
  cli: 'copilot' | 'claude',
  scope: 'global' | 'project',
  projectPath?: string,
  homeOverride?: string,
): string {
  const home = homeOverride ?? homedir()
  if (scope === 'global') {
    return cli === 'copilot'
      ? join(home, '.copilot', 'mcp-config.json')
      : join(home, '.claude', 'mcp-config.json')
  }
  const dir = projectPath || process.cwd()
  return cli === 'copilot'
    ? join(dir, '.github', 'copilot', 'mcp-config.json')
    : join(dir, '.claude', 'mcp-config.json')
}

// ── Rendering (pure; easily unit-testable) ────────────────────────────────────

/**
 * Render a single registry entry into the native file-shape `{command, args, env, disabled?}`.
 *
 * Secret refs are resolved via `vault` at render time. If a ref is missing, the
 * env var is omitted and a warning is logged — the CLI will fail gracefully.
 */
export function renderEntryToFileShape(
  entry: McpRegistryEntry,
  vault: Pick<McpSecretsVault, 'get'>,
): McpServerEntry {
  const resolvedEnv: Record<string, string> = { ...(entry.env ?? {}) }

  for (const [envVarName, vaultKey] of Object.entries(entry.secretRefs ?? {})) {
    const plaintext = vault.get(vaultKey)
    if (plaintext === null) {
      log.warn(
        '[McpSyncService] Secret "%s" (vault key "%s") missing for entry "%s" — env var will be omitted',
        envVarName,
        vaultKey,
        entry.name,
      )
      continue
    }
    resolvedEnv[envVarName] = plaintext
  }

  const shape: McpServerEntry = {
    command: entry.command,
    args: [...(entry.args ?? [])],
  }
  if (Object.keys(resolvedEnv).length > 0) {
    shape.env = resolvedEnv
  }
  if (!entry.enabled) {
    shape.disabled = true
  }
  return shape
}

// ── Atomic write ──────────────────────────────────────────────────────────────

function atomicWriteJson(path: string, data: unknown): { success: boolean; error?: string } {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = path + '.tmp'
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
    renameSync(tmp, path)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

interface BucketKey {
  cli: 'copilot' | 'claude'
  scope: 'global' | 'project'
  projectPath?: string
}

function bucketKey(b: BucketKey): string {
  return `${b.cli}:${b.scope}:${b.projectPath ?? ''}`
}

/**
 * Renders the MCP registry into native CLI config files. Idempotent — calling
 * `syncAll` multiple times produces the same output (modulo vault contents).
 */
export class McpSyncService {
  /**
   * Tracks mtime-at-last-sync for every file we've rendered. Used by
   * `detectExternalChanges` to flag files modified by another tool since we
   * last wrote them.
   */
  private readonly lastKnownMtimes = new Map<string, number>()

  /**
   * Per-bucket set of entry names this service has ever rendered. Used at
   * sync time to clean up rendered entries whose corresponding registry
   * entry has since been removed. Names added to rendered files by other
   * tools (or pre-existing at import time) are never in this set and thus
   * preserved across syncs.
   */
  private readonly everRendered = new Map<string, Set<string>>()

  /**
   * Optional home-directory override. Integration tests pass a tmp dir here so
   * writes land under the sandbox instead of the real `~/.copilot` / `~/.claude`.
   * Unset in production — falls through to `os.homedir()`.
   */
  private readonly homedirOverride?: string

  constructor(
    private readonly registry: McpRegistry,
    private readonly vault: McpSecretsVault,
    options?: { homedirOverride?: string },
  ) {
    this.homedirOverride = options?.homedirOverride
  }

  /** Internal helper — resolves a native path honoring the homedir override. */
  private resolvePath(
    cli: 'copilot' | 'claude',
    scope: 'global' | 'project',
    projectPath?: string,
  ): string {
    return resolveNativeConfigPath(cli, scope, projectPath, this.homedirOverride)
  }

  /**
   * Compare the current mtime of every native config path against the mtime
   * recorded at the last `syncAll`. Returns the paths whose mtime is newer —
   * i.e. files that something other than this service has touched.
   *
   * Entries we've never synced are skipped (no baseline to compare against);
   * callers should run `syncAll` first if they want a clean baseline.
   */
  detectExternalChanges(
    projectPaths: string[] = [],
  ): Array<{ path: string; cli: 'copilot' | 'claude'; scope: 'global' | 'project' }> {
    const checked: Array<{ path: string; cli: 'copilot' | 'claude'; scope: 'global' | 'project' }> = []
    const targets: Array<{ cli: 'copilot' | 'claude'; scope: 'global' | 'project'; projectPath?: string }> = [
      { cli: 'copilot', scope: 'global' },
      { cli: 'claude', scope: 'global' },
      ...projectPaths.flatMap<{ cli: 'copilot' | 'claude'; scope: 'global' | 'project'; projectPath?: string }>((p) => [
        { cli: 'copilot', scope: 'project', projectPath: p },
        { cli: 'claude', scope: 'project', projectPath: p },
      ]),
    ]
    for (const t of targets) {
      const path = this.resolvePath(t.cli, t.scope, t.projectPath)
      if (!existsSync(path)) continue
      const known = this.lastKnownMtimes.get(path)
      if (known === undefined) continue // no baseline; nothing to compare against
      let current: number
      try {
        current = statSync(path).mtimeMs
      } catch {
        continue
      }
      if (current > known) {
        checked.push({ path, cli: t.cli, scope: t.scope })
      }
    }
    return checked
  }

  /**
   * Write every registry entry to its target native config file(s).
   *
   * @param projectPaths - Project-scoped entries whose `projectPath` matches
   *   one of these will be written. Entries whose `projectPath` isn't in the
   *   list are skipped (to avoid writing into random directories at startup).
   */
  syncAll(projectPaths: string[] = []): McpSyncResult {
    const entries = this.registry.list()
    const allowedProjects = new Set(projectPaths.map((p) => p))

    // Build a map of `(cli, scope, projectPath)` → { [name]: shape }
    const buckets = new Map<string, { path: string; file: McpConfigFile }>()

    const ensureBucket = (k: BucketKey): { path: string; file: McpConfigFile } => {
      const key = bucketKey(k)
      let bucket = buckets.get(key)
      if (!bucket) {
        const path = this.resolvePath(k.cli, k.scope, k.projectPath)
        // Seed from the existing file so we preserve entries the registry
        // doesn't own (e.g. servers added via the old tools:* handlers).
        const existing = existsSync(path)
          ? safeReadJson<McpConfigFile>(path, { mcpServers: {} })
          : { mcpServers: {} }
        // Start fresh — the registry is source of truth for entries it knows
        // about. Preserving unknown entries is handled separately below.
        bucket = { path, file: { mcpServers: { ...(existing.mcpServers ?? {}) } } }
        buckets.set(key, bucket)
      }
      return bucket
    }

    // Track which (bucket, name) combinations the registry owns so we can
    // remove stale entries that were previously written but no longer exist
    // in the registry. Only entries matching this exact pattern are cleaned —
    // unknown entries in the native file are left alone.
    const ownedByRegistry = new Set<string>()

    for (const entry of entries) {
      if (entry.scope === 'project' && (!entry.projectPath || !allowedProjects.has(entry.projectPath))) {
        // Skip project-scoped entries we weren't asked to sync
        continue
      }
      const shape = renderEntryToFileShape(entry, this.vault)
      const targets: Array<'copilot' | 'claude'> = []
      if (entry.targets?.copilot) targets.push('copilot')
      if (entry.targets?.claude) targets.push('claude')

      for (const cli of targets) {
        const bk: BucketKey = { cli, scope: entry.scope, projectPath: entry.projectPath }
        const bucket = ensureBucket(bk)
        bucket.file.mcpServers[entry.name] = shape
        ownedByRegistry.add(`${bucketKey(bk)}::${entry.name}`)
        // Remember we've rendered this name into this bucket so future syncs
        // can clean it up if it's removed from the registry.
        const bkStr = bucketKey(bk)
        let ever = this.everRendered.get(bkStr)
        if (!ever) { ever = new Set<string>(); this.everRendered.set(bkStr, ever) }
        ever.add(entry.name)
      }
    }

    // Also ensure every bucket we MIGHT need to touch has been read, so we
    // can remove stale registry-owned entries that are no longer present.
    // Enumerate target paths: every (cli, 'global') unconditionally, plus
    // every (cli, 'project', p) for p in allowedProjects.
    for (const cli of ['copilot', 'claude'] as const) {
      ensureBucket({ cli, scope: 'global' })
      for (const p of allowedProjects) {
        ensureBucket({ cli, scope: 'project', projectPath: p })
      }
    }

    // Clean: if a bucket contains an entry whose name matches a registry entry
    // NOT present in `ownedByRegistry` for that bucket, remove it. This handles
    // the case where an entry was previously synced here but has since been
    // removed or re-targeted.
    const registryNamesByBucket = new Map<string, Set<string>>()
    for (const entry of entries) {
      for (const cli of ['copilot', 'claude'] as const) {
        if (!entry.targets?.[cli]) continue
        if (entry.scope === 'project' && (!entry.projectPath || !allowedProjects.has(entry.projectPath))) continue
        const bk: BucketKey = { cli, scope: entry.scope, projectPath: entry.projectPath }
        const key = bucketKey(bk)
        let set = registryNamesByBucket.get(key)
        if (!set) { set = new Set(); registryNamesByBucket.set(key, set) }
        set.add(entry.name)
      }
    }
    for (const [bucketKeyStr, bucket] of buckets) {
      const currentlyOwned = registryNamesByBucket.get(bucketKeyStr) ?? new Set<string>()
      const everOwned = this.everRendered.get(bucketKeyStr) ?? new Set<string>()
      // Any name we've ever rendered here but no longer own → remove from
      // the bucket so the rendered file no longer contains it. Names we've
      // never rendered (manual additions to the native file) are preserved.
      for (const name of everOwned) {
        if (!currentlyOwned.has(name)) {
          delete bucket.file.mcpServers[name]
          everOwned.delete(name)
        }
      }
    }

    // Write all buckets atomically
    const filesWritten: string[] = []
    const errors: Array<{ path: string; error: string }> = []
    for (const { path, file } of buckets.values()) {
      const res = atomicWriteJson(path, file)
      if (res.success) {
        filesWritten.push(path)
        // Record post-write mtime so `detectExternalChanges` has a baseline.
        try {
          this.lastKnownMtimes.set(path, statSync(path).mtimeMs)
        } catch {
          // Non-fatal: if stat fails, we just won't detect external changes for this file.
        }
      } else if (res.error) {
        errors.push({ path, error: res.error })
      }
    }

    return { success: errors.length === 0, filesWritten, errors }
  }

  /**
   * Scan the four native config paths (global copilot, global claude, and
   * project-scoped copies for each given project path) and import any servers
   * that aren't already in the registry.
   *
   * Idempotent: matches on `(cli-scope, name)`, so running twice won't duplicate.
   */
  importExisting(projectPaths: string[] = []): { imported: number; skipped: number } {
    let imported = 0
    let skipped = 0

    type Source = { cli: 'copilot' | 'claude'; scope: 'global' | 'project'; projectPath?: string }
    const sources: Source[] = [
      { cli: 'copilot', scope: 'global' },
      { cli: 'claude', scope: 'global' },
      ...projectPaths.flatMap<Source>((p) => [
        { cli: 'copilot', scope: 'project', projectPath: p },
        { cli: 'claude', scope: 'project', projectPath: p },
      ]),
    ]

    const existingEntries = this.registry.list()

    for (const src of sources) {
      const path = this.resolvePath(src.cli, src.scope, src.projectPath)
      if (!existsSync(path)) continue
      const config = safeReadJson<McpConfigFile>(path, { mcpServers: {} })

      for (const [name, shape] of Object.entries(config.mcpServers ?? {})) {
        // Duplicate detection keyed on (cli, scope, projectPath, name)
        const duplicate = existingEntries.find((e) => {
          if (e.name !== name) return false
          if (e.scope !== src.scope) return false
          if (e.scope === 'project' && e.projectPath !== src.projectPath) return false
          // The registry entry must target this CLI for it to be considered a match
          return e.targets?.[src.cli] === true
        })
        if (duplicate) {
          skipped++
          continue
        }

        // Validate before importing — skip entries that would fail validation
        const validation = validateMcpServer({
          command: shape.command,
          args: shape.args,
          env: shape.env,
        })
        if (!validation.valid) {
          log.warn('[McpSyncService] Skipping import of "%s" from %s — %s', name, path, validation.error)
          skipped++
          continue
        }

        const input: McpRegistryEntryInput = {
          name,
          command: shape.command,
          args: shape.args ?? [],
          env: shape.env ?? {},
          secretRefs: {},
          scope: src.scope,
          projectPath: src.projectPath,
          targets: { copilot: src.cli === 'copilot', claude: src.cli === 'claude' },
          enabled: !shape.disabled,
          source: 'imported',
        }
        this.registry.add(input)
        imported++
      }
    }

    return { imported, skipped }
  }
}
