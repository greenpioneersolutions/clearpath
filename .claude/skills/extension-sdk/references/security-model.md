# Security Model

ClearPathAI extensions operate within a defense-in-depth security model with 6 layers. No single layer is relied upon exclusively -- each adds an independent constraint.

## Security Layers

### Layer 1: iframe Sandbox

Extension renderer code runs inside an `<iframe>` element with the `sandbox="allow-scripts"` attribute. This means:

- **No top-level navigation** -- the extension cannot navigate the parent window
- **No form submission** -- forms cannot submit to external URLs
- **No popups** -- `window.open()` is blocked
- **No same-origin access** -- the iframe cannot access the parent window's DOM, cookies, or storage
- **No plugins** -- no Flash, Java, etc.
- **Scripts allowed** -- JavaScript execution is permitted (required for extension functionality)

The iframe content is loaded via `srcdoc` (inline HTML) rather than a URL, giving the host full control over the initial page structure.

### Layer 2: Content Security Policy (CSP)

The iframe's srcdoc includes a strict CSP meta tag:

```
default-src 'none';
script-src clearpath-ext: 'unsafe-inline';
style-src clearpath-ext: 'unsafe-inline';
img-src clearpath-ext: data:;
connect-src 'none';
```

This policy enforces:

| Directive | Effect |
|-----------|--------|
| `default-src 'none'` | Block everything not explicitly allowed |
| `script-src clearpath-ext: 'unsafe-inline'` | Only scripts from the `clearpath-ext://` protocol or inline scripts are allowed. No external CDN scripts. |
| `style-src clearpath-ext: 'unsafe-inline'` | Styles from `clearpath-ext://` or inline only |
| `img-src clearpath-ext: data:` | Images from `clearpath-ext://` or data URIs only. No external image loading. |
| `connect-src 'none'` | **No direct network requests** from the iframe -- no XHR, fetch, or WebSocket. All HTTP must go through the SDK's `http.fetch` which routes through the main process. |

The `clearpath-ext://` protocol is a custom protocol registered by the host to serve extension files from the filesystem.

### Layer 3: MessageChannel Gateway

Communication between the extension iframe and the host uses a dedicated `MessageChannel`:

1. The host creates a `MessageChannel` and keeps `port1`
2. The host transfers `port2` to the iframe via `postMessage()` with the `transfer` option
3. All subsequent communication happens over this private port pair -- not via `window.postMessage()`

The gateway enforces:

- **Request/response correlation** -- every request has a unique ID, and responses are matched by ID
- **Method validation** -- the host checks the `method` field against known SDK methods and the extension's IPC namespace
- **Permission checking** -- before executing any SDK method, the host verifies the extension has the required permission
- **Timeout** -- requests that do not receive a response within 30 seconds are rejected
- **Error containment** -- errors in one extension's iframe do not affect other extensions or the host

### Layer 4: Main Process Double-Check

When an extension's main process code calls `ctx.invoke(channel, ...args)`, the `ExtensionMainLoader` performs a second permission check:

1. The channel name is looked up in a channel-to-permission map
2. The extension's granted permissions are checked against the required permission
3. **Unmapped channels are denied by default** -- if a channel is not in the map, the call fails

This means even if a renderer-side check were bypassed, the main process independently enforces permissions.

### Layer 5: Domain Allowlist

For HTTP requests via `sdk.http.fetch()`:

1. The extension must declare `http:fetch` in its `permissions`
2. The extension must list target domains in `allowedDomains` in the manifest
3. The manifest validator **rejects private/local domains**: `localhost`, `127.*`, `10.*`, `192.168.*`, `169.254.*`
4. At runtime, the host verifies the request URL's domain matches an allowed domain

This prevents extensions from:
- Scanning the local network
- Accessing internal services
- Making requests to arbitrary external servers

### Layer 6: Credential Isolation

Extensions never have direct access to:

- **GitHub tokens** -- GitHub API calls go through the host's integration layer
- **API keys** -- The `env:read` permission exposes configured env vars, but sensitive credentials are not included
- **Other extensions' storage** -- each extension has an isolated electron-store file
- **Filesystem** -- the iframe CSP blocks filesystem access; the main process sandbox prevents direct `require('fs')` usage outside the extension's own directory
- **Electron APIs** -- extensions cannot access `ipcMain`, `BrowserWindow`, `shell`, or other Electron APIs directly

## Validation at Load Time

The `ExtensionValidator` performs comprehensive checks before an extension is loaded:

1. **Manifest JSON parsing** -- invalid JSON is rejected
2. **Required field validation** -- all required fields must be present and non-empty
3. **ID format check** -- must match reverse-domain pattern
4. **Permission validation** -- all permissions must be recognized strings
5. **Path traversal prevention** -- `main`, `renderer`, and `icon` paths are resolved and checked to stay within the extension directory
6. **File existence check** -- declared entry files must exist on disk
7. **IPC namespace enforcement** -- all IPC channels must use the declared namespace prefix
8. **Version compatibility** -- `minAppVersion` is checked against the running app version
9. **Domain blocklist** -- `allowedDomains` cannot include localhost or private IPs
10. **Quota cap** -- `storageQuota` cannot exceed 50 MB

## Error Containment

Extensions that repeatedly fail are tracked:

- Errors are recorded via `registry.recordError(id, message)`
- Global error handlers in the iframe forward uncaught errors to the host
- The host displays error banners on affected extension panels
- Extensions can be manually disabled or may be auto-disabled after repeated failures

## Best Practices for Extension Authors

1. **Request minimal permissions** -- only what you need
2. **Handle errors gracefully** -- catch exceptions in handlers, return error envelopes
3. **Do not store sensitive data** -- extension storage is encrypted but visible to the extension itself
4. **Validate all input** -- handler arguments from IPC may be malformed
5. **Use the SDK, not raw APIs** -- the SDK handles serialization, timeout, and error formatting
6. **Test with restricted permissions** -- verify your extension fails gracefully when a permission is not granted
