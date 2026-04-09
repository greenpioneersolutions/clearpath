# Electron Security Checklist

Electron grants code filesystem access, shell access, and more. Security is a shared responsibility. These are all 20 official security recommendations.

---

## 1. Only Load Secure Content

Use HTTPS everywhere. Never load HTTP content. Ensures data integrity and encryption.

```ts
// BAD
browserWindow.loadURL('http://example.com')
// GOOD
browserWindow.loadURL('https://example.com')
```

## 2. Do Not Enable Node.js Integration for Remote Content

**Default since Electron 5.** When enabled, XSS becomes RCE — a compromised page can access the filesystem and execute commands.

## 3. Enable Context Isolation

**Default since Electron 12.** Runs preload scripts in a dedicated JS context, preventing renderer page scripts from tampering with globals. Disabling context isolation also disables sandboxing.

## 4. Enable Process Sandboxing

**Default since Electron 20.** Uses OS-level capabilities to restrict renderer access. Never load untrusted content in unsandboxed processes.

## 5. Handle Session Permission Requests

Electron auto-approves all permission requests by default. Implement `session.setPermissionRequestHandler`:

```ts
session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
  const url = new URL(webContents.getURL())
  if (url.protocol === 'https:' && url.host === 'example.com' && permission === 'notifications') {
    callback(true)
  } else {
    callback(false)
  }
})
```

## 6. Do Not Disable webSecurity

**Default: enabled.** Disabling removes same-origin policy. Never disable in production.

## 7. Define a Content Security Policy

```ts
// Via HTTP headers
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'none'"]
    }
  })
})
```

```html
<!-- Via meta tag (for file:// protocol) -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'">
```

## 8. Do Not Enable allowRunningInsecureContent

**Default: disabled.** Prevents HTTPS pages from loading HTTP scripts (mixed content).

## 9. Do Not Enable Experimental Features

**Default: disabled.** Chromium experimental features are untested.

## 10. Do Not Use enableBlinkFeatures

Blink features disabled by default are disabled for good reasons.

## 11. Do Not Use allowpopups for WebViews

Follow least-privilege: don't allow unless explicitly needed.

## 12. Verify WebView Options Before Creation

```ts
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    const srcUrl = new URL(params.src)
    if (srcUrl.origin !== 'https://example.com') {
      event.preventDefault()
    }
  })
})
```

## 13. Disable or Limit Navigation

```ts
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsed = new URL(navigationUrl)
    if (parsed.origin !== 'https://example.com') {
      event.preventDefault()
    }
  })
})
```

**Use `new URL()` for parsing**, never `startsWith()` string comparison (vulnerable to `example.com.attacker.com`).

## 14. Disable or Limit Creation of New Windows

```ts
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeForExternalOpen(url)) {
      setImmediate(() => shell.openExternal(url))
    }
    return { action: 'deny' }
  })
})
```

## 15. Do Not Use shell.openExternal with Untrusted Content

Can execute arbitrary commands with malicious URIs. Validate and allowlist URLs first.

## 16. Use a Current Version of Electron

Security fixes ship in new releases. Migrate one major version at a time.

## 17. Validate the Sender of All IPC Messages

```ts
ipcMain.handle('get-secrets', (e) => {
  if (!validateSender(e.senderFrame)) return null
  return getSecrets()
})

function validateSender(frame: WebFrameMain): boolean {
  return new URL(frame.url).host === 'electronjs.org'
}
```

## 18. Avoid file:// Protocol; Use Custom Protocols

`file://` grants more privileges — pages can access every file. Use `protocol.handle` with a custom protocol.

## 19. Check Which Fuses You Can Change

Disable unnecessary fuses (`runAsNode`, `nodeCliInspect`) to prevent exploitation. Use `@electron/fuses`.

## 20. Do Not Expose Electron APIs to Untrusted Web Content

```ts
// BAD: leaks event object with access to full ipcRenderer
onUpdateCounter: (callback) => ipcRenderer.on('update-counter', callback)

// GOOD: strips event, passes only data
onUpdateCounter: (callback) => ipcRenderer.on('update-counter', (_event, value) => callback(value))
```

---

## Recommended BrowserWindow Configuration

```js
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,     // default — never change
    nodeIntegration: false,     // default — never change
    sandbox: true,              // default since Electron 20
    webSecurity: true,          // default — never disable
    allowRunningInsecureContent: false,
    experimentalFeatures: false
  }
})
```

## Security Fuses

Use `@electron/fuses` to flip compile-time security toggles:

| Fuse | Default | Effect |
|------|---------|--------|
| `RunAsNode` | Enabled | Controls `ELECTRON_RUN_AS_NODE`. Disabling breaks `child_process.fork` |
| `EnableCookieEncryption` | Disabled | OS-level cookie encryption. **One-way**: enabling then disabling corrupts store |
| `EnableNodeOptionsEnvironmentVariable` | Enabled | Controls `NODE_OPTIONS` env var |
| `EnableNodeCliInspectArguments` | Enabled | Controls `--inspect` flags |
| `OnlyLoadAppFromAsar` | Disabled | Restricts app loading to `app.asar` only |
| `GrantFileProtocolExtraPrivileges` | Enabled | Controls `file://` elevated privileges |

```js
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
flipFuses(require('electron'), {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false
})
```
