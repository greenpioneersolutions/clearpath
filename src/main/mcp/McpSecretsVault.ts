import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { log } from '../utils/logger'

/**
 * Encrypted key-value vault for MCP server secrets (API tokens, DB URLs, etc).
 *
 * Uses Electron's `safeStorage` (OS keychain: macOS Keychain, Windows DPAPI,
 * Linux libsecret). Encrypted blobs are persisted to
 * `<userData>/mcp-secrets.json` so restarts don't lose values.
 *
 * If `safeStorage.isEncryptionAvailable()` returns false (common on Linux
 * without libsecret), the vault falls back to **storing plaintext** in the
 * same JSON file and flips `unsafeMode: true`. The UI surfaces this so users
 * can make an informed choice; otherwise MCP servers requiring secrets
 * would be completely unusable on those systems.
 */

interface VaultFile {
  /** key → base64 ciphertext (when encryption available) OR plaintext string */
  values: Record<string, string>
  /** Whether values were written in plaintext (no encryption available) */
  unsafeMode: boolean
}

const EMPTY_VAULT: VaultFile = { values: {}, unsafeMode: false }

export class McpSecretsVault {
  private readonly filePath: string
  private data: VaultFile = { ...EMPTY_VAULT, values: {} }
  private loaded = false

  constructor(filePath?: string) {
    this.filePath = filePath ?? McpSecretsVault.defaultPath()
  }

  private static defaultPath(): string {
    try {
      return join(app.getPath('userData'), 'mcp-secrets.json')
    } catch {
      // In tests or before app.ready, fall back to a predictable path
      return join(process.cwd(), 'mcp-secrets.json')
    }
  }

  /** Load (or lazy-initialize) the on-disk vault. */
  private load(): void {
    if (this.loaded) return
    this.loaded = true
    if (!existsSync(this.filePath)) {
      this.data = { values: {}, unsafeMode: false }
      return
    }
    try {
      const raw = readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as VaultFile
      this.data = {
        values: parsed.values ?? {},
        unsafeMode: !!parsed.unsafeMode,
      }
    } catch (err) {
      log.warn('[McpSecretsVault] Could not read %s — starting fresh: %s', this.filePath, err)
      this.data = { values: {}, unsafeMode: false }
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = this.filePath + '.tmp'
      writeFileSync(tmp, JSON.stringify(this.data, null, 2) + '\n', 'utf8')
      // On Windows, renameSync over an existing file can fail (EPERM).
      // Unlink first; ignore errors (file may not exist yet).
      try { unlinkSync(this.filePath) } catch { /* ignore */ }
      renameSync(tmp, this.filePath)
    } catch (err) {
      log.error('[McpSecretsVault] Failed to persist vault: %s', err)
    }
  }

  /** Is OS-keychain encryption currently available on this system? */
  private isEncryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  /** Is the vault currently running without keychain encryption? */
  isUnsafeMode(): boolean {
    this.load()
    return this.data.unsafeMode
  }

  /**
   * Store `plaintext` under `key`. Uses OS keychain encryption when available.
   * If encryption is unavailable, logs a warning, stores plaintext, and flips
   * `unsafeMode = true`.
   */
  set(key: string, plaintext: string): void {
    this.load()
    if (this.isEncryptionAvailable()) {
      try {
        const encrypted = safeStorage.encryptString(plaintext)
        this.data.values[key] = encrypted.toString('base64')
        // Mixed-mode: if we already had plaintext entries, keep unsafeMode true
        // until the user intentionally migrates. But for a fresh key, prefer
        // setting unsafeMode=false only if no plaintext entries remain.
        this.persist()
        return
      } catch (err) {
        log.error('[McpSecretsVault] Encryption failed for key "%s": %s — falling back to plaintext', key, err)
      }
    }
    // Fallback: plaintext
    log.warn('[McpSecretsVault] Storing key "%s" without encryption (safeStorage unavailable)', key)
    this.data.values[key] = plaintext
    this.data.unsafeMode = true
    this.persist()
  }

  /**
   * Retrieve the plaintext for `key`, or null if missing / decryption failed.
   * Always attempts decryption when encryption is available; falls back to the
   * raw stored string (plaintext) if decryption fails. This handles the
   * mixed-mode case where a key was stored as plaintext before encryption
   * became available, and avoids returning ciphertext when unsafeMode is true
   * but encryption has since become available.
   */
  get(key: string): string | null {
    this.load()
    const stored = this.data.values[key]
    if (stored === undefined) return null

    if (this.isEncryptionAvailable()) {
      try {
        const buf = Buffer.from(stored, 'base64')
        return safeStorage.decryptString(buf)
      } catch {
        // Value may have been stored as plaintext (e.g. written before encryption
        // was available, or via unsafeMode fallback). Return it as-is.
        return stored
      }
    }
    // No encryption available — stored value is always plaintext.
    return stored
  }

  /** Remove the secret at `key`. No-op if missing. */
  remove(key: string): void {
    this.load()
    if (!(key in this.data.values)) return
    delete this.data.values[key]
    this.persist()
  }

  /** List all keys stored in the vault. Never exposes values. */
  listKeys(): string[] {
    this.load()
    return Object.keys(this.data.values)
  }
}

/**
 * Process-wide singleton. Use this everywhere instead of constructing ad-hoc
 * instances so there's only one load/persist cycle in flight at a time.
 */
let singleton: McpSecretsVault | null = null
export function getMcpSecretsVault(): McpSecretsVault {
  if (!singleton) singleton = new McpSecretsVault()
  return singleton
}

/** Testing hook — replace the singleton with a custom instance. */
export function __setMcpSecretsVaultForTesting(vault: McpSecretsVault | null): void {
  singleton = vault
}
