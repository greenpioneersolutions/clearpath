# utilityProcess, desktopCapturer & crashReporter

---

## utilityProcess

**Process:** Main (creates child processes)

Use for CPU-intensive work, crash-isolated tasks, and untrusted services. **Always prefer over `child_process.fork()`.**

### `utilityProcess.fork(modulePath[, args][, options])` → UtilityProcess

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `env` | Object | `process.env` | Environment variables |
| `execArgv` | string[] | — | Node.js exec arguments |
| `cwd` | string | — | Working directory |
| `stdio` | string[]/string | `'inherit'` | `'pipe'`, `'ignore'`, `'inherit'` |
| `serviceName` | string | `"Node Utility Process"` | Process name |
| `allowLoadingUnsignedLibraries` | boolean | — | **macOS.** Requires codesigning entitlements |
| `respondToAuthRequestsFromMainProcess` | boolean | — | Route HTTP 401/407 to main `app#login` |

**Can only be called after `app` ready.**

### Instance Methods

| Method | Description |
|--------|-------------|
| `postMessage(message[, transfer])` | Send message. `transfer`: MessagePortMain[] |
| `kill()` | SIGTERM on POSIX. Returns boolean |

### Instance Properties

| Property | Type | Description |
|----------|------|-------------|
| `pid` | Integer \| undefined | undefined until spawn or after exit |
| `stdout` | ReadableStream \| null | null unless stdio is `'pipe'` |
| `stderr` | ReadableStream \| null | null unless stdio is `'pipe'` |

### Instance Events

| Event | Parameters | Description |
|-------|-----------|-------------|
| `spawn` | — | Process started |
| `error` | `type`, `location`, `report` | **Experimental.** Fatal error with diagnostic report |
| `exit` | `code` | Process exited |
| `message` | `message` | From `process.parentPort.postMessage()` in child |

### Worker Script Pattern

```ts
// worker.ts — runs in utility process
process.parentPort.on('message', (event) => {
  const { type, data } = event.data
  if (type === 'compute') {
    const result = heavyComputation(data)
    process.parentPort.postMessage({ type: 'result', result })
  }
})
```

---

## desktopCapturer

**Process:** Main

### `desktopCapturer.getSources(options)` → `Promise<DesktopCapturerSource[]>`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `types` | string[] | **required** | `'screen'` and/or `'window'` |
| `thumbnailSize` | Size | 150x150 | Set to 0x0 to skip thumbnails |
| `fetchWindowIcons` | boolean | false | Null for screen sources |

### Platform Caveats

- **Linux/PipeWire:** Returns single source; window/screen requests default to window capture
- **macOS 14.2+:** Requires `NSAudioCaptureUsageDescription` in Info.plist for audio
- **macOS 12.7.6-:** `navigator.mediaDevices.getUserMedia` unavailable for audio

---

## crashReporter

**Process:** Main (and Renderer via preload)

### `crashReporter.start(options)` — **Main process only, call as early as possible for maximum coverage**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `submitURL` | string | — | Required unless `uploadToServer: false` |
| `productName` | string | app.name | Product name in reports |
| `uploadToServer` | boolean | true | Auto-upload crashes |
| `ignoreSystemCrashHandler` | boolean | false | |
| `rateLimit` | boolean | false | macOS/Windows: 1 upload/hour |
| `compress` | boolean | true | gzip compression |
| `extra` | Record<string, string> | — | Process-specific metadata |
| `globalExtra` | Record<string, string> | — | Sent with ALL crash reports |

### Methods

| Method | Returns | Process | Description |
|--------|---------|---------|-------------|
| `getLastCrashReport()` | CrashReport \| null | Main | Most recent crash |
| `getUploadedReports()` | CrashReport[] | Main | All uploaded reports |
| `getUploadToServer()` / `setUploadToServer(bool)` | boolean/void | Main | Upload toggle |
| `addExtraParameter(key, value)` | void | All | Key max 39 bytes; value max 20,320 bytes |
| `removeExtraParameter(key)` | void | All | Remove parameter |
| `getParameters()` | Record<string, string> | All | All parameters |

### Gotchas

- If started in main process, automatically monitors child processes
- Uses Crashpad (not Breakpad)
- Oversized keys silently ignored; oversized values truncated
- POST payload: `multipart/form-data` with `upload_file_minidump` field
