import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import Store from 'electron-store'
import { log } from '../utils/logger'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

// ── Types ────────────────────────────────────────────────────────────────────

export type PluginCli = 'copilot' | 'claude'
export type CustomPathCli = PluginCli | 'auto'
export type PluginSource = 'discovered' | 'custom'

export interface PluginEntry {
  /** Stable identifier — the absolute plugin directory path. */
  id: string
  /** Plugin name (from manifest, falls back to directory basename). */
  name: string
  /** Plugin version, if declared in the manifest. */
  version?: string
  /** Short description from manifest. */
  description?: string
  /** Which CLI this plugin targets. Determined by which manifest shape was found. */
  cli: PluginCli
  /** Where the plugin came from. */
  source: PluginSource
  /** Whether the user has toggled this plugin on for its CLI. */
  enabled: boolean
  /** Absolute path to the plugin root directory. */
  path: string
  /** Absolute path to the manifest file we parsed. */
  manifestPath: string
}

export interface CustomPath {
  path: string
  /** 'auto' = infer from which manifest is present at the path. */
  cli: CustomPathCli
}

interface PluginStoreSchema {
  customPaths: CustomPath[]
  enabled: { copilot: string[]; claude: string[] }
  /** Reserved for future per-plugin user notes / display name overrides. */
  overrides: Record<string, { name?: string; notes?: string }>
}

// ── Manifest parsing ─────────────────────────────────────────────────────────

interface ManifestData {
  name?: string
  version?: string
  description?: string
}

/** Read a JSON manifest, returning null on any error (missing, unreadable, malformed). */
function readManifest(manifestPath: string): ManifestData | null {
  try {
    if (!existsSync(manifestPath)) return null
    const raw = readFileSync(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      name: typeof parsed['name'] === 'string' ? parsed['name'] : undefined,
      version: typeof parsed['version'] === 'string' ? parsed['version'] : undefined,
      description: typeof parsed['description'] === 'string' ? parsed['description'] : undefined,
    }
  } catch (err) {
    log.warn(`[PluginManager] failed to parse manifest at ${manifestPath}: ${(err as Error).message}`)
    return null
  }
}

/** Path of the Copilot-style manifest at the root of a plugin dir. */
function copilotManifestPath(dir: string): string {
  return join(dir, 'plugin.json')
}

/** Path of the Claude-style manifest at .claude-plugin/plugin.json. */
function claudeManifestPath(dir: string): string {
  return join(dir, '.claude-plugin', 'plugin.json')
}

// ── Discovery ────────────────────────────────────────────────────────────────

/** Resolve the Copilot install root, honoring COPILOT_HOME. */
function copilotInstallRoot(): string {
  const override = process.env['COPILOT_HOME']
  const home = override && override.trim() ? override : join(homedir(), '.copilot')
  return join(home, 'installed-plugins')
}

/**
 * Resolve the Claude plugin root. We honor CLAUDE_CODE_PLUGIN_CACHE_DIR if set;
 * otherwise default to ~/.claude/plugins.
 */
function claudePluginRoot(): string {
  const override = process.env['CLAUDE_CODE_PLUGIN_CACHE_DIR']
  if (override && override.trim()) return override
  return join(homedir(), '.claude', 'plugins')
}

/** Yield every directory under `root` (recursively up to one level), or just root's children if flat. */
function listChildDirs(root: string): string[] {
  if (!existsSync(root)) return []
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch (err) {
    log.warn(`[PluginManager] failed to read ${root}: ${(err as Error).message}`)
    return []
  }
  const out: string[] = []
  for (const name of entries) {
    const full = join(root, name)
    try {
      if (statSync(full).isDirectory()) out.push(full)
    } catch {
      // skip unreadable entries
    }
  }
  return out
}

/**
 * Walk Copilot's installed-plugins layout. The directory structure is:
 *   ~/.copilot/installed-plugins/MARKETPLACE/PLUGIN/   (marketplace installs)
 *   ~/.copilot/installed-plugins/_direct/SOURCE-ID/    (direct installs)
 * Either way, the manifest sits at <leaf>/plugin.json. We walk one level deep,
 * and if a manifest isn't directly inside, we look one more level down.
 */
