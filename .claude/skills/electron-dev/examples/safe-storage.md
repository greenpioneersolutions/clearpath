# Pattern: Encrypted Credential Storage with safeStorage

```ts
import { safeStorage, ipcMain } from 'electron'
import Store from 'electron-store'

const store = new Store({ name: 'secure-config' })

ipcMain.handle('credentials:save', async (_event, key: string, value: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this platform')
  }
  const encrypted = safeStorage.encryptString(value)
  store.set(key, encrypted.toString('base64'))
  return true
})

ipcMain.handle('credentials:load', async (_event, key: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available')
  }
  const base64 = store.get(key) as string | undefined
  if (!base64) return null
  const encrypted = Buffer.from(base64, 'base64')
  return safeStorage.decryptString(encrypted)
})

ipcMain.handle('credentials:delete', async (_event, key: string) => {
  store.delete(key)
  return true
})
```

## Why This Works

- **`safeStorage`** uses OS-level encryption: Keychain (macOS), DPAPI (Windows), kwallet/libsecret (Linux)
- **Base64 encoding** allows storing the encrypted Buffer in electron-store (JSON)
- **Always check `isEncryptionAvailable()`** before encrypting — Linux may fall back to plaintext
- macOS protects against other users AND apps; Windows only against other users
- **Caution:** macOS/Linux system calls may block the main thread to collect user input
