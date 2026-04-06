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

/** Env vars allowed per CLI adapter — only pass secrets each adapter actually needs. */
const ADAPTER_ENV_ALLOWLIST: Record<string, string[]> = {
  copilot: ['GH_TOKEN', 'GITHUB_TOKEN', 'GITHUB_ASKPASS', 'COPILOT_CUSTOM_INSTRUCTIONS_DIRS'],
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_MODEL', 'ENABLE_TOOL_SEARCH'],
  local: [], // Local models don't need any secrets
}

/**
 * Return a scoped env for a specific CLI adapter.
 * Only includes secrets the adapter actually needs, reducing blast radius
 * if a child process is compromised.
 */
export function getScopedSpawnEnv(cli: 'copilot' | 'claude' | 'local'): NodeJS.ProcessEnv {
  const base = _env ?? { ...process.env }
  const allowedKeys = new Set(ADAPTER_ENV_ALLOWLIST[cli] ?? [])
  const result: Record<string, string | undefined> = { ...base }

  // Only merge custom env vars that this adapter is allowed to see
  for (const [k, v] of Object.entries(_customEnv)) {
    if (v && allowedKeys.has(k)) {
      result[k] = v
    }
  }

  // Scrub secrets that don't belong to this adapter from the base env
  for (const [adapter, keys] of Object.entries(ADAPTER_ENV_ALLOWLIST)) {
    if (adapter === cli) continue
    for (const key of keys) {
      // Only remove if it was added by our custom env, not if it was in the system env
      // (system env vars are the user's responsibility)
      if (_customEnv[key] && !allowedKeys.has(key)) {
        delete result[key]
      }
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
