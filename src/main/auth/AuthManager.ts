import { spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ChildProcess } from 'child_process'
import type { WebContents } from 'electron'
import Store from 'electron-store'
import type { AuthStatus, AuthState, TokenSource } from '../../renderer/src/types/ipc'
import { resolveInShell, getSpawnEnv } from '../utils/shellEnv'

const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-9;]*[ -/]*[@-~])/g

const AUTH_CACHE_TTL    = 5  * 60 * 1000  // 5 min
const INSTALL_CACHE_TTL = 10 * 60 * 1000  // 10 min

interface StoreSchema {
  authCache: AuthState
}

const EMPTY_STATUS: AuthStatus = { installed: false, authenticated: false, checkedAt: 0 }

export class AuthManager {
  private readonly getWebContents: () => WebContents | null
  private activeLogin: ChildProcess | null = null
  private activeLoginCli: 'copilot' | 'claude' | null = null
  private _store: Store<StoreSchema> | null = null

  private get store(): Store<StoreSchema> {
    if (!this._store) {
      this._store = new Store<StoreSchema>({
        name: 'clear-path-auth',
        defaults: { authCache: { copilot: { ...EMPTY_STATUS }, claude: { ...EMPTY_STATUS } } },
      })
    }
    return this._store
  }

  constructor(getWebContents: () => WebContents | null) {
    this.getWebContents = getWebContents
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async getStatus(forceRefresh = false): Promise<AuthState> {
    const cache = this.store.get('authCache')
    const now = Date.now()

    if (!forceRefresh && cache.copilot.checkedAt && cache.claude.checkedAt) {
      const copilotFresh = now - cache.copilot.checkedAt <
        (cache.copilot.installed ? AUTH_CACHE_TTL : INSTALL_CACHE_TTL)
      const claudeFresh  = now - cache.claude.checkedAt  <
        (cache.claude.installed  ? AUTH_CACHE_TTL : INSTALL_CACHE_TTL)
      if (copilotFresh && claudeFresh) return cache
    }

    return this.refresh()
  }

  async refresh(): Promise<AuthState> {
    const [copilot, claude] = await Promise.all([
      this.checkCopilot(),
      this.checkClaude(),
    ])
    const state: AuthState = { copilot, claude }
    this.store.set('authCache', state)

    const wc = this.getWebContents()
    if (wc && !wc.isDestroyed()) wc.send('auth:status-changed', state)

    return state
  }

  startLogin(cli: 'copilot' | 'claude'): void {
    this.cancelLogin()
    if (cli === 'copilot') this.loginCopilot()
    else this.loginClaude()
  }

  cancelLogin(): void {
    if (this.activeLogin) {
      this.activeLogin.kill('SIGTERM')
      this.activeLogin = null
      this.activeLoginCli = null
    }
  }

  // ── Install + auth checks ──────────────────────────────────────────────────

  private async checkCopilot(): Promise<AuthStatus> {
    // Use login-shell `which` so ~/.local/bin, nvm, etc. are searched
    const binaryPath = await resolveInShell('copilot')
    if (!binaryPath) return { ...EMPTY_STATUS, checkedAt: Date.now() }

    // Version: quick confirmation the binary is runnable
    let version: string | undefined
    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(execFile)
      const { stdout } = await execAsync(binaryPath, ['--version'], {
        timeout: 5000,
        env: getSpawnEnv(),
      })
      version = stdout.trim().split('\n')[0]
    } catch { /* not critical */ }

    // Auth: env token takes precedence (CI/CD)
    let authenticated = false
    let tokenSource: TokenSource | undefined

    if (process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN']) {
      authenticated = true
      tokenSource = 'env-var'
    } else {
      // ── FIX: correct filename is config.json, not config ──
      const configPath = join(homedir(), '.copilot', 'config.json')
      if (existsSync(configPath)) {
        try {
          const raw = readFileSync(configPath, 'utf8')
          // ── FIX: check logged_in_users[], not access_token ──
          const parsed = JSON.parse(raw) as Record<string, unknown>
          const users = parsed['logged_in_users']
          if (Array.isArray(users) && users.length > 0) {
            authenticated = true
            tokenSource = 'config-file'
          }
        } catch { /* malformed JSON — treat as unauthenticated */ }
      }
    }

    return { installed: true, authenticated, binaryPath, version, tokenSource, checkedAt: Date.now() }
  }

  private async checkClaude(): Promise<AuthStatus> {
    const binaryPath = await resolveInShell('claude')
    if (!binaryPath) return { ...EMPTY_STATUS, checkedAt: Date.now() }

    let version: string | undefined
    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(execFile)
      const { stdout } = await execAsync(binaryPath, ['--version'], {
        timeout: 5000,
        env: getSpawnEnv(),
      })
      version = stdout.trim().split('\n')[0]
    } catch { /* not critical */ }

