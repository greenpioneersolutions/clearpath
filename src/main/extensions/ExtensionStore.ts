import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'

const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024 // 5 MB

/**
 * Provides isolated, quota-limited persistent storage for a single extension.
 * Each extension gets its own electron-store file: clear-path-ext-<id>.json
 */
export class ExtensionStorage {
  private store: Store<{ data: Record<string, unknown> }>
  private quotaBytes: number
  private extensionId: string

  constructor(extensionId: string, quotaBytes?: number) {
    this.extensionId = extensionId
    this.quotaBytes = quotaBytes ?? DEFAULT_QUOTA_BYTES

    this.store = new Store<{ data: Record<string, unknown> }>({
      name: `clear-path-ext-${extensionId}`,
      encryptionKey: getStoreEncryptionKey(),
      defaults: { data: {} },
    })

    log.debug('[ext-store] Initialized storage for extension "%s" (quota: %d bytes)', extensionId, this.quotaBytes)
  }

  get<T = unknown>(key: string): T | undefined {
    return this.store.get(`data.${key}`) as T | undefined
  }

  set(key: string, value: unknown): void {
    // Check quota before writing
    const currentData = this.store.get('data') ?? {}
    const proposed = { ...currentData, [key]: value }
    const proposedSize = Buffer.byteLength(JSON.stringify(proposed), 'utf-8')

    if (proposedSize > this.quotaBytes) {
      throw new Error(
        `Storage quota exceeded for extension "${this.extensionId}": ` +
          `${proposedSize} bytes exceeds ${this.quotaBytes} byte limit`,
      )
    }

    this.store.set(`data.${key}`, value)
  }

  delete(key: string): void {
    this.store.delete(`data.${key}` as never)
  }

  keys(): string[] {
    const data = this.store.get('data') ?? {}
    return Object.keys(data)
  }

  getUsedBytes(): number {
    const data = this.store.get('data') ?? {}
    return Buffer.byteLength(JSON.stringify(data), 'utf-8')
  }

  getQuota(): { used: number; limit: number } {
    return { used: this.getUsedBytes(), limit: this.quotaBytes }
  }

  /** Wipe all data. Called on extension uninstall. */
  destroy(): void {
    log.info('[ext-store] Destroying storage for extension "%s"', this.extensionId)
    this.store.clear()
  }
}

/**
 * Factory that manages ExtensionStorage instances — one per extension.
 * Ensures each extension's storage is lazily created and properly isolated.
 */
export class ExtensionStoreFactory {
  private instances: Map<string, ExtensionStorage> = new Map()

  getStore(extensionId: string, quotaBytes?: number): ExtensionStorage {
    let instance = this.instances.get(extensionId)
    if (!instance) {
      instance = new ExtensionStorage(extensionId, quotaBytes)
      this.instances.set(extensionId, instance)
    }
    return instance
  }

  destroyStore(extensionId: string): void {
    const instance = this.instances.get(extensionId)
    if (instance) {
      instance.destroy()
      this.instances.delete(extensionId)
    }
  }

  destroyAll(): void {
    for (const [id, instance] of this.instances) {
      instance.destroy()
      this.instances.delete(id)
    }
  }
}
