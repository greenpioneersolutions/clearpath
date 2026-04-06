import { safeStorage } from 'electron'
import Store from 'electron-store'
import { log } from './logger'

/**
 * Secure credential storage using Electron's safeStorage API.
 * Encrypts secrets at rest using the OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret).
 *
 * If safeStorage is unavailable (e.g., Linux without libsecret), secrets CANNOT be stored.
 * The app will prompt the user to use environment variables directly instead.
 */

interface CredentialStoreSchema {
  credentials: Record<string, string> // key → encrypted base64 string
}

const store = new Store<CredentialStoreSchema>({
  name: 'clear-path-credentials',
  defaults: { credentials: {} },
})

function isAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** Check if the OS keychain is available for secret storage. */
export function isSecureStorageAvailable(): boolean {
  return isAvailable()
}

/** Encrypt a secret and store it. Throws if safeStorage is unavailable. */
export function storeSecret(key: string, value: string): void {
  if (!isAvailable()) {
    throw new Error(
      'Secure storage is not available on this system. ' +
      'Install libsecret (Linux) or use environment variables directly. ' +
      'Secrets cannot be stored without OS keychain support.'
    )
  }
  const encrypted = safeStorage.encryptString(value)
  store.set(`credentials.${key}`, encrypted.toString('base64'))
  log.info('[credentialStore] Stored secret "%s" (encrypted length=%d)', key, encrypted.length)
}

/** Retrieve and decrypt a stored secret. Returns empty string if not found. */
export function retrieveSecret(key: string): string {
  const stored = store.get(`credentials.${key}` as keyof CredentialStoreSchema) as string | undefined
  if (!stored) {
    log.warn('[credentialStore] retrieveSecret("%s"): No value found in store. Keys present: [%s]',
      key, Object.keys(store.get('credentials') ?? {}).join(', '))
    return ''
  }

  log.debug('[credentialStore] retrieveSecret("%s"): Found encrypted blob (length=%d)', key, stored.length)

  if (!isAvailable()) {
    log.error('[credentialStore] retrieveSecret("%s"): safeStorage is NOT available — cannot decrypt', key)
    return ''
  }

  try {
    const decrypted = safeStorage.decryptString(Buffer.from(stored, 'base64'))
    log.debug('[credentialStore] retrieveSecret("%s"): Decrypted OK (length=%d)', key, decrypted.length)
    return decrypted
  } catch (err) {
    log.error('[credentialStore] retrieveSecret("%s"): Decryption FAILED — %s', key, err)
    return ''
  }
}

/** Remove a stored secret. */
export function deleteSecret(key: string): void {
  const creds = store.get('credentials')
  delete creds[key]
  store.set('credentials', creds)
}

/** Check if a secret is stored (without decrypting). */
export function hasSecret(key: string): boolean {
  const stored = store.get(`credentials.${key}` as keyof CredentialStoreSchema) as string | undefined
  return !!stored
}

/**
 * Return a masked preview of a secret (e.g., "ghp_****AB3F").
 * Never returns the full value.
 */
export function getSecretPreview(key: string): string {
  const value = retrieveSecret(key)
  if (!value) return ''
  if (value.length <= 8) return '*'.repeat(value.length)
  return value.slice(0, 4) + '*'.repeat(Math.min(value.length - 8, 20)) + value.slice(-4)
}
