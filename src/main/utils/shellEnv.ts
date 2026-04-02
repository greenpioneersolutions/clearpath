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

/**
 * Resolve a binary name using the login-shell PATH.
 * Runs `which <name>` through the login shell so ~/.local/bin, nvm, etc. are searched.
 */
export async function resolveInShell(name: string): Promise<string | null> {
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const { stdout } = await execFileAsync(shell, ['-l', '-c', `which ${name}`], {
      timeout: 8000,
    })
    const line = stdout.trim().split('\n')[0]
    // `which` on zsh prints "name not found" or similar on failure
    if (line && !line.includes('not found') && !line.includes('which:') && line.startsWith('/')) {
      return line
    }
  } catch {
    // fall through
  }
  return null
}