function scanCopilot(): PluginEntry[] {
  const root = copilotInstallRoot()
  const out: PluginEntry[] = []
  for (const lvl1 of listChildDirs(root)) {
    // Case A: lvl1 itself is a plugin (manifest at lvl1/plugin.json)
    const lvl1Manifest = copilotManifestPath(lvl1)
    if (existsSync(lvl1Manifest)) {
      const meta = readManifest(lvl1Manifest)
      if (meta) {
        out.push(makeEntry(lvl1, lvl1Manifest, 'copilot', 'discovered', meta))
        continue
      }
    }
    // Case B: lvl1 is a marketplace folder containing PLUGIN/ subdirs
    for (const lvl2 of listChildDirs(lvl1)) {
      const m2 = copilotManifestPath(lvl2)
      const meta = readManifest(m2)
      if (meta) {
        out.push(makeEntry(lvl2, m2, 'copilot', 'discovered', meta))
      }
    }
  }
  return out
}

function scanClaude(): PluginEntry[] {
  const root = claudePluginRoot()
  const out: PluginEntry[] = []
  for (const dir of listChildDirs(root)) {
    const manifest = claudeManifestPath(dir)
    const meta = readManifest(manifest)
    if (!meta) continue
    out.push(makeEntry(dir, manifest, 'claude', 'discovered', meta))
  }
  return out
}

function makeEntry(
  dir: string,
  manifestPath: string,
  cli: PluginCli,
  source: PluginSource,
  meta: ManifestData
): PluginEntry {
  // Strip trailing path segment for default name display
  const fallbackName = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir
  return {
    id: dir,
    name: meta.name?.trim() || fallbackName,
    version: meta.version,
    description: meta.description,
    cli,
    source,
    enabled: false, // overridden by caller against store state
    path: dir,
    manifestPath,
  }
}

/**
 * Classify a custom path based on which manifest exists.
 * Returns null if neither manifest is present (caller should reject the add).
 * If both exist, prefer Copilot per plan ("Copilot's flat plugin.json is the more permissive shape").
 */
function classifyCustomPath(dir: string, requested: CustomPathCli): {
  cli: PluginCli
  manifestPath: string
  meta: ManifestData
} | null {
  const cMeta = readManifest(copilotManifestPath(dir))
  const claMeta = readManifest(claudeManifestPath(dir))

  if (requested === 'copilot') {
    if (!cMeta) return null
    return { cli: 'copilot', manifestPath: copilotManifestPath(dir), meta: cMeta }
  }
  if (requested === 'claude') {
    if (!claMeta) return null
    return { cli: 'claude', manifestPath: claudeManifestPath(dir), meta: claMeta }
  }
  // auto
  if (cMeta) return { cli: 'copilot', manifestPath: copilotManifestPath(dir), meta: cMeta }
  if (claMeta) return { cli: 'claude', manifestPath: claudeManifestPath(dir), meta: claMeta }
  return null
}

// ── PluginManager ────────────────────────────────────────────────────────────

export class PluginManager {
  private _store: Store<PluginStoreSchema> | null = null

  private get store(): Store<PluginStoreSchema> {
    if (!this._store) {
      this._store = new Store<PluginStoreSchema>({
        name: 'clear-path-plugins',
        encryptionKey: getStoreEncryptionKey(),
        defaults: {
          customPaths: [],
          enabled: { copilot: [], claude: [] },
          overrides: {},
        },
      })
    }
    return this._store
  }

  /** Read the enabled-paths state, defending against missing/partial store data. */
  private readEnabled(): { copilot: string[]; claude: string[] } {
    const raw = this.store.get('enabled') as Partial<{ copilot: string[]; claude: string[] }> | undefined
    return {
      copilot: Array.isArray(raw?.copilot) ? raw!.copilot : [],
      claude: Array.isArray(raw?.claude) ? raw!.claude : [],
    }
  }

