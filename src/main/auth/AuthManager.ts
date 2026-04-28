import { spawn } from 'child_process'
import { existsSync, readFileSync, createWriteStream, mkdtempSync, unlinkSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { request } from 'https'
import type { IncomingMessage } from 'http'
import type { ChildProcess } from 'child_process'
import type { WebContents } from 'electron'
import { shell } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import type { AuthStatus, AuthState, ProviderAuthState, TokenSource } from '../../renderer/src/types/ipc'
import type {
  InstallError,
  InstallErrorCode,
  InstallTarget,
  NodeCheckResult,
} from '../../renderer/src/types/install'
import { resolveInShell, getScopedSpawnEnv, getSpawnEnv } from '../utils/shellEnv'
import { parseBrowserUrl } from './urlDetector'
import {
  canResolveClaudeSdk,
  getAnthropicApiKey,
  getGitHubToken,
  probeAnthropicKey,
  probeGitHubToken,
} from './SdkAuthProbe'

const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-9;]*[ -/]*[@-~])/g

const AUTH_CACHE_TTL    = 5  * 60 * 1000  // 5 min
const INSTALL_CACHE_TTL = 10 * 60 * 1000  // 10 min
const NODE_CACHE_TTL    = 5  * 60 * 1000  // 5 min

const COPILOT_NPM_PACKAGE = '@github/copilot'
const CLAUDE_NPM_PACKAGE  = '@anthropic-ai/claude-code'

/** Pinned hostname for the Node.js .pkg download — prevents MITM via env tampering. */
const NODE_DOWNLOAD_HOST = 'nodejs.org'
/** The LTS series we require (Copilot CLI needs Node 22+). */
const NODE_PKG_URL = 'https://nodejs.org/dist/latest-v22.x/node-v22.x.pkg'
/** Lookup page we'll query to get the exact latest-v22 filename. */
const NODE_INDEX_URL = 'https://nodejs.org/dist/latest-v22.x/'

interface StoreSchema {
  authCache: AuthState
  nodeCheckCache?: { result: NodeCheckResult; checkedAt: number }
  nodeInstallAttempted?: boolean
}

const EMPTY_STATUS: AuthStatus = { installed: false, authenticated: false, checkedAt: 0 }

/**
 * Build a ProviderAuthState by projecting the `cli` status onto the top-level
 * compat fields. Older renderer code that reads `state.copilot.installed`
 * continues to see the CLI status; newer code reads `state.copilot.cli` /
 * `state.copilot.sdk` directly. Phase 5 removes the compat fields.
 */
function buildProviderState(cli: AuthStatus, sdk: AuthStatus): ProviderAuthState {
  return { ...cli, cli, sdk }
}

const EMPTY_PROVIDER_STATE: ProviderAuthState = buildProviderState(EMPTY_STATUS, EMPTY_STATUS)

export class AuthManager {
  private readonly getWebContents: () => WebContents | null
  private activeLogin: ChildProcess | null = null
  private activeLoginCli: 'copilot' | 'claude' | null = null
  /** Tracks in-progress install child processes, keyed by target. */
  private activeInstalls: Map<InstallTarget, ChildProcess> = new Map()
  private _store: Store<StoreSchema> | null = null

  private get store(): Store<StoreSchema> {
    if (!this._store) {
      this._store = new Store<StoreSchema>({
        name: 'clear-path-auth',
        encryptionKey: getStoreEncryptionKey(),
        defaults: { authCache: { copilot: { ...EMPTY_PROVIDER_STATE }, claude: { ...EMPTY_PROVIDER_STATE } } },
      })
    }
    return this._store
  }