    let authenticated = false
    let tokenSource: TokenSource | undefined

    if (process.env['ANTHROPIC_API_KEY']) {
      authenticated = true
      tokenSource = 'env-var'
    } else {
      try {
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const execAsync = promisify(execFile)
        const { stdout, stderr } = await execAsync(binaryPath, ['auth', 'status'], {
          timeout: 10_000,
          env: getSpawnEnv(),
        })
        const out = (stdout + stderr).toLowerCase().replace(ANSI_RE, '')
        if (
          out.includes('logged in') ||
          out.includes('authenticated') ||
          /\S+@\S+\.\S+/.test(out)
        ) {
          authenticated = true
          tokenSource = 'auth-status'
        }
      } catch { /* fall through */ }

      if (!authenticated) {
        const claudeDir = join(homedir(), '.claude')
        for (const file of ['.credentials.json', 'auth.json', 'credentials.json']) {
          if (existsSync(join(claudeDir, file))) {
            authenticated = true
            tokenSource = 'config-file'
            break
          }
        }
      }
    }

    return { installed: true, authenticated, binaryPath, version, tokenSource, checkedAt: Date.now() }
  }

  // ── Login flows ────────────────────────────────────────────────────────────

  private loginCopilot(): void {
    const wc = this.getWebContents()
    const emit = (line: string) => { if (!wc || wc.isDestroyed()) return; wc.send('auth:login-output', { cli: 'copilot', line }) }

    // Resolve the binary using the full login-shell PATH at login time
    void resolveInShell('copilot').then((binaryPath) => {
      if (!binaryPath) {
        emit('Error: copilot binary not found. Is GitHub Copilot CLI installed?')
        if (!wc || wc.isDestroyed()) return
        wc.send('auth:login-complete', { cli: 'copilot', success: false, error: 'binary not found' })
        return
      }

      const proc = spawn(binaryPath, ['--no-experimental'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: getSpawnEnv(),
      })

      this.activeLogin = proc
      this.activeLoginCli = 'copilot'

      let loginCommandSent = false
      const sendLogin = () => {
        if (!loginCommandSent) {
          loginCommandSent = true
          proc.stdin?.write('/login\n')
          emit('Sending /login command…')
        }
      }

      const startupTimer = setTimeout(sendLogin, 2000)

      const onData = (chunk: Buffer) => {
        sendLogin() // trigger as soon as any output arrives
        for (const line of chunk.toString().split('\n')) {
          const stripped = line.replace(ANSI_RE, '').trim()
          if (stripped) emit(stripped)
        }
      }

      proc.stdout?.on('data', onData)
      proc.stderr?.on('data', onData)

      proc.on('exit', (code) => {
        clearTimeout(startupTimer)
        this.activeLogin = null
        this.activeLoginCli = null
        const success = code === 0
        if (success) void this.refresh()
        if (!wc || wc.isDestroyed()) return
        wc.send('auth:login-complete', { cli: 'copilot', success })
      })

      proc.on('error', (err) => {
        clearTimeout(startupTimer)
        emit(`Process error: ${err.message}`)
        if (!wc || wc.isDestroyed()) return
        wc.send('auth:login-complete', { cli: 'copilot', success: false, error: err.message })
      })
    })
  }

  private loginClaude(): void {
    const wc = this.getWebContents()
    const emit = (line: string) => { if (!wc || wc.isDestroyed()) return; wc.send('auth:login-output', { cli: 'claude', line }) }

    void resolveInShell('claude').then((binaryPath) => {
      if (!binaryPath) {
        emit('Error: claude binary not found. Is Claude Code CLI installed?')
        if (!wc || wc.isDestroyed()) return
        wc.send('auth:login-complete', { cli: 'claude', success: false, error: 'binary not found' })
        return
      }

      const proc = spawn(binaryPath, ['auth', 'login'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: getSpawnEnv(),
      })

      this.activeLogin = proc
      this.activeLoginCli = 'claude'

      const onData = (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          const stripped = line.replace(ANSI_RE, '').trim()
          if (stripped) emit(stripped)
        }
      }

      proc.stdout?.on('data', onData)
      proc.stderr?.on('data', onData)

      proc.on('exit', (code) => {
        this.activeLogin = null
        this.activeLoginCli = null
        const success = code === 0
        if (success) void this.refresh()
        if (!wc || wc.isDestroyed()) return
        wc.send('auth:login-complete', { cli: 'claude', success })
      })

      proc.on('error', (err) => {
        emit(`Process error: ${err.message}`)
        if (!wc || wc.isDestroyed()) return
        wc.send('auth:login-complete', { cli: 'claude', success: false, error: err.message })
      })
    })
  }
}