  private readCustomPaths(): CustomPath[] {
    const raw = this.store.get('customPaths') as CustomPath[] | undefined
    return Array.isArray(raw) ? raw : []
  }

  /** Scan disk + custom paths and return the merged plugin list with enable state applied. */
  listPlugins(): PluginEntry[] {
    const enabled = this.readEnabled()
    const enabledCopilot = new Set(enabled.copilot)
    const enabledClaude = new Set(enabled.claude)

    const discovered: PluginEntry[] = [...scanCopilot(), ...scanClaude()]
    const discoveredPaths = new Set(discovered.map((p) => p.path))

    const customEntries: PluginEntry[] = []
    for (const cp of this.readCustomPaths()) {
      // Skip custom paths that duplicate a discovered plugin
      if (discoveredPaths.has(cp.path)) continue
      const cls = classifyCustomPath(cp.path, cp.cli)
      if (!cls) {
        log.warn(`[PluginManager] custom path ${cp.path} has no valid manifest — skipping`)
        continue
      }
      customEntries.push(makeEntry(cp.path, cls.manifestPath, cls.cli, 'custom', cls.meta))
    }

    const merged = [...discovered, ...customEntries]
    return merged.map((p) => ({
      ...p,
      enabled: p.cli === 'copilot' ? enabledCopilot.has(p.path) : enabledClaude.has(p.path),
    }))
  }

  /**
   * Add a custom local plugin path. Validates that at least one supported manifest is present.
   * Returns the resolved entry on success, or { error } if the path can't be classified.
   */
  addCustomPath(args: { path: string; cli: CustomPathCli }): { entry: PluginEntry } | { error: string } {
    const { path, cli } = args
    if (!existsSync(path)) return { error: 'Path does not exist' }
    let isDir = false
    try {
      isDir = statSync(path).isDirectory()
    } catch {
      return { error: 'Path is not accessible' }
    }
    if (!isDir) return { error: 'Path must be a directory' }

    const cls = classifyCustomPath(path, cli)
    if (!cls) {
      return {
        error: cli === 'auto'
          ? 'No plugin manifest found at this path (expected plugin.json or .claude-plugin/plugin.json)'
          : `No ${cli === 'copilot' ? 'plugin.json' : '.claude-plugin/plugin.json'} found at this path`,
      }
    }

    const customPaths = this.readCustomPaths()
    const existing = customPaths.find((c) => c.path === path)
    if (!existing) {
      customPaths.push({ path, cli })
      this.store.set('customPaths', customPaths)
    } else if (existing.cli !== cli) {
      existing.cli = cli
      this.store.set('customPaths', customPaths)
    }

    const enabled = this.readEnabled()
    const isEnabled = cls.cli === 'copilot'
      ? enabled.copilot.includes(path)
      : enabled.claude.includes(path)

    return {
      entry: {
        ...makeEntry(path, cls.manifestPath, cls.cli, 'custom', cls.meta),
        enabled: isEnabled,
      },
    }
  }

  removeCustomPath(path: string): void {
    const remaining = this.readCustomPaths().filter((c) => c.path !== path)
    this.store.set('customPaths', remaining)
    // Also drop from enabled lists so a removed custom path doesn't keep injecting --plugin-dir
    const enabled = this.readEnabled()
    this.store.set('enabled', {
      copilot: enabled.copilot.filter((p) => p !== path),
      claude: enabled.claude.filter((p) => p !== path),
    })
  }

  /** Replace the enabled list for a given CLI. */
  setEnabled(cli: PluginCli, paths: string[]): void {
    const enabled = this.readEnabled()
    enabled[cli] = Array.from(new Set(paths))
    this.store.set('enabled', enabled)
  }

  /**
   * Get the absolute paths of every enabled plugin for a CLI, filtered down to
   * those that still exist on disk (so a deleted plugin doesn't break spawn).
   */
  getEnabledPaths(cli: PluginCli): string[] {
    const enabled = this.readEnabled()
    const list = cli === 'copilot' ? enabled.copilot : enabled.claude
    return list.filter((p) => {
      try {
        return existsSync(p)
      } catch {
        return false
      }
    })
  }
}