  constructor(getWebContents: () => WebContents | null) {
    this.getWebContents = getWebContents
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async getStatus(forceRefresh = false): Promise<AuthState> {
    const cache = this.migrateCache(this.store.get('authCache'))
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

  /**
   * Upgrade a cache entry from the pre-SDK shape (just the top-level AuthStatus
   * fields) to the new ProviderAuthState. Idempotent — if `.cli` / `.sdk` are
   * already set we return as-is.
   */
  private migrateCache(cache: AuthState): AuthState {
    const upgrade = (s: AuthStatus | ProviderAuthState): ProviderAuthState => {
      const p = s as Partial<ProviderAuthState>
      if (p.cli && p.sdk) return s as ProviderAuthState
      // The legacy flat status becomes the `cli` entry; `sdk` starts empty and
      // gets filled on the next refresh().
      return buildProviderState(s as AuthStatus, { ...EMPTY_STATUS })
    }
    return { copilot: upgrade(cache.copilot), claude: upgrade(cache.claude) }
  }

  async refresh(): Promise<AuthState> {
    const [copilotCli, claudeCli, copilotSdk, claudeSdk] = await Promise.all([
      this.checkCopilot(),
      this.checkClaude(),
      this.checkCopilotSdk(),
      this.checkClaudeSdk(),
    ])
    const state: AuthState = {
      copilot: buildProviderState(copilotCli, copilotSdk),
      claude:  buildProviderState(claudeCli,  claudeSdk),
    }
    this.store.set('authCache', state)

    const wc = this.getWebContents()
    if (wc && !wc.isDestroyed()) wc.send('auth:status-changed', state)

    return state
  }

  /**
   * Invalidate the cached install/auth status for a single CLI.
   * Called after install completes so the next getStatus() does a fresh check.
   */
  invalidateCache(cli: 'copilot' | 'claude' | 'all' = 'all'): void {
    const cache = this.store.get('authCache')
    if (cli === 'copilot' || cli === 'all') {
      cache.copilot = { ...EMPTY_PROVIDER_STATE }
    }
    if (cli === 'claude' || cli === 'all') {
      cache.claude = { ...EMPTY_PROVIDER_STATE }
    }
    this.store.set('authCache', cache)
  }

  // ── SDK auth probes ────────────────────────────────────────────────────────

  /**
   * Copilot SDK auth status. The Copilot SDK runs via `copilot --acp`, so
   * "installed" still requires the CLI binary — but auth is gated by a valid
   * GitHub token instead of the CLI's login flow.
   */
  private async checkCopilotSdk(): Promise<AuthStatus> {
    const checkedAt = Date.now()
    const token = getGitHubToken()
    if (!token) return { installed: false, authenticated: false, checkedAt }
    // Require the CLI binary too, since ACP is served by it.
    const binaryPath = await resolveInShell('copilot')
    const installed = !!binaryPath
    const authenticated = installed && await probeGitHubToken(token)
    return { installed, authenticated, binaryPath: binaryPath ?? undefined, tokenSource: 'env-var', checkedAt }
  }

  /**
   * Claude SDK auth status. Independent of the `claude` binary — uses the
   * `@anthropic-ai/claude-agent-sdk` package + an API key probe.
   */
  private async checkClaudeSdk(): Promise<AuthStatus> {
    const checkedAt = Date.now()
    const installed = canResolveClaudeSdk() && !!getAnthropicApiKey()
    if (!installed) return { installed, authenticated: false, checkedAt }
    const authenticated = await probeAnthropicKey()
    return { installed, authenticated, tokenSource: 'env-var', checkedAt }
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
        env: getScopedSpawnEnv('copilot'),
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
          const parsed = JSON.parse(raw) as Record<string, unknown>
          // Copilot CLI stores logged-in accounts under `loggedInUsers`
          // (camelCase). Older builds wrote `logged_in_users` — accept both
          // so users on either version are detected as authenticated.
          const users = parsed['loggedInUsers'] ?? parsed['logged_in_users']
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
        env: getScopedSpawnEnv('claude'),
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
          env: getScopedSpawnEnv('claude'),
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

  // ── Node.js detection ──────────────────────────────────────────────────────

  /**
   * Check if Node.js is installed and meets the version requirement (>= 22).
   * Result is cached for 5 minutes.
   */
  async checkNode(forceRefresh = false): Promise<NodeCheckResult> {
    if (!forceRefresh) {
      const cached = this.store.get('nodeCheckCache')
      if (cached && Date.now() - cached.checkedAt < NODE_CACHE_TTL) {
        return cached.result
      }
    }

    const platform = this.detectPlatform()
    const nodePath = await resolveInShell('node')

    if (!nodePath) {
      const result: NodeCheckResult = { installed: false, satisfies22: false, platform }
      this.store.set('nodeCheckCache', { result, checkedAt: Date.now() })
      return result
    }

    let version: string | undefined
    let satisfies22 = false
    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(execFile)
      const { stdout } = await execAsync(nodePath, ['--version'], {
        timeout: 5000,
        env: getSpawnEnv(),
      })
      version = stdout.trim().replace(/^v/, '')
      const major = parseInt(version.split('.')[0] ?? '0', 10)
      satisfies22 = Number.isFinite(major) && major >= 22
    } catch { /* keep satisfies22 false */ }

    const result: NodeCheckResult = { installed: true, version, satisfies22, platform }
    this.store.set('nodeCheckCache', { result, checkedAt: Date.now() })
    return result
  }

  private detectPlatform(): NodeCheckResult['platform'] {
    if (process.platform === 'darwin') return 'darwin'
    if (process.platform === 'win32') return 'win32'
    if (process.platform === 'linux') return 'linux'
    return 'other'
  }

  // ── CLI install flows ──────────────────────────────────────────────────────

  /** Install GitHub Copilot CLI via `npm install -g @github/copilot`. */
  installCopilot(): void {
    this.installNpmPackage('copilot', COPILOT_NPM_PACKAGE)
  }

  /** Install Claude Code CLI via `npm install -g @anthropic-ai/claude-code`. */
  installClaude(): void {
    this.installNpmPackage('claude', CLAUDE_NPM_PACKAGE)
  }

  /** Kill an in-progress install for the given target. */
  cancelInstall(target: InstallTarget): void {
    const proc = this.activeInstalls.get(target)
    if (proc) {
      proc.kill('SIGTERM')
      this.activeInstalls.delete(target)
    }
  }

  private installNpmPackage(target: 'copilot' | 'claude', pkg: string): void {
    // If something is already installing this target, cancel it first
    this.cancelInstall(target)

    const emitOutput = (line: string) => this.sendInstallOutput(target, line)
    const emitComplete = (success: boolean, error?: InstallError) =>
      this.sendInstallComplete(target, success, error)

    // Resolve npm inside the login shell (handles nvm / asdf / homebrew paths).
    void resolveInShell('npm').then((npmPath) => {
      if (!npmPath) {
        emitOutput('Node.js / npm was not found on this computer.')
        emitComplete(false, {
          code: 'NODE_MISSING',
          message: 'npm binary not found on PATH',
          hint: 'Install Node.js 22 or newer, then try again.',
        })
        return
      }

      emitOutput(`Installing ${pkg} (this can take a minute)…`)

      const proc = spawn(npmPath, ['install', '-g', pkg], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: getSpawnEnv(),
      })
      this.activeInstalls.set(target, proc)

      // Buffer output so we can classify errors at exit time.
      let combinedOutput = ''

      const onData = (chunk: Buffer) => {
        const text = chunk.toString()
        combinedOutput += text
        for (const line of text.split('\n')) {
          const stripped = line.replace(ANSI_RE, '').trim()
          if (stripped) emitOutput(stripped)
        }
      }
      proc.stdout?.on('data', onData)
      proc.stderr?.on('data', onData)

      proc.on('error', (err) => {
        this.activeInstalls.delete(target)
        emitOutput(`Install error: ${err.message}`)
        emitComplete(false, this.classifyInstallError(err.message, combinedOutput))
      })

      proc.on('exit', (code) => {
        this.activeInstalls.delete(target)
        if (code === 0) {
          // Invalidate install/auth cache so the next status check sees the new binary
          this.invalidateCache(target)
          emitOutput('Install complete.')
          emitComplete(true)
          // Proactively refresh so the UI updates immediately
          void this.refresh()
        } else {
          emitComplete(false, this.classifyInstallError(`npm exited with code ${code}`, combinedOutput))
        }
      })
    })
  }

  /**
   * Classify install failure output into a user-friendly error code + hint.
   * Kept as a method (not a free function) so tests can exercise it via the class.
   */
  classifyInstallError(errorText: string, combinedOutput = ''): InstallError {
    const haystack = (errorText + '\n' + combinedOutput).toLowerCase()

    // Permission denied (global npm install often needs sudo on Linux / macOS with system node)
    if (
      haystack.includes('eacces') ||
      haystack.includes('permission denied') ||
      haystack.includes('operation not permitted')
    ) {
      return {
        code: 'EACCES',
        message: 'Install was blocked by a permissions error.',
        hint: 'Your Node.js install may require administrator rights. Try using Homebrew or nvm to manage Node, then try again.',
      }
    }

    // Network / DNS / registry problems
    if (
      haystack.includes('enotfound') ||
      haystack.includes('etimedout') ||
      haystack.includes('econnreset') ||
      haystack.includes('econnrefused') ||
      haystack.includes('network') ||
      haystack.includes('registry.npmjs') ||
      haystack.includes('unable to resolve host')
    ) {
      return {
        code: 'NETWORK',
        message: 'Could not reach the npm registry.',
        hint: 'Check your internet connection and try again. If you are behind a proxy, configure it in your system settings.',
      }
    }

    // Node missing / too old
    if (
      haystack.includes('enoent') && (haystack.includes('npm') || haystack.includes('node')) ||
      haystack.includes('engines') ||
      haystack.includes('unsupported engine')
    ) {
      return {
        code: 'NODE_MISSING',
        message: 'Node.js 22 or newer is required.',
        hint: 'Install Node.js 22 (LTS) and try again.',
      }
    }

    return {
      code: 'UNKNOWN',
      message: 'The install did not complete.',
      hint: 'See the install details for more information. You can try again, or install manually from a terminal.',
    }
  }

  // ── Managed Node install ──────────────────────────────────────────────────

  /**
   * Install Node.js 22 using the platform's native package manager.
   * - macOS: download the official `.pkg` from nodejs.org and `open` it in Installer.app
   * - Windows: `winget install -e --id OpenJS.NodeJS.LTS`
   * - Linux: not supported (returns NODE_MISSING error — user must install manually)
   */
  installNodeManaged(): void {
    const target: InstallTarget = 'node'
    this.cancelInstall(target)

    const emitOutput = (line: string) => this.sendInstallOutput(target, line)
    const emitComplete = (success: boolean, error?: InstallError) =>
      this.sendInstallComplete(target, success, error)

    this.store.set('nodeInstallAttempted', true)

    const platform = this.detectPlatform()

    if (platform === 'win32') {
      this.installNodeWindows(emitOutput, emitComplete)
    } else if (platform === 'darwin') {
      void this.installNodeMacOS(emitOutput, emitComplete)
    } else {
      emitOutput('Automatic Node.js install is not available on this platform.')
      emitComplete(false, {
        code: 'UNKNOWN',
        message: 'Managed Node install not supported on Linux or other platforms.',
        hint: 'Please install Node.js 22+ manually, then try again.',
      })
    }
  }

  private installNodeWindows(
    emitOutput: (line: string) => void,
    emitComplete: (success: boolean, error?: InstallError) => void,
  ): void {
    emitOutput('Starting Windows installer for Node.js (winget)…')
    emitOutput('You may see a UAC prompt — click Yes to allow the install.')

    const proc = spawn(
      'winget',
      [
        'install',
        '-e',
        '--id', 'OpenJS.NodeJS.LTS',
        '--accept-source-agreements',
        '--accept-package-agreements',
      ],
      { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: getSpawnEnv() },
    )
    this.activeInstalls.set('node', proc)

    let combined = ''
    const onData = (chunk: Buffer) => {
      const text = chunk.toString()
      combined += text
      for (const line of text.split('\n')) {
        const stripped = line.replace(ANSI_RE, '').trim()
        if (stripped) emitOutput(stripped)
      }
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)

    proc.on('error', (err) => {
      this.activeInstalls.delete('node')
      emitOutput(`Install error: ${err.message}`)
      emitComplete(false, this.classifyInstallError(err.message, combined))
    })

    proc.on('exit', (code) => {
      this.activeInstalls.delete('node')
      if (code === 0) {
        emitOutput('Node.js installed. You may need to restart the app to see it.')
        // Invalidate the Node cache so the next check re-detects
        this.store.delete('nodeCheckCache')
        emitComplete(true)
      } else {
        emitComplete(false, this.classifyInstallError(`winget exited with code ${code}`, combined))
      }
    })
  }

  private async installNodeMacOS(
    emitOutput: (line: string) => void,
    emitComplete: (success: boolean, error?: InstallError) => void,
  ): Promise<void> {
    emitOutput('Downloading the Node.js installer from nodejs.org…')

    try {
      // Step 1: find the exact .pkg filename in the latest-v22.x directory
      const pkgFilename = await this.fetchLatestNodePkgFilename()
      if (!pkgFilename) {
        emitComplete(false, {
          code: 'NETWORK',
          message: 'Could not find the Node.js installer on nodejs.org.',
          hint: 'Check your internet connection and try again. You can also install manually from https://nodejs.org.',
        })
        return
      }

      emitOutput(`Found installer: ${pkgFilename}`)

      // Step 2: download to a temp file with Content-Length verification
      const tmpDir = mkdtempSync(join(tmpdir(), 'clearpath-node-'))
      const pkgPath = join(tmpDir, pkgFilename)
      const downloadUrl = `https://${NODE_DOWNLOAD_HOST}/dist/latest-v22.x/${pkgFilename}`

      await this.downloadPkg(downloadUrl, pkgPath, emitOutput)

      emitOutput('Opening Installer.app — enter your password when prompted.')

      // Step 3: launch `open` to hand the .pkg to Apple's native installer
      const openProc = spawn('open', ['-W', pkgPath], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: getSpawnEnv(),
      })
      this.activeInstalls.set('node', openProc)

      openProc.on('error', (err) => {
        this.activeInstalls.delete('node')
        try { unlinkSync(pkgPath) } catch { /* best effort */ }
        emitComplete(false, this.classifyInstallError(err.message))
      })

      openProc.on('exit', (code) => {
        this.activeInstalls.delete('node')
        try { unlinkSync(pkgPath) } catch { /* best effort */ }
        if (code === 0) {
          emitOutput('Installer finished. Checking Node.js…')
          this.store.delete('nodeCheckCache')
          emitComplete(true)
        } else {
          emitComplete(false, {
            code: 'UNKNOWN',
            message: 'The Node.js installer did not complete.',
            hint: 'Try again, or install manually from https://nodejs.org.',
          })
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emitOutput(`Download failed: ${msg}`)
      emitComplete(false, this.classifyInstallError(msg))
    }
  }

  /** Fetch the nodejs.org/dist/latest-v22.x/ index and find the macOS .pkg filename. */
  private fetchLatestNodePkgFilename(): Promise<string | null> {
    return new Promise((resolve) => {
      const req = request(
        NODE_INDEX_URL,
        {
          method: 'GET',
          headers: { 'User-Agent': 'clear-path-app' },
          timeout: 15000,
        },
        (res: IncomingMessage) => {
          if (res.statusCode !== 200) {
            res.resume()
            resolve(null)
            return
          }
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (c: string) => { body += c })
          res.on('end', () => {
            // macOS .pkg filename pattern: node-v22.*.pkg
            const m = body.match(/href="(node-v22\.[^"]*\.pkg)"/)
            resolve(m ? m[1] : null)
          })
        },
      )
      req.on('error', () => resolve(null))
      req.on('timeout', () => {
        req.destroy()
        resolve(null)
      })
      req.end()
    })
  }

  /**
   * Download a .pkg over HTTPS to the given path.
   * Verifies Content-Length matches the bytes received. Throws on failure.
   * Hostname is validated against NODE_DOWNLOAD_HOST to prevent redirect hijack.
   */
  private downloadPkg(
    url: string,
    destPath: string,
    emitOutput: (line: string) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Pin hostname — reject any URL that doesn't start with the expected prefix.
      if (!url.startsWith(`https://${NODE_DOWNLOAD_HOST}/`)) {
        reject(new Error(`Invalid download URL host (expected ${NODE_DOWNLOAD_HOST})`))
        return
      }

      const req = request(
        url,
        { method: 'GET', headers: { 'User-Agent': 'clear-path-app' }, timeout: 60000 },
        (res: IncomingMessage) => {
          if (res.statusCode !== 200) {
            res.resume()
            reject(new Error(`HTTP ${res.statusCode} from nodejs.org`))
            return
          }

          const expectedLen = parseInt(res.headers['content-length'] ?? '0', 10)
          if (!Number.isFinite(expectedLen) || expectedLen <= 0) {
            res.resume()
            reject(new Error('Missing Content-Length header'))
            return
          }

          const file = createWriteStream(destPath)
          let received = 0
          let lastPct = -1

          res.on('data', (chunk: Buffer) => {
            received += chunk.length
            const pct = Math.floor((received / expectedLen) * 100)
            if (pct >= lastPct + 10 && pct <= 100) {
              lastPct = pct
              emitOutput(`Downloading… ${pct}%`)
            }
          })

          res.pipe(file)

          file.on('finish', () => {
            file.close(() => {
              if (received !== expectedLen) {
                try { unlinkSync(destPath) } catch { /* best effort */ }
                reject(new Error(`Download size mismatch: got ${received}, expected ${expectedLen}`))
                return
              }
              resolve()
            })
          })
          file.on('error', (err) => {
            try { unlinkSync(destPath) } catch { /* best effort */ }
            reject(err)
          })
        },
      )
      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Download timed out'))
      })
      req.end()
    })
  }

  // ── IPC event helpers ──────────────────────────────────────────────────────

  private sendInstallOutput(target: InstallTarget, line: string): void {
    const wc = this.getWebContents()
    if (!wc || wc.isDestroyed()) return
    wc.send('auth:install-output', { target, line })
  }

  private sendInstallComplete(target: InstallTarget, success: boolean, error?: InstallError): void {
    const wc = this.getWebContents()
    if (!wc || wc.isDestroyed()) return
    wc.send('auth:install-complete', { target, success, error })
  }

  /**
   * Validate + open a URL in the system browser.
   * Only https:// URLs are allowed — returns false otherwise.
   */
  openExternalUrl(url: string): boolean {
    if (typeof url !== 'string' || !url.startsWith('https://')) return false
    // Best-effort — shell.openExternal returns a Promise but we don't await it here
    void shell.openExternal(url)
    return true
  }

  // ── Login flows ────────────────────────────────────────────────────────────

  private loginCopilot(): void {
    this.runLoginFlow('copilot', () => ({
      command: (binaryPath: string) => ({ cmd: binaryPath, args: ['--no-experimental'] }),
      sendLoginCommand: true,
    }))
  }

  private loginClaude(): void {
    this.runLoginFlow('claude', () => ({
      command: (binaryPath: string) => ({ cmd: binaryPath, args: ['auth', 'login'] }),
      sendLoginCommand: false,
    }))
  }

  /**
   * Shared implementation for copilot / claude login. Handles:
   * - Binary resolution via login-shell PATH
   * - Process spawn + stdout/stderr streaming
   * - First-URL browser auto-open via shell.openExternal (once per session)
   * - ANSI stripping
   * - Exit/error reporting
   */
  private runLoginFlow(
    cli: 'copilot' | 'claude',
    configFactory: () => {
      command: (binaryPath: string) => { cmd: string; args: string[] }
      sendLoginCommand: boolean
    },
  ): void {
    const wc = this.getWebContents()
    const emit = (line: string) => {
      if (!wc || wc.isDestroyed()) return
      wc.send('auth:login-output', { cli, line })
    }

    // Track whether we've already opened a browser for this login attempt,
    // so running login twice doesn't spam the user with duplicate tabs.
    let browserOpened = false
    const maybeOpenBrowser = (line: string) => {
      if (browserOpened) return
      const url = parseBrowserUrl(line, cli)
      if (!url) return
      if (!this.openExternalUrl(url)) return
      browserOpened = true
      if (wc && !wc.isDestroyed()) {
        wc.send('auth:login-browser-opened', { cli, url })
      }
    }

    void resolveInShell(cli).then((binaryPath) => {
      if (!binaryPath) {
        emit(`Error: ${cli} binary not found. Is the CLI installed?`)
        if (!wc || wc.isDestroyed()) return
        wc.send('auth:login-complete', { cli, success: false, error: 'binary not found' })
        return
      }

      const cfg = configFactory()
      const { cmd, args } = cfg.command(binaryPath)
      const proc = spawn(cmd, args, {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: getScopedSpawnEnv(cli),
      })

      this.activeLogin = proc
      this.activeLoginCli = cli

      // Copilot needs us to type /login into its REPL after startup
      let loginCommandSent = false
      const sendLogin = () => {
        if (!cfg.sendLoginCommand || loginCommandSent) return
        loginCommandSent = true
        proc.stdin?.write('/login\n')
        emit('Sending /login command…')
      }
      const startupTimer = cfg.sendLoginCommand
        ? setTimeout(sendLogin, 2000)
        : null

      const onData = (chunk: Buffer) => {
        if (cfg.sendLoginCommand) sendLogin()
        for (const line of chunk.toString().split('\n')) {
          const stripped = line.replace(ANSI_RE, '').trim()
          if (!stripped) continue
          emit(stripped)
          maybeOpenBrowser(stripped)
        }
      }

      proc.stdout?.on('data', onData)
      proc.stderr?.on('data', onData)

      proc.on('exit', (code) => {
        if (startupTimer) clearTimeout(startupTimer)
        this.activeLogin = null
        this.activeLoginCli = null
        const success = code === 0
        if (success) void this.refresh()
        if (!wc || wc.isDestroyed()) return
        wc.send('auth:login-complete', { cli, success })
      })

      proc.on('error', (err) => {
        if (startupTimer) clearTimeout(startupTimer)
        emit(`Process error: ${err.message}`)
        if (!wc || wc.isDestroyed()) return
        wc.send('auth:login-complete', { cli, success: false, error: err.message })
      })
    })
  }
}
