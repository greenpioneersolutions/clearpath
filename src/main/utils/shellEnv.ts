import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** Cached env with the login-shell PATH merged in. */
let _env: NodeJS.ProcessEnv | null = null

/**
 * Load the PATH from the user's login shell once and cache it.
 *
 * macOS GUI apps (including Electron) are NOT launched through a login shell,
 * so process.env.PATH is the bare system PATH — it's missing everything added
 * in ~/.zshrc / ~/.bashrc (nvm, homebrew, ~/.local/bin, etc.).
 *
 * Call this early (before any child-process spawning) and await it once.
 */
export async function initShellEnv(): Promise<void> {
  if (_env) return
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const { stdout } = await execFileAsync(shell, ['-l', '-c', 'echo $PATH'], {
      timeout: 8000,
    })
    _env = { ...process.env, PATH: stdout.trim() }
  } catch {
    _env = { ...process.env }
  }
}

/** Extra env vars to merge into every spawned process (set by settings). */
let _customEnv: Record<string, string> = {}

/** Called by settings handlers to inject custom env vars from electron-store. */
export function setCustomEnvVars(vars: Record<string, string>): void {
  _customEnv = { ...vars }
}

/**
 * Return an env object suitable for child-process spawning.
 * Falls back to process.env if initShellEnv() hasn't resolved yet.
 * Merges any custom env vars set via setCustomEnvVars().
 */
export function getSpawnEnv(): NodeJS.ProcessEnv {
  const base = _env ?? { ...process.env }
  // Only merge non-empty custom vars
  const extras: Record<string, string> = {}
  for (const [k, v] of Object.entries(_customEnv)) {
    if (v) extras[k] = v
  }
  return { ...base, ...extras }
}

// ── Scoped env per adapter (principle of least privilege) ──────────────────

/** Built-in fallback allowlist (used before dynamic entries are loaded). */
const BUILTIN_ADAPTER_ALLOWLIST: Record<string, string[]> = {
  copilot: ['GH_TOKEN', 'GITHUB_TOKEN', 'GITHUB_ASKPASS', 'COPILOT_CUSTOM_INSTRUCTIONS_DIRS'],
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_MODEL', 'ENABLE_TOOL_SEARCH'],
  local: [],
}

/** Dynamic env var entries with scope info. When set, overrides the static allowlist. */
interface EnvVarEntryMeta {
  key: string
  scope: 'global' | 'copilot' | 'claude' | 'local'
}
let _envVarEntries: EnvVarEntryMeta[] | null = null

/**
 * Called by settings handlers to provide dynamic scope metadata for env vars.
 * Once set, getScopedSpawnEnv uses these entries instead of the built-in allowlist.
 */
export function setEnvVarEntries(entries: EnvVarEntryMeta[]): void {
  _envVarEntries = entries
}

/** Determine if a custom env var key is allowed for a given CLI adapter. */
function isKeyAllowedForAdapter(key: string, cli: 'copilot' | 'claude' | 'local'): boolean {
  if (_envVarEntries) {
    const entry = _envVarEntries.find(e => e.key === key)
    if (!entry) return false
    return entry.scope === 'global' || entry.scope === cli
  }
  // Fallback to built-in allowlist
  return (BUILTIN_ADAPTER_ALLOWLIST[cli] ?? []).includes(key)
}

/** Return the set of all keys NOT allowed for a given adapter. */
function getDisallowedKeys(cli: 'copilot' | 'claude' | 'local'): Set<string> {
  const disallowed = new Set<string>()
  if (_envVarEntries) {
    for (const entry of _envVarEntries) {
      if (entry.scope !== 'global' && entry.scope !== cli) {
        disallowed.add(entry.key)
      }
    }
  } else {
    for (const [adapter, keys] of Object.entries(BUILTIN_ADAPTER_ALLOWLIST)) {
      if (adapter !== cli) {
        for (const key of keys) disallowed.add(key)
      }
    }
  }
  return disallowed
}

/**
 * Return a scoped env for a specific CLI adapter.
 * Only includes secrets the adapter actually needs, reducing blast radius
 * if a child process is compromised.
 */
export function getScopedSpawnEnv(cli: 'copilot' | 'claude' | 'local'): NodeJS.ProcessEnv {
  const base = _env ?? { ...process.env }
  const result: Record<string, string | undefined> = { ...base }

  // Only merge custom env vars that this adapter is allowed to see
  for (const [k, v] of Object.entries(_customEnv)) {
    if (v && isKeyAllowedForAdapter(k, cli)) {
      result[k] = v
    }
  }

  // Scrub secrets that don't belong to this adapter from the base env
  const disallowed = getDisallowedKeys(cli)
  for (const key of disallowed) {
    if (_customEnv[key]) {
      delete result[key]
    }
  }

  return result
}

/**
 * Resolve a binary name using the login-shell PATH.
 * Runs `which <name>` through the login shell so ~/.local/bin, nvm, etc. are searched.
 */
export async function resolveInShell(name: string): Promise<string | null> {
  // Validate binary name — only allow alphanumeric, dashes, underscores, and dots.
  // This prevents shell injection via the binary name parameter.
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return null
  }

  const shell = process.env.SHELL || '/bin/zsh'
  try {
    // Use positional parameter passing ($1) to avoid interpolation of the name
    // into the shell command string — prevents injection even for valid-looking names.
    const { stdout } = await execFileAsync(shell, ['-l', '-c', 'command -v "$1"', 'sh', name], {
      timeout: 8000,
    })
    const line = stdout.trim().split('\n')[0]
    if (line && line.startsWith('/')) {
      return line
    }
  } catch {
    // fall through
  }
  return null
}
