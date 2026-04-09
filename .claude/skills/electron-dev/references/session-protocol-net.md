# session, protocol, net & Related APIs

---

## session

**Process:** Main | **Access:** `session.defaultSession` (after `app.ready`)

### Getting Sessions

| Method | Description |
|--------|-------------|
| `session.defaultSession` | Default session (readonly property) |
| `session.fromPartition(partition[, options])` | `persist:` prefix = persistent, else in-memory |
| `session.fromPath(path[, options])` | From absolute path |

### Key Events

| Event | Description |
|-------|-------------|
| `will-download` | Download starting. Params: `event`, `item` (DownloadItem), `webContents` |
| `preconnect` | Renderer requested preconnection |
| `select-hid-device` / `select-serial-port` / `select-usb-device` | Device selection |

### Cache & Storage Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getCacheSize()` | `Promise<Integer>` | Cache size in bytes |
| `clearCache()` | `Promise<void>` | Clear HTTP cache |
| `clearStorageData([options])` | `Promise<void>` | Options: `{origin, storages, quotas}` |
| `clearData([options])` | `Promise<void>` | Clear by dataTypes/origins |
| `flushStorageData()` | void | Write DOMStorage to disk |

### Network Methods

| Method | Description |
|--------|-------------|
| `setProxy(config)` | Set proxy. May need `closeAllConnections()` after |
| `resolveProxy(url)` | Resolve proxy for URL |
| `enableNetworkEmulation(options)` | Simulate: `{offline, latency, downloadThroughput, uploadThroughput}` |
| `disableNetworkEmulation()` | Disable emulation |
| `closeAllConnections()` | **WARNING: terminates in-flight requests** |
| `fetch(input[, init])` | Fetch using Chromium network stack |

### Permission Methods

| Method | Description |
|--------|-------------|
| `setPermissionRequestHandler(handler)` | Handler: `(webContents, permission, callback)`. Permissions: `clipboard-read`, `display-capture`, `fullscreen`, `geolocation`, `media`, `midi`, `notifications`, `pointerLock`, `openExternal`, `fileSystem`, etc. |
| `setPermissionCheckHandler(handler)` | Returns boolean |
| `setDisplayMediaRequestHandler(handler)` | Screen capture requests |
| `setDevicePermissionHandler(handler)` | HID/serial/USB device access |

### Other Methods

| Method | Description |
|--------|-------------|
| `setCertificateVerifyProc(proc)` | Custom SSL verification |
| `setSSLConfig(config)` | TLS version limits |
| `clearAuthCache()` | Clear HTTP auth cache |
| `setUserAgent(agent[, languages])` | Does NOT affect existing WebContents |
| `setSpellCheckerEnabled(enable)` | Toggle spell checker |
| `setSpellCheckerLanguages(languages)` | **macOS: no-op** |
| `setDownloadPath(path)` | Default download directory |
| `downloadURL(url[, options])` | Trigger download |

### Properties

`cookies` (Cookies), `webRequest` (WebRequest), `protocol` (Protocol), `netLog` (NetLog), `serviceWorkers`, `extensions`

---

## Cookies

**Access:** `session.cookies`

| Method | Returns | Description |
|--------|---------|-------------|
| `get(filter)` | `Promise<Cookie[]>` | Filter: `{url, name, domain, path, secure, session, httpOnly}` |
| `set(details)` | `Promise<void>` | `{url (required), name, value, domain, path, secure, httpOnly, expirationDate, sameSite}` |
| `remove(url, name)` | `Promise<void>` | Remove cookie |
| `flushStore()` | `Promise<void>` | Force disk write (normally batches every 30s/512 ops) |

**Event:** `changed` — `(event, cookie, cause, removed)`

---

## protocol

**Process:** Main | All methods require `app` ready.

| Method | Description |
|--------|-------------|
| `registerSchemesAsPrivileged(schemes)` | **MUST call before `ready`. Once only.** Register custom schemes |
| `handle(scheme, handler)` | Register handler returning Response/Promise |
| `unhandle(scheme)` | Remove handler |
| `isProtocolHandled(scheme)` | Check if handled |

---

## net

**Process:** Main, Utility | Uses Chromium network stack (supports NTLM, Kerberos, system proxy).

| Method | Returns | Description |
|--------|---------|-------------|
| `net.request(options)` | ClientRequest | Create HTTP request |
| `net.fetch(input[, init])` | `Promise<Response>` | Fetch API. Limitations: no `data:`/`blob:`, `integrity` ignored |
| `net.isOnline()` | boolean | Network connectivity |
| `net.resolveHost(host[, options])` | `Promise<ResolvedHost>` | DNS resolution |

---

## ClientRequest

**Access:** `net.request()` return value.

### Key Constructor Options

`method`, `url`, `headers`, `session`, `partition`, `credentials`, `redirect` (`'follow'`/`'error'`/`'manual'`), `cache`, `priority`

### Events

| Event | Description |
|-------|-------------|
| `response` | Response received |
| `redirect` | Server redirect. **Must call `followRedirect()` synchronously** |
| `login` | Auth required |
| `error` / `abort` / `close` | Error states |

### Methods

`setHeader(name, value)`, `write(chunk)`, `end([chunk])`, `abort()`, `followRedirect()`

---

## WebRequest

**Access:** `session.webRequest` | Only one listener per event active.

| Method | Modifiable | Description |
|--------|-----------|-------------|
| `onBeforeRequest([filter,] listener)` | cancel, redirectURL | Before request sent |
| `onBeforeSendHeaders([filter,] listener)` | cancel, requestHeaders | Before headers sent |
| `onSendHeaders([filter,] listener)` | No | After headers sent |
| `onHeadersReceived([filter,] listener)` | cancel, responseHeaders, statusLine | Response headers received |
| `onResponseStarted([filter,] listener)` | No | Response body started |
| `onBeforeRedirect([filter,] listener)` | No | Redirect occurring |
| `onCompleted([filter,] listener)` | No | Request completed |
| `onErrorOccurred([filter,] listener)` | No | Request errored |

Filter: `{urls: string[]}` (Chrome extension URL patterns)

---

## DownloadItem

**Access:** `session.on('will-download')` callback.

### Events

- `updated` — `(event, state: 'progressing'|'interrupted')`
- `done` — `(event, state: 'completed'|'cancelled'|'interrupted')`

### Key Methods

| Method | Description |
|--------|-------------|
| `setSavePath(path)` | **Only in `will-download` callback.** Bypasses save dialog |
| `setSaveDialogOptions(options)` | Same as `dialog.showSaveDialog()` options |
| `pause()` / `resume()` / `cancel()` | Control download |
| `getURL()` / `getFilename()` / `getMimeType()` | Metadata |
| `getReceivedBytes()` / `getTotalBytes()` | Progress |
| `getPercentComplete()` | Progress percentage |
| `getState()` | `'progressing'`, `'completed'`, `'cancelled'`, `'interrupted'` |

---

## netLog

**Access:** `session.netLog`

| Method | Description |
|--------|-------------|
| `startLogging(path[, options])` | Start logging. Options: `{captureMode: 'default'|'includeSensitive'|'everything', maxFileSize}` |
| `stopLogging()` | Flush and stop |
| `currentlyLogging` | boolean property |
