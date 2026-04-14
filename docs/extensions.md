# ClearPathAI Extension System

## Table of Contents

1. [Overview](#overview)
2. [How Extensions Work](#how-extensions-work)
3. [Architecture Deep Dive](#architecture-deep-dive)
4. [Getting Started: Your First Extension](#getting-started-your-first-extension)
5. [The Manifest (`clearpath-extension.json`)](#the-manifest)
6. [Extension SDK Reference](#extension-sdk-reference)
7. [Renderer Extensions (UI)](#renderer-extensions-ui)
8. [Main Process Extensions (Backend)](#main-process-extensions-backend)
9. [Permissions](#permissions)
10. [Storage](#storage)
11. [Accessing Integrations (GitHub, etc.)](#accessing-integrations)
12. [Contributing Navigation & Widgets](#contributing-navigation--widgets)
13. [Error Handling](#error-handling)
14. [Security Model](#security-model)
15. [Packaging & Distribution](#packaging--distribution)
16. [Installing Extensions](#installing-extensions)
17. [Bundled Extensions](#bundled-extensions)
18. [Complete Example: Hello World Extension](#complete-example-hello-world-extension)
19. [Complete Example: GitHub Dashboard Extension](#complete-example-github-dashboard-extension)
20. [Reference Implementation: PR Scores Extension](#reference-implementation-pr-scores-extension)
21. [Build Your Own Extension: Start to Finish Walkthrough](#build-your-own-extension-start-to-finish-walkthrough)
22. [Troubleshooting](#troubleshooting)
23. [Manifest Reference (Quick Lookup)](#manifest-reference-quick-lookup)
24. [SDK API Reference (Quick Lookup)](#sdk-api-reference-quick-lookup)

---

## Overview

ClearPathAI extensions allow you to add custom features to the desktop application after it has been compiled and distributed. Extensions can:

- Render custom UI pages and panels inside the app
- Access integration data (GitHub repos, pull requests, issues) through a secure proxy
- Store persistent data locally
- Send notifications to the user
- Add navigation entries to the sidebar
- Contribute widgets to the dashboard
- Register custom IPC handlers for backend logic

Extensions are built with **React** and **TypeScript**, the same technologies the host app uses. They run inside sandboxed iframes for security — an extension cannot crash the app, steal tokens, or access other extensions' data.

### Terminology

| Term | Meaning |
|------|---------|
| **Extension** | A self-contained package of code that adds functionality to ClearPathAI |
| **Manifest** | The `clearpath-extension.json` file that describes the extension |
| **Host** | The ClearPathAI application itself |
| **SDK** | The `@clearpath/extension-sdk` package that extensions use to communicate with the host |
| **Bundled extension** | An extension that ships inside the ClearPathAI application |
| **User extension** | An extension the user installs after the fact (from a zip or directory) |

---

## How Extensions Work

When someone asks "how do extensions actually work in a compiled Electron app?", the answer involves several layers. Here is the full picture:

### The Problem

ClearPathAI is a compiled Electron app. Vite bundles all React code at build time into static JavaScript. After the user installs the DMG or AppImage, there is no `npm install`, no hot reload, no dynamic `import()` of new code from the renderer. So how do we add new features?

### The Solution: Two Entry Points

Extensions have up to two entry points:

1. **Main process entry** (`main` in the manifest) — A Node.js CommonJS module loaded via `require()` in Electron's main process. Since the main process is Node.js, `require()` works on arbitrary file paths. This handles backend logic, IPC handlers, and data processing.

2. **Renderer entry** (`renderer` in the manifest) — A bundled JavaScript file loaded inside a sandboxed `<iframe>`. The iframe uses a custom Electron protocol (`clearpath-ext://`) to load the file from disk, bypassing the Vite build entirely.

### The Flow

```
App starts
  |
  v
ExtensionRegistry scans two directories:
  - Bundled: <app resources>/extensions/
  - User:    ~/Library/Application Support/clear-path/extensions/
  |
  v
For each valid extension directory (contains clearpath-extension.json):
  - Validate the manifest (schema, permissions, paths, version)
  - Register in the encrypted extension store
  |
  v
For each ENABLED extension with a "main" entry:
  - require() the main entry file
  - Call activate(context) with a sandboxed context object
  - Extension registers its IPC handlers
  |
  v
Renderer boots, calls extension:list via IPC
  |
  v
Sidebar renders extension navigation items
Routes like /ext/:extensionId/* become available
  |
  v
When user navigates to an extension route:
  - An <iframe sandbox="allow-scripts"> is created
  - The iframe loads the extension's renderer JS via clearpath-ext:// protocol
  - A MessageChannel is created for private communication
  - The extension SDK connects to the host through the MessagePort
  - The extension renders its React UI inside the iframe
```

### Why iframes?

We evaluated four approaches:

| Approach | Why it was rejected |
|----------|-------------------|
| `eval()` / dynamic `import()` | CSP blocks `eval`; one crash kills the entire app; extension can access `window.electronAPI` directly |
| Electron `<webview>` | Semi-deprecated; spawns separate renderer process per webview (heavy); poor inline rendering |
| Sidecar process | Cannot render UI into the host window; only suitable for headless tasks |
| **iframe + MessageChannel** | **Selected** — DOM isolation, crash containment, CSP sandboxing, private communication channel |

---

## Architecture Deep Dive

### File System Layout

Extensions live in two directories:

**Bundled extensions** (read-only, shipped with the app):
```
macOS:   ClearPathAI.app/Contents/Resources/extensions/
Linux:   <AppImage mount>/resources/extensions/
Windows: <install dir>/resources/extensions/
```

**User-installed extensions** (writable):
```
macOS:   ~/Library/Application Support/clear-path/extensions/
Linux:   ~/.config/clear-path/extensions/
Windows: %APPDATA%/clear-path/extensions/
```

Each extension is a subdirectory containing at minimum a `clearpath-extension.json` manifest:

```
com.example.my-extension/
  clearpath-extension.json     <-- Required
  dist/
    main.cjs                   <-- Main process entry (optional)
    renderer.js                <-- Renderer entry (optional)
    renderer.css               <-- Styles (optional)
  assets/
    icon.svg                   <-- Extension icon (optional)
```

### Communication Protocol

Extensions communicate with the host via a typed MessageChannel protocol:

```
Extension iframe                    Host renderer
      |                                  |
      |-- { type: 'ext:ready' } -------> |
      |                                  |
      | <--- { type: 'ext:init',         |
      |        theme: {...},             |
      |        extensionId: '...' } ---- |
      |                                  |
      |-- { type: 'ext:request',         |
      |    id: 'req-1',          ------> |
      |    method: 'storage.get',        |  Host checks permissions,
      |    params: { key: 'foo' } }      |  calls IPC, returns result
      |                                  |
      | <--- { type: 'ext:response',     |
      |        id: 'req-1',             |
      |        result: { ... } } ------- |
      |                                  |
```

Each request has a unique `id` for response correlation. Responses are matched by `id`. Errors include a `code` and `message`. The SDK client handles all of this automatically — extension developers just call `sdk.storage.get('foo')` and get a Promise back.

### Security Layers

The extension system has six layers of defense:

1. **iframe `sandbox="allow-scripts"`** — No `allow-same-origin`, no `allow-top-navigation`. The iframe cannot access `window.parent`, cannot read the host DOM, cannot navigate the parent window.

2. **Content Security Policy on the iframe** — `connect-src 'none'` means the extension literally cannot make any network requests (no `fetch()`, no `XMLHttpRequest`, no `WebSocket`). All network access goes through the SDK proxy.

3. **MessageChannel gateway** — Every SDK call goes through `ExtensionHost.tsx` which routes requests through permission-checked IPC calls. If the extension doesn't have the `storage` permission, `sdk.storage.get()` will be rejected.

4. **Main process double-check** — Even if a compromised renderer bypasses the gateway, every IPC handler in `extensionHandlers.ts` independently verifies permissions by querying the extension registry.

5. **Domain allowlist for HTTP fetch** — The `http:fetch` proxy validates URLs against the extension's declared `allowedDomains`. Requests to localhost, private IPs (10.x, 192.168.x, 169.254.x), and undeclared domains are blocked.

6. **Credential isolation** — Extensions never receive raw tokens. When an extension calls `sdk.github.listRepos()`, the host uses its cached Octokit instance (which holds the token) to make the API call and returns only the data. The token never crosses the MessageChannel boundary.

---

## Getting Started: Your First Extension

### Prerequisites

- Node.js 18+
- TypeScript
- A bundler (esbuild, Vite, or Rollup)
- ClearPathAI v1.8.0+

### Step 1: Create the directory structure

```bash
mkdir my-extension
cd my-extension
```

Create the following files:

```
my-extension/
  clearpath-extension.json
  src/
    renderer.tsx
  package.json
  tsconfig.json
  build.mjs
```

### Step 2: Write the manifest

Create `clearpath-extension.json`:

```json
{
  "id": "com.yourname.my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "A simple ClearPathAI extension",
  "author": "Your Name",
  "renderer": "dist/renderer.js",
  "permissions": [
    "storage",
    "notifications:emit"
  ],
  "contributes": {
    "navigation": [
      {
        "id": "my-page",
        "path": "/ext/com.yourname.my-extension",
        "label": "My Extension",
        "icon": "puzzle-piece"
      }
    ]
  }
}
```

### Step 3: Write the renderer entry

Create `src/renderer.tsx`:

```tsx
// This file is the renderer entry point for the extension.
// It runs inside a sandboxed iframe and communicates with
// the host via the ClearPath SDK.

import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'

// The SDK is available globally via the iframe bootstrap.
// In production, you'd import from @clearpath/extension-sdk.
// For now, we'll use the raw MessagePort API.

function App() {
  const [count, setCount] = useState(0)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  // Load saved count from extension storage on mount
  useEffect(() => {
    sendRequest('storage.get', { key: 'count' }).then((result: any) => {
      if (result?.success && result.data !== undefined) {
        setCount(result.data as number)
        setSavedCount(result.data as number)
      }
    })
  }, [])

  async function handleSave() {
    await sendRequest('storage.set', { key: 'count', value: count })
    setSavedCount(count)
    await sendRequest('notifications.emit', {
      title: 'Count Saved',
      message: `Your count of ${count} has been saved!`,
      severity: 'info',
    })
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ color: '#e2e8f0', fontSize: 24, marginBottom: 16 }}>
        My Extension
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: 16 }}>
        This is a simple extension that counts and saves to storage.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <button
          onClick={() => setCount((c) => c - 1)}
          style={buttonStyle}
        >
          -
        </button>
        <span style={{ color: '#fff', fontSize: 32, minWidth: 60, textAlign: 'center' }}>
          {count}
        </span>
        <button
          onClick={() => setCount((c) => c + 1)}
          style={buttonStyle}
        >
          +
        </button>
      </div>
      <button onClick={handleSave} style={{ ...buttonStyle, padding: '8px 20px' }}>
        Save to Storage
      </button>
      {savedCount !== null && (
        <p style={{ color: '#6366f1', marginTop: 12, fontSize: 14 }}>
          Last saved: {savedCount}
        </p>
      )}
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  background: '#4f46e5',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 16,
  cursor: 'pointer',
}

// ── Low-level SDK communication ──────────────────────────────────────────────
// In a real extension using @clearpath/extension-sdk, this is handled for you.

let port: MessagePort | null = null
let requestId = 0
const pending = new Map<string, (v: any) => void>()

window.addEventListener('message', (event) => {
  if (event.data?.type === 'ext:port') {
    port = event.ports[0]
    if (!port) return

    port.onmessage = (e) => {
      if (e.data?.type === 'ext:response') {
        const resolver = pending.get(e.data.id)
        if (resolver) {
          pending.delete(e.data.id)
          resolver(e.data.result ?? e.data.error)
        }
      }
    }

    port.postMessage({ type: 'ext:ready' })

    // Render the app once we have the SDK connection
    const root = document.getElementById('ext-root')
    if (root) {
      ReactDOM.createRoot(root).render(<App />)
    }
  }
})

function sendRequest(method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const id = `req-${++requestId}`
    pending.set(id, resolve)
    port?.postMessage({ type: 'ext:request', id, method, params })
  })
}
```

### Step 4: Set up the build

Create `package.json`:

```json
{
  "name": "my-extension",
  "private": true,
  "scripts": {
    "build": "node build.mjs"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "esbuild": "^0.21.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.5.0"
  }
}
```

Create `build.mjs`:

```js
import { build } from 'esbuild'

await build({
  entryPoints: ['src/renderer.tsx'],
  bundle: true,
  outfile: 'dist/renderer.js',
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  // React is bundled INTO the extension since iframes are isolated
  external: [],
  minify: true,
})

console.log('Build complete: dist/renderer.js')
```

### Step 5: Build and install

```bash
npm install
npm run build
```

Your extension directory now contains:
```
my-extension/
  clearpath-extension.json
  dist/
    renderer.js
  src/
    renderer.tsx
  ...
```

To install in ClearPathAI:
1. Open **Configure > Extensions**
2. Click **Install Extension**
3. Select the `my-extension` directory
4. Grant the requested permissions (Storage, Notifications)
5. Enable the extension with the toggle switch
6. A new "My Extension" entry appears in the sidebar

---

## The Manifest

Every extension must have a `clearpath-extension.json` file at its root. This file tells ClearPathAI everything it needs to know about the extension.

### Full Annotated Example

```jsonc
{
  // ── REQUIRED FIELDS ────────────────────────────────────────────────────

  // Unique identifier. Must be reverse-domain format.
  // Lowercase alphanumeric and hyphens only.
  // Examples: "com.yourcompany.my-extension", "io.github.username.cool-tool"
  "id": "com.example.github-dashboard",

  // Human-readable name shown in the UI
  "name": "GitHub Dashboard",

  // Semantic version (major.minor.patch)
  "version": "2.1.0",

  // Brief description shown in the extension manager
  "description": "Visual dashboard for GitHub repository health and PR metrics",

  // Author name or organization
  "author": "Example Corp",

  // Permissions this extension needs (see Permissions section)
  "permissions": [
    "integration:github:read",
    "storage",
    "notifications:emit"
  ],

  // ── OPTIONAL FIELDS ────────────────────────────────────────────────────

  // Path to 64x64 SVG icon (relative to extension root)
  "icon": "assets/icon.svg",

  // Minimum ClearPathAI version required
  "minAppVersion": "1.8.0",

  // Main process entry point (Node.js, CommonJS)
  // Loaded via require() — runs in Electron's main process
  "main": "dist/main.cjs",

  // Renderer entry point (bundled JS)
  // Loaded in a sandboxed iframe via clearpath-ext:// protocol
  "renderer": "dist/renderer.js",

  // Domains this extension can make HTTP requests to
  // Only relevant if "http:fetch" is in permissions
  // Cannot include localhost, private IPs, or metadata endpoints
  "allowedDomains": ["api.linear.app", "*.atlassian.net"],

  // UI contributions
  "contributes": {
    // Sidebar navigation entries
    "navigation": [
      {
        "id": "dashboard-page",
        "path": "/ext/com.example.github-dashboard",
        "label": "GitHub Dashboard",
        "icon": "chart-bar-square",
        "position": "after:insights",    // Placement hint
        "featureGate": ["showDashboard"] // Only show if this flag is on
      }
    ],

    // Panels embedded in host pages
    "panels": [
      {
        "id": "pr-context",
        "slot": "work:context-panel",    // Named slot in the Work page
        "label": "PR Context",
        "component": "PrContextPanel"    // Named export from renderer entry
      }
    ],

    // Dashboard widgets
    "widgets": [
      {
        "id": "repo-health",
        "name": "Repository Health",
        "description": "Health score across all monitored repos",
        "defaultSize": { "w": 4, "h": 3 },
        "component": "RepoHealthWidget"
      }
    ],

    // Feature flags this extension registers
    "featureFlags": ["showGitHubDashboard"]
  },

  // IPC namespace — all main process channels must start with this
  "ipcNamespace": "gh-dashboard",

  // IPC channels this extension registers handlers for
  "ipcChannels": [
    "gh-dashboard:get-metrics",
    "gh-dashboard:refresh",
    "gh-dashboard:get-config",
    "gh-dashboard:set-config"
  ],

  // Maximum storage quota in bytes (default: 5 MB = 5242880)
  "storageQuota": 10485760
}
```

### Manifest Validation Rules

The host validates every manifest strictly:

| Rule | Detail |
|------|--------|
| `id` format | Must match `/^[a-z0-9]+(\.[a-z0-9-]+){2,}$/` — reverse-domain, lowercase |
| Required fields | `id`, `name`, `version`, `description`, `author`, `permissions` |
| Permissions | Every string in the array must be a known permission type |
| Entry point paths | `main` and `renderer` paths are validated with `assertPathWithinRoots()` — no `../` escaping |
| IPC channels | If `ipcNamespace` is set, every channel in `ipcChannels` must start with `<namespace>:` |
| `minAppVersion` | Compared against `app.getVersion()` — extension rejected if app is too old |
| `allowedDomains` | Cannot include `localhost`, `127.x`, `10.x`, `192.168.x`, `169.254.x` |
| `storageQuota` | Must be a positive number, cannot exceed 50 MB |
| Icon path | If provided, validated to stay within extension directory |

If validation fails, the extension is not registered and the specific errors are logged.

---

## Extension SDK Reference

The `@clearpath/extension-sdk` package provides the tools extension developers use to interact with the host.

### Installation

```bash
npm install @clearpath/extension-sdk
```

### `createExtension(options)`

The main entry point for renderer extensions. Default-export the result from your renderer entry:

```tsx
import { createExtension, useSDK } from '@clearpath/extension-sdk'

function MyPage() {
  const sdk = useSDK()
  // ... your UI
}

export default createExtension({
  // Map of named components — keys must match manifest contributes references
  components: {
    MyPage,
    MyWidget,
  },

  // Called when the extension is activated
  activate: async (sdk) => {
    console.log('Extension activated:', sdk.extensionId)
  },

  // Called when the extension is deactivated (cleanup)
  deactivate: () => {
    console.log('Extension deactivated')
  },
})
```

### `useSDK()` Hook

Access the SDK from any React component rendered by `createExtension()`:

```tsx
import { useSDK } from '@clearpath/extension-sdk'

function MyComponent() {
  const sdk = useSDK()

  // sdk.github.listRepos()
  // sdk.storage.get('key')
  // sdk.notifications.emit({ ... })
  // etc.
}
```

---

## Renderer Extensions (UI)

Renderer extensions render React components inside a sandboxed iframe. The iframe loads your bundled JavaScript via the `clearpath-ext://` protocol.

### What you have access to

- **React** — Bundle your own React (the iframe is isolated)
- **SDK** — Full `ExtensionSDK` object via `useSDK()`
- **Tailwind classes** — The host's Tailwind stylesheet is injected into the iframe, so you can use the same utility classes (`p-4`, `text-white`, `bg-gray-800`, etc.)
- **Theme colors** — `sdk.theme.get()` returns the current brand colors; `sdk.theme.onChange()` fires when they change

### What you do NOT have access to

- `window.electronAPI` — Blocked by iframe sandbox (no `allow-same-origin`)
- `fetch()` / `XMLHttpRequest` — Blocked by CSP (`connect-src 'none'`)
- Parent DOM — Cannot read or modify the host app's DOM
- Other extensions — Cannot communicate with or read data from other extensions
- File system — No `require('fs')`, no Node.js APIs in the renderer

### Build Configuration

Extensions must bundle their renderer code into a single file. Here's an esbuild config:

```js
import { build } from 'esbuild'

await build({
  entryPoints: ['src/renderer.tsx'],
  bundle: true,
  outfile: 'dist/renderer.js',
  format: 'iife',               // Must be IIFE (runs in a <script> tag)
  target: 'es2020',
  jsx: 'automatic',
  minify: true,
  // Bundle React into the extension (iframe is isolated)
  external: [],
})
```

Or with Vite:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/renderer.tsx',
      formats: ['iife'],
      name: 'Extension',
      fileName: () => 'renderer.js',
    },
    outDir: 'dist',
    rollupOptions: {
      // Bundle everything — the iframe is isolated
      external: [],
    },
  },
})
```

---

## Main Process Extensions (Backend)

Main process extensions run Node.js code in Electron's main process. They receive a sandboxed `ExtensionMainContext` — not raw Electron APIs.

### The `ExtensionMainContext`

```typescript
interface ExtensionMainContext {
  extensionId: string           // Your extension's ID
  extensionPath: string         // Absolute path to your extension directory

  // Register an IPC handler. Channel MUST start with your ipcNamespace.
  registerHandler(
    channel: string,
    handler: (event: unknown, args: unknown) => Promise<unknown>
  ): void

  // Call a host IPC channel (permission-checked)
  invoke(channel: string, ...args: unknown[]): Promise<unknown>

  // Scoped storage (encrypted, quota-limited)
  store: {
    get<T>(key: string, defaultValue?: T): T
    set(key: string, value: unknown): void
    delete(key: string): void
    keys(): string[]
  }

  // Logger (auto-prefixed with [ext:your-id])
  log: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
    debug(...args: unknown[]): void
  }
}
```

### Example: Main Process Entry

```typescript
// main/index.ts — compiled to dist/main.cjs
import type { ExtensionMainContext } from '@clearpath/extension-sdk'

export async function activate(ctx: ExtensionMainContext): Promise<void> {
  ctx.log.info('GitHub Dashboard extension activating...')

  // Register an IPC handler that the renderer can call
  ctx.registerHandler('gh-dashboard:get-metrics', async (_event, args: unknown) => {
    const { owner, repo } = args as { owner: string; repo: string }

    // Use host integration proxy — never a raw token
    const pulls = await ctx.invoke('integration:github-pulls', { owner, repo })
    const issues = await ctx.invoke('integration:github-issues', { owner, repo })

    // Calculate metrics
    const metrics = calculateMetrics(pulls, issues)

    // Cache in extension storage
    ctx.store.set(`metrics.${owner}/${repo}`, {
      ...metrics,
      calculatedAt: Date.now(),
    })

    return { success: true, data: metrics }
  })

  ctx.registerHandler('gh-dashboard:get-config', async () => {
    return {
      success: true,
      data: ctx.store.get('config', { refreshInterval: 300 }),
    }
  })

  ctx.registerHandler('gh-dashboard:set-config', async (_event, args: unknown) => {
    ctx.store.set('config', args)
    return { success: true }
  })
}

export function deactivate(): void {
  // Cleanup timers, connections, etc.
}

function calculateMetrics(pulls: unknown, issues: unknown) {
  // Your metric calculation logic
  return { openPRs: 0, openIssues: 0, avgMergeTime: 0 }
}
```

### What `ctx.invoke()` Can Call

Extensions can call host IPC channels that correspond to their permissions:

| Host Channel | Required Permission |
|---|---|
| `integration:github-repos` | `integration:github:read` |
| `integration:github-pulls` | `integration:github:read` |
| `integration:github-pull-detail` | `integration:github:read` |
| `integration:github-issues` | `integration:github:read` |
| `integration:github-search` | `integration:github:read` |
| `integration:get-status` | `integration:github:read` |

If an extension calls a channel it doesn't have permission for, the call throws an error.

### Namespace Enforcement

All IPC channels registered by an extension must start with the extension's `ipcNamespace`:

```json
{
  "ipcNamespace": "gh-dashboard",
  "ipcChannels": [
    "gh-dashboard:get-metrics",    // OK
    "gh-dashboard:refresh"         // OK
  ]
}
```

If an extension tries to register a handler for `some-other-channel`, it will throw:

```
Extension "com.example.github-dashboard" attempted to register handler for
"some-other-channel" but all channels must start with "gh-dashboard:"
```

This prevents extensions from hijacking host channels or other extensions' channels.

---

## Permissions

Extensions must declare every capability they need in their manifest's `permissions` array. Users review and approve each permission individually when installing an extension.

### Permission Reference

| Permission | What It Grants | Risk Level |
|---|---|---|
| `integration:github:read` | Read GitHub repos, PRs, issues through the host's Octokit proxy | Medium |
| `integration:github:write` | Create/modify PRs, issues, comments through the proxy | High |
| `notifications:emit` | Send info and warning notifications (cannot send critical) | Low |
| `storage` | Read/write to the extension's own encrypted store (default 5 MB quota) | Low |
| `env:read` | Read non-sensitive environment variable names and values | Low |
| `http:fetch` | Make HTTP requests to domains declared in `allowedDomains` | High |
| `navigation` | Programmatically navigate the host app to a different route | Low |
| `compliance:log` | Write entries to the audit trail | Low |

### How Permissions Work at Runtime

1. Extension calls `sdk.github.listRepos()`
2. The SDK sends a `{ type: 'ext:request', method: 'github.listRepos' }` message via the MessagePort
3. `ExtensionHost.tsx` receives the message and checks:
   - Is this a known SDK method?
   - Does this extension have the required permission?
4. If permitted, the host forwards the call to the appropriate IPC handler
5. The result is sent back through the MessagePort
6. If denied, an error response is sent back

### Managing Permissions

Users can grant or revoke permissions at any time in **Configure > Extensions**:

- Click on an extension to expand its detail panel
- Each permission shows as "Granted" (green) or "Denied" (gray)
- Click to toggle individual permissions
- "Grant all" button grants all requested permissions at once

Revoking a permission takes effect immediately — the next SDK call requiring that permission will fail.

---

## Requirements (Integration Dependencies)

Extensions that depend on external integrations (GitHub, Jira, ServiceNow, etc.) should declare those dependencies in the manifest's `requires` array. This tells the host what the extension needs to function, so it can show helpful setup guidance instead of cryptic errors.

### Declaring Requirements

```json
{
  "requires": [
    {
      "integration": "github",
      "label": "GitHub",
      "message": "Connect your GitHub account in Configure > Integrations to use this extension."
    }
  ]
}
```

| Field | Purpose |
|-------|---------|
| `integration` | The key used by `integration:get-status` (e.g., `"github"`, `"atlassian"`, `"servicenow"`, `"backstage"`, `"powerbi"`, `"splunk"`, `"datadog"`) |
| `label` | Human-readable name shown in the UI (e.g., "GitHub", "Jira & Confluence") |
| `message` | The message shown when the integration is not connected. Be specific -- tell the user exactly where to go to fix it. |

### What Happens at Runtime

When an extension has `requires` entries:

1. The **Extensions manager** (Configure > Extensions) checks each requirement against the integration status
2. If any requirement is not met, a **"Setup needed"** warning badge appears on the extension card
3. Expanding the extension shows a **Requirements** section with green "Connected" or amber "Not connected" status for each
4. The extension still appears in the sidebar -- but the page itself should handle the missing integration gracefully (show a setup prompt, not crash)

### Best Practice: Handle Missing Requirements in Your UI

Even with the `requires` declaration, your extension's renderer should check the integration status and show a helpful message if it's missing. The `requires` field is for the extension manager -- your page UI is what the user sees when they navigate to it.

The PR Scores extension demonstrates this pattern:

```tsx
// Check GitHub connection on mount
const [githubConnected, setGithubConnected] = useState(false)

useEffect(() => {
  async function check() {
    const status = await window.electronAPI.invoke('integration:get-status')
    setGithubConnected(status.github?.connected ?? false)
  }
  check()
}, [])

// Show setup prompt if not connected
if (!githubConnected) {
  return (
    <div>
      <h2>Connect GitHub</h2>
      <p>PR Scores requires a GitHub connection to fetch repositories.</p>
      <button onClick={() => navigate('/configure?tab=integrations')}>
        Go to Integrations
      </button>
    </div>
  )
}
```

This gives the user two layers of guidance:
1. The extension manager warns them before they even navigate to the page
2. The page itself shows a clear, actionable setup prompt

### Why This Matters

Without `requires`, an extension that needs GitHub will either crash with a confusing "token not configured" error, show an empty page with no explanation, or force the user to guess what's wrong. With `requires`, the host proactively tells the user what's needed, and the extension page gives them a direct path to fix it.

---

## Storage

Each extension gets its own isolated, encrypted persistent storage.

### From the Renderer (via SDK)

```typescript
const sdk = useSDK()

// Store a value
await sdk.storage.set('user-preferences', { theme: 'dark', fontSize: 14 })

// Retrieve a value
const prefs = await sdk.storage.get<{ theme: string; fontSize: number }>('user-preferences')

// Delete a value
await sdk.storage.delete('user-preferences')

// List all keys
const keys = await sdk.storage.keys()

// Check quota
const { used, limit } = await sdk.storage.quota()
console.log(`Using ${used} of ${limit} bytes`)
```

### From the Main Process

```typescript
export async function activate(ctx: ExtensionMainContext) {
  // Storage is synchronous in the main process
  ctx.store.set('config', { interval: 300 })
  const config = ctx.store.get('config', { interval: 60 })
  ctx.store.delete('old-key')
  const allKeys = ctx.store.keys()
}
```

### Storage Details

- **Encryption**: Each extension's store is encrypted with the same machine-specific key used by the host app (derived from hostname + username via Electron's safeStorage)
- **Isolation**: Each extension gets its own file on disk (`clear-path-ext-<id>.json`). Extensions cannot read each other's stores.
- **Quota**: Default 5 MB per extension. Configurable via `storageQuota` in the manifest (max 50 MB). Exceeding the quota throws an error on `set()`.
- **Cleanup**: When an extension is uninstalled, its store file is deleted.

---

## Accessing Integrations

Extensions access integration data (GitHub, etc.) through the SDK's proxy API. The extension never receives raw tokens or credentials.

### GitHub Integration

The SDK provides a typed GitHub API:

```typescript
const sdk = useSDK()

// List authenticated user's repositories
const repos = await sdk.github.listRepos({ perPage: 50 })

// List pull requests for a repository
const pulls = await sdk.github.listPulls('owner', 'repo-name', { state: 'open' })

// Get full detail for a specific PR (includes files, reviews)
const prDetail = await sdk.github.getPull('owner', 'repo-name', 42)

// List issues
const issues = await sdk.github.listIssues('owner', 'repo-name', { state: 'open' })

// Search across repositories
const results = await sdk.github.search('bug fix', 'issues')
```

### How Token Security Works

```
Extension calls sdk.github.listRepos()
  |
  v
SDK sends message via MessagePort: { method: 'github.listRepos', params: {...} }
  |
  v
ExtensionHost.tsx receives message, maps to IPC channel: 'integration:github-repos'
  |
  v
Host's integrationHandlers.ts runs: getOctokit() retrieves token from OS keychain
  |
  v
Octokit makes GitHub API call with the real token
  |
  v
Response data sent back to extension (token never transmitted)
```

The extension only ever sees the API response data. The GitHub token stays in the main process, stored in the OS keychain via Electron's `safeStorage` API.

### HTTP Fetch Proxy (for Other APIs)

For APIs that aren't built into the SDK, use the HTTP fetch proxy:

```typescript
// Manifest must include:
// "permissions": ["http:fetch"],
// "allowedDomains": ["api.linear.app"]

const response = await sdk.http.fetch('https://api.linear.app/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '{ viewer { id name } }' }),
})

console.log(response.status)  // 200
console.log(response.body)    // JSON string
```

The proxy:
- Validates the URL domain against `allowedDomains`
- Blocks localhost and private IPs
- Executes the request from the main process (which has full network access)
- Returns the response through the MessageChannel

---

## Contributing Navigation & Widgets

### Sidebar Navigation

Add entries to the app's sidebar:

```json
{
  "contributes": {
    "navigation": [
      {
        "id": "my-page",
        "path": "/ext/com.example.my-extension",
        "label": "My Extension",
        "icon": "puzzle-piece",
        "position": "after:insights"
      }
    ]
  }
}
```

- `path` must start with `/ext/` followed by your extension ID
- `icon` is a string identifier (or inline SVG). Currently, all extension nav items use a puzzle-piece icon.
- `position` is a hint for ordering. Options: `"after:home"`, `"after:work"`, `"after:insights"`, etc.
- `featureGate` optionally restricts visibility based on the host's feature flags

When the user clicks the nav entry, the host renders an `ExtensionPage` at that route, which creates an iframe loading your renderer entry.

### Dashboard Widgets

Contribute widgets to the customizable dashboard:

```json
{
  "contributes": {
    "widgets": [
      {
        "id": "sprint-status",
        "name": "Sprint Status",
        "description": "Current sprint progress and blockers",
        "defaultSize": { "w": 4, "h": 3 },
        "component": "SprintWidget"
      }
    ]
  }
}
```

The `component` value must match a key in the `components` map passed to `createExtension()`.

### Panels (Embedded in Host Pages)

Contribute panels that appear inside existing host pages:

```json
{
  "contributes": {
    "panels": [
      {
        "id": "pr-sidebar",
        "slot": "work:context-panel",
        "label": "PR Info",
        "component": "PrSidebar"
      }
    ]
  }
}
```

Panels render inside `<ExtensionSlot>` components that the host places in its pages.

---

## Error Handling

### What Happens When Your Extension Crashes

1. **JavaScript errors in the iframe** are caught by `window.onerror` in the srcdoc bootstrap
2. The error is forwarded to the host via the MessageChannel
3. The host shows a dismissible red error banner above the extension
4. The error is reported to the main process via `extension:record-error`
5. The main process increments the extension's error count
6. **After 3 errors, the extension is automatically disabled** and a notification is sent to the user

### Best Practices

```tsx
// DO: Wrap async operations in try/catch
async function loadData() {
  try {
    const repos = await sdk.github.listRepos()
    setRepos(repos)
  } catch (err) {
    setError('Failed to load repositories. Check your GitHub connection.')
    console.error('Load failed:', err)
  }
}

// DO: Use React error boundaries
class ExtensionErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#f87171' }}>
          <h2>Something went wrong</h2>
          <p>{this.state.error}</p>
        </div>
      )
    }
    return this.props.children
  }
}

// DO: Handle SDK call timeouts (30s default)
// SDK calls that take longer than 30 seconds will reject with a timeout error

// DON'T: Let unhandled promise rejections bubble up
// DON'T: Throw in render methods without an error boundary
// DON'T: Store sensitive data (the storage API may reject token-like values)
```

### SDK Call Errors

SDK calls can fail for these reasons:

| Error | Cause |
|-------|-------|
| `PERMISSION_DENIED` | Extension doesn't have the required permission |
| `SDK_ERROR` | The underlying IPC call failed |
| `Storage quota exceeded` | Extension's data exceeds `storageQuota` |
| Timeout (30s) | SDK call took too long |
| `Unknown SDK method` | Called a method that doesn't exist |

---

## Security Model

### What Extensions Cannot Do

- **Access raw tokens** — Tokens are in the OS keychain, accessed only by the main process
- **Make direct network requests** — CSP `connect-src 'none'` on the iframe
- **Access the host DOM** — iframe sandbox prevents `window.parent` access
- **Call arbitrary IPC channels** — Extensions can only call their own namespaced channels and permitted host channels
- **Read other extensions' data** — Storage is namespaced per extension
- **Send critical notifications** — Severity is capped at `warning`
- **Access the file system** — No `require('fs')` in the renderer iframe; main process context doesn't expose `fs`
- **Navigate the parent window** — No `allow-top-navigation` in sandbox
- **Open popups** — No `allow-popups` in sandbox
- **Submit forms** — No `allow-forms` in sandbox

### Integrity Verification

When a user-uploaded extension is installed, a SHA-256 hash of the manifest is computed and stored. On subsequent app startups, the hash is re-verified. If the manifest has changed (tampered with), the extension is flagged.

### Audit Trail

Every extension SDK call is logged to the compliance audit system:
- What extension made the call
- What method was called
- When it happened
- Sanitized parameters (tokens/secrets redacted)

View extension activity in **Insights > Compliance**.

---

## Packaging & Distribution

### Building for Distribution

1. Build your extension with your bundler (esbuild, Vite, Rollup)
2. Ensure `dist/` contains the compiled output referenced by `main` and/or `renderer` in the manifest
3. Package the extension using the SDK packaging script:

```bash
npx clearpath-package-extension my-extension --output ../
```

This produces a `.clear.ext` file (a zip archive with a custom extension). The package should contain:
```
clearpath-extension.json     (at the root of the zip)
dist/
  renderer.js
  main.cjs                   (if applicable)
assets/
  icon.svg                   (if applicable)
```

### What to Include in the Package

| Include | Exclude |
|---------|---------|
| `clearpath-extension.json` | `node_modules/` |
| `dist/` (compiled output) | `src/` (source files) |
| `assets/` (icons, images) | `.git/` |
| | `package.json` (not needed at runtime) |
| | `tsconfig.json` |
| | Build scripts |

### Size Considerations

- Extensions bundle their own dependencies (including React for renderer extensions)
- A minimal React extension compiles to ~150 KB minified
- Keep total extension size under 10 MB for reasonable install times
- Use tree-shaking in your bundler to minimize output

---

## Installing Extensions

### From the UI

1. Open **Configure > Extensions**
2. Click **Install Extension**
3. Select a `.clear.ext` file or directory
4. Review the requested permissions
5. Grant/deny each permission
6. Enable the extension

### From the File System

Manually copy an extension directory to:
```
~/Library/Application Support/clear-path/extensions/<extension-id>/
```

On next app restart, the extension will be discovered and registered (disabled by default for user-installed extensions).

### Enabling/Disabling

Toggle the switch in **Configure > Extensions**. Disabling an extension:
- Calls its `deactivate()` lifecycle hook
- Removes its iframe from the DOM
- Unregisters its IPC handlers
- Hides its sidebar navigation entries

The extension's data is preserved. Re-enabling restores full functionality.

### Uninstalling

Click **Uninstall** in the extension's detail panel (only available for user-installed extensions). This:
- Deactivates the extension
- Deletes the extension directory
- Deletes the extension's storage file
- Removes it from the registry

Bundled extensions cannot be uninstalled — only disabled.

---

## Bundled Extensions

Bundled extensions ship inside the ClearPathAI application package. They are placed in `resources/extensions/` during the build process.

### How to Bundle an Extension

Add to `package.json` build configuration:

```json
{
  "build": {
    "extraResources": [
      {
        "from": "extensions/",
        "to": "extensions/",
        "filter": ["**/*"]
      }
    ]
  }
}
```

Place your extension in the `extensions/` directory of the project:

```
clearpath/
  extensions/
    com.clearpathai.pr-scores/
      clearpath-extension.json
      dist/
        main.cjs
        renderer.js
```

### Bundled vs. User Extensions

| Behavior | Bundled | User |
|----------|---------|------|
| Default state | Enabled | Disabled |
| Default permissions | All granted | None (user must grant) |
| Can uninstall | No (only disable) | Yes |
| Updated | With app updates | By user (re-install) |
| Location | `<app>/Resources/extensions/` | `<userData>/extensions/` |

---

## Complete Example: Hello World Extension

A minimal extension that shows a page with a greeting.

**`clearpath-extension.json`:**
```json
{
  "id": "com.example.hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "A minimal ClearPathAI extension",
  "author": "Example",
  "renderer": "dist/renderer.js",
  "permissions": [],
  "contributes": {
    "navigation": [
      {
        "id": "hello-page",
        "path": "/ext/com.example.hello-world",
        "label": "Hello World",
        "icon": "star"
      }
    ]
  }
}
```

**`src/renderer.tsx`:**
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'

function HelloPage() {
  return (
    <div style={{ padding: 32, color: '#e2e8f0' }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Hello from an Extension!</h1>
      <p style={{ color: '#94a3b8' }}>
        This page is rendered inside a sandboxed iframe.
        It cannot access the host app's DOM, tokens, or file system.
      </p>
    </div>
  )
}

// Bootstrap: wait for the MessagePort, then render
window.addEventListener('message', (event) => {
  if (event.data?.type === 'ext:port') {
    const port = event.ports[0]
    if (port) {
      port.postMessage({ type: 'ext:ready' })
    }
    const root = document.getElementById('ext-root')
    if (root) {
      ReactDOM.createRoot(root).render(<HelloPage />)
    }
  }
})
```

This extension has zero permissions — it just renders static content.

---

## Complete Example: GitHub Dashboard Extension

A full extension with both main process and renderer entries, using GitHub integration, storage, and notifications.

**`clearpath-extension.json`:**
```json
{
  "id": "com.example.github-dashboard",
  "name": "GitHub Dashboard",
  "version": "1.0.0",
  "description": "Repository health dashboard with PR metrics",
  "author": "Example Corp",
  "main": "dist/main.cjs",
  "renderer": "dist/renderer.js",
  "permissions": [
    "integration:github:read",
    "storage",
    "notifications:emit"
  ],
  "contributes": {
    "navigation": [
      {
        "id": "dashboard",
        "path": "/ext/com.example.github-dashboard",
        "label": "GitHub Dashboard",
        "icon": "chart-bar"
      }
    ]
  },
  "ipcNamespace": "gh-dash",
  "ipcChannels": [
    "gh-dash:get-summary",
    "gh-dash:refresh"
  ]
}
```

**`src/main.ts`** (compiled to `dist/main.cjs`):
```typescript
import type { ExtensionMainContext } from '@clearpath/extension-sdk'

export async function activate(ctx: ExtensionMainContext): Promise<void> {
  ctx.log.info('GitHub Dashboard activating')

  ctx.registerHandler('gh-dash:get-summary', async () => {
    // Check for cached data first
    const cached = ctx.store.get<{ data: unknown; timestamp: number }>('summary-cache')
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return { success: true, data: cached.data }
    }

    // Fetch fresh data through the host integration proxy
    const repos = await ctx.invoke('integration:github-repos', { perPage: 100 })
    const repoList = (repos as { success: boolean; data: unknown[] }).data ?? []

    const summary = {
      totalRepos: repoList.length,
      timestamp: new Date().toISOString(),
    }

    // Cache the result
    ctx.store.set('summary-cache', { data: summary, timestamp: Date.now() })

    return { success: true, data: summary }
  })

  ctx.registerHandler('gh-dash:refresh', async () => {
    ctx.store.delete('summary-cache')
    return { success: true }
  })
}

export function deactivate(): void {}
```

**`src/renderer.tsx`** (compiled to `dist/renderer.js`):
```tsx
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'

let port: MessagePort | null = null
let reqId = 0
const pending = new Map<string, (v: unknown) => void>()

function request(method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `r-${++reqId}`
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Timeout'))
    }, 30000)
    pending.set(id, (v) => { clearTimeout(timer); resolve(v) })
    port?.postMessage({ type: 'ext:request', id, method, params })
  })
}

function Dashboard() {
  const [summary, setSummary] = useState<{ totalRepos: number; timestamp: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const result = await request('gh-dash:get-summary') as {
        success: boolean; data?: { totalRepos: number; timestamp: string }; error?: string
      }
      if (result.success && result.data) {
        setSummary(result.data)
      } else {
        setError(result.error ?? 'Failed to load')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: 24, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>GitHub Dashboard</h1>
        <button
          onClick={async () => {
            await request('gh-dash:refresh')
            load()
          }}
          style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {loading && <p style={{ color: '#94a3b8' }}>Loading...</p>}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      {summary && (
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: '#6366f1' }}>
            {summary.totalRepos}
          </div>
          <div style={{ color: '#94a3b8', marginTop: 4 }}>Total Repositories</div>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 12 }}>
            Last updated: {summary.timestamp}
          </div>
        </div>
      )}
    </div>
  )
}

// Bootstrap
window.addEventListener('message', (event) => {
  if (event.data?.type === 'ext:port') {
    port = event.ports[0]
    if (!port) return

    port.onmessage = (e) => {
      if (e.data?.type === 'ext:response') {
        const resolver = pending.get(e.data.id)
        if (resolver) {
          pending.delete(e.data.id)
          resolver(e.data.result ?? e.data.error)
        }
      }
    }

    port.postMessage({ type: 'ext:ready' })

    const root = document.getElementById('ext-root')
    if (root) {
      ReactDOM.createRoot(root).render(<Dashboard />)
    }
  }
})
```

---

## Reference Implementation: PR Scores Extension

The PR Scores feature ships as a bundled extension at `extensions/com.clearpathai.pr-scores/`. It is the reference implementation for the extension system and demonstrates every major pattern:

### What It Does

PR Scores analyzes GitHub pull requests and assigns them a quality score from 0 to 100 based on cycle time, pickup time, CI pass rate, reviewer count, and lines changed. It includes repo-level dashboards, author breakdowns, trend charts, and AI-powered code review context.

### File Structure

```
extensions/com.clearpathai.pr-scores/
  clearpath-extension.json    # Manifest with 14 IPC channels, 3 permissions
  dist/
    main.cjs                  # Main process: 14 handler registrations using ctx
  assets/
    icon.svg                  # Extension icon
```

### Key Patterns Demonstrated

**1. Main process handlers using `ctx.registerHandler()`**

The extension registers 14 IPC handlers, all prefixed with `pr-scores:`:

```javascript
ctx.registerHandler('pr-scores:score-pr', async (_e, args) => {
  const auth = await getGitHubToken()   // Gets token via host proxy
  const pkg = await getPrScorePackage() // Dynamic ESM import
  const { collectPullRequests, scorePr } = pkg

  const prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since: '1970-01-01', auth })
  const pr = prs.find((p) => p.number === args.prNumber)
  const scored = scorePr(pr)

  // Store result in extension storage
  let scores = ctx.store.get('scores', [])
  scores.push({ ...scored, id: randomUUID(), scoredAt: Date.now() })
  ctx.store.set('scores', scores)

  return { success: true, score: scored }
})
```

**2. Credential access through the host proxy**

The extension never calls `retrieveSecret()` directly. Instead:

```javascript
async function getGitHubToken() {
  const token = await ctx.invoke('integration:get-github-token')
  if (!token) throw new Error('GitHub token not configured')
  return token
}
```

This calls through to the host, which checks the extension's `integration:github:read` permission before returning the token from the OS keychain.

**3. Extension storage for caching**

PR score results are cached in the extension's own encrypted store:

```javascript
ctx.store.set('scores', scores)           // Cache scored PRs
ctx.store.set('repoSnapshots', snapshots) // Cache repo metrics
ctx.store.get('config', DEFAULT_CONFIG)   // Read config with defaults
```

**4. Dynamic ESM import**

The `pull-request-score` package is ESM-only. The extension uses dynamic import:

```javascript
const _dynamicImport = new Function('mod', 'return import(mod)')
let _prScorePkg = null
async function getPrScorePackage() {
  if (!_prScorePkg) _prScorePkg = await _dynamicImport('pull-request-score')
  return _prScorePkg
}
```

**5. Manifest with full contributions**

The manifest declares navigation (sidebar entry), feature flags, 14 IPC channels with namespace enforcement, 3 permissions, and a 10 MB storage quota.

### How It Ships

PR Scores is a **bundled extension** — it ships inside the app package via `electron-builder`'s `extraResources` config. On first launch, the `ExtensionRegistry` discovers it, auto-enables it, and grants all declared permissions. Users can disable it in Configure > Extensions but cannot uninstall it (bundled extensions can only be disabled).

---

## Build Your Own Extension: Start to Finish Walkthrough

This is a complete, linear walkthrough for building a ClearPathAI extension from scratch. By the end, you will have a working extension with a React UI page, persistent storage, notifications, and a sidebar entry.

### What We're Building

A "Bookmark Manager" extension that lets users bookmark GitHub repositories and display them in a custom page.

### Step 1: Create the Project

```bash
mkdir bookmark-manager
cd bookmark-manager
npm init -y
npm install react react-dom
npm install -D esbuild @types/react @types/react-dom typescript
```

### Step 2: Write the Manifest

Create `clearpath-extension.json`:

```json
{
  "id": "com.yourname.bookmark-manager",
  "name": "Bookmark Manager",
  "version": "1.0.0",
  "description": "Bookmark and organize your favorite GitHub repositories",
  "author": "Your Name",
  "minAppVersion": "1.8.0",
  "renderer": "dist/renderer.js",
  "permissions": [
    "integration:github:read",
    "storage",
    "notifications:emit"
  ],
  "contributes": {
    "navigation": [
      {
        "id": "bookmarks-page",
        "path": "/ext/com.yourname.bookmark-manager",
        "label": "Bookmarks",
        "icon": "bookmark",
        "position": "after:work"
      }
    ]
  }
}
```

### Step 3: Write the Renderer

Create `src/renderer.tsx`:

```tsx
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface Bookmark {
  id: string
  repoFullName: string
  description: string
  language: string | null
  addedAt: number
}

// ── SDK Communication Layer ──────────────────────────────────────────────────
// In production, use @clearpath/extension-sdk. This is the raw approach.

let port: MessagePort | null = null
let reqId = 0
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function sdk(method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!port) return reject(new Error('SDK not connected'))
    const id = `r-${++reqId}`
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timeout')) }, 30000)
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v) },
      reject: (e) => { clearTimeout(timer); reject(e) },
    })
    port.postMessage({ type: 'ext:request', id, method, params })
  })
}

// Unwrap { success, data, error } responses
async function call<T>(method: string, params?: unknown): Promise<T> {
  const result = await sdk(method, params) as { success?: boolean; data?: T; error?: string }
  if (result && typeof result === 'object' && 'success' in result) {
    if (!result.success) throw new Error(result.error ?? 'Failed')
    return result.data as T
  }
  return result as T
}

// ── App Component ────────────────────────────────────────────────────────────

function BookmarkManager() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [repos, setRepos] = useState<Array<{ fullName: string; description: string | null; language: string | null }>>([])
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)

  // Load bookmarks from storage on mount
  useEffect(() => {
    loadBookmarks()
    loadRepos()
  }, [])

  async function loadBookmarks() {
    try {
      const stored = await call<Bookmark[]>('storage.get', { key: 'bookmarks' })
      setBookmarks(stored ?? [])
    } catch {
      setBookmarks([])
    } finally {
      setLoading(false)
    }
  }

  async function loadRepos() {
    try {
      const data = await call<Array<{ fullName: string; description: string | null; language: string | null }>>(
        'github.listRepos',
        { perPage: 50 }
      )
      setRepos(data ?? [])
    } catch {
      // GitHub not connected — that's fine
    }
  }

  async function addBookmark(repo: { fullName: string; description: string | null; language: string | null }) {
    const existing = bookmarks.find((b) => b.repoFullName === repo.fullName)
    if (existing) return

    const newBookmark: Bookmark = {
      id: `bm-${Date.now()}`,
      repoFullName: repo.fullName,
      description: repo.description ?? '',
      language: repo.language,
      addedAt: Date.now(),
    }

    const updated = [...bookmarks, newBookmark]
    setBookmarks(updated)
    await call('storage.set', { key: 'bookmarks', value: updated })
    await call('notifications.emit', {
      title: 'Bookmark Added',
      message: `${repo.fullName} has been bookmarked!`,
      severity: 'info',
    })
    setShowPicker(false)
  }

  async function removeBookmark(id: string) {
    const updated = bookmarks.filter((b) => b.id !== id)
    setBookmarks(updated)
    await call('storage.set', { key: 'bookmarks', value: updated })
  }

  if (loading) {
    return <div style={{ padding: 24, color: '#94a3b8' }}>Loading bookmarks...</div>
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Bookmarks</h1>
        <button
          onClick={() => setShowPicker(!showPicker)}
          style={{
            background: '#4f46e5', color: '#fff', border: 'none',
            borderRadius: 6, padding: '8px 16px', cursor: 'pointer',
          }}
        >
          {showPicker ? 'Cancel' : '+ Add Bookmark'}
        </button>
      </div>

      {/* Repo picker */}
      {showPicker && (
        <div style={{ marginBottom: 24, background: '#1e293b', borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#94a3b8' }}>
            Select a repository to bookmark:
          </h3>
          <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
            {repos.map((repo) => (
              <button
                key={repo.fullName}
                onClick={() => addBookmark(repo)}
                style={{
                  background: '#334155', color: '#e2e8f0', border: 'none',
                  borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600 }}>{repo.fullName}</div>
                {repo.description && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{repo.description}</div>
                )}
              </button>
            ))}
            {repos.length === 0 && (
              <p style={{ color: '#64748b', fontSize: 14 }}>
                No repositories found. Connect GitHub in Configure &gt; Integrations first.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bookmark list */}
      {bookmarks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>
          <p style={{ fontSize: 18 }}>No bookmarks yet</p>
          <p style={{ fontSize: 14 }}>Click "+ Add Bookmark" to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              style={{
                background: '#1e293b', borderRadius: 12, padding: 16,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{bm.repoFullName}</div>
                {bm.description && (
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{bm.description}</div>
                )}
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                  {bm.language && <span style={{ marginRight: 12 }}>{bm.language}</span>}
                  Added {new Date(bm.addedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => removeBookmark(bm.id)}
                style={{
                  background: 'transparent', color: '#ef4444', border: '1px solid #ef4444',
                  borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

window.addEventListener('message', (event) => {
  if (event.data?.type !== 'ext:port') return
  port = event.ports[0]
  if (!port) return

  port.onmessage = (e) => {
    if (e.data?.type === 'ext:response') {
      const p = pending.get(e.data.id)
      if (p) {
        pending.delete(e.data.id)
        if (e.data.error) p.reject(new Error(e.data.error.message ?? 'SDK error'))
        else p.resolve(e.data.result)
      }
    }
  }

  port.postMessage({ type: 'ext:ready' })

  const root = document.getElementById('ext-root')
  if (root) ReactDOM.createRoot(root).render(<BookmarkManager />)
})
```

### Step 4: Create the Build Script

Create `build.mjs`:

```javascript
import { build } from 'esbuild'

await build({
  entryPoints: ['src/renderer.tsx'],
  bundle: true,
  outfile: 'dist/renderer.js',
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  minify: true,
})

console.log('Build complete!')
```

### Step 5: Add TypeScript Config

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

### Step 6: Build

```bash
node build.mjs
```

Your directory should now look like:

```
bookmark-manager/
  clearpath-extension.json
  dist/
    renderer.js              <-- ~150 KB bundled
  src/
    renderer.tsx
  build.mjs
  tsconfig.json
  package.json
  node_modules/
```

### Step 7: Install in ClearPathAI

1. Open ClearPathAI
2. Go to **Configure > Extensions**
3. Click **Install Extension**
4. Select the `bookmark-manager/` directory
5. You'll see the permission consent dialog:
   - "Read your GitHub repositories, pull requests, and issues" -- **Grant**
   - "Store data locally (up to 5 MB)" -- **Grant**
   - "Send you notifications" -- **Grant**
6. Toggle the extension **On**
7. A new "Bookmarks" entry appears in the sidebar

### Step 8: Test

1. Click "Bookmarks" in the sidebar
2. Click "+ Add Bookmark"
3. Select a repository from the picker
4. You should see a notification "Bookmark Added"
5. The bookmark persists across app restarts (stored in encrypted extension storage)
6. Click "Remove" to delete a bookmark

### Step 9: Package for Distribution

```bash
# Package the extension into a .clear.ext file
npx clearpath-package-extension . --output ../
```

Share the `.clear.ext` file. Users install it the same way — select the file in Configure > Extensions.

### What You've Built

Your extension:
- Renders a full React page inside a sandboxed iframe
- Reads GitHub repositories through the secure proxy (no raw token access)
- Persists bookmarks in encrypted, quota-limited storage
- Sends notifications through the host's notification system
- Adds a sidebar navigation entry
- Cannot crash the app, access other extensions' data, or make undeclared network requests

This is the same architecture used by ClearPathAI's own bundled PR Scores extension.

---

## Troubleshooting

### Extension doesn't appear in the sidebar

1. Check that the extension is **enabled** in Configure > Extensions
2. Verify the `contributes.navigation` path starts with `/ext/`
3. Check if `featureGate` flags are enabled
4. Click **Refresh** in the Extensions manager

### "Permission denied" errors

1. Open Configure > Extensions
2. Expand the extension
3. Check which permissions are granted vs. denied
4. Grant the required permissions

### Extension shows "Loading..." forever

1. Check that `renderer` in the manifest points to an existing file
2. Verify the renderer JS is bundled as IIFE format (not ESM or CJS)
3. Check the browser DevTools console for errors (the iframe has its own console)

### Extension was auto-disabled

The extension threw 3+ errors in rapid succession. To re-enable:
1. Open Configure > Extensions
2. Toggle the extension off, then on again (this resets the error count)

### Build errors

- **"Cannot use import statement"**: Your renderer must be bundled as IIFE, not ESM
- **"React is not defined"**: You need to bundle React into your extension (it's isolated in an iframe)
- **"Cannot find module @clearpath/extension-sdk"**: Install it via `npm install @clearpath/extension-sdk`

### Storage quota exceeded

Your extension is using more than its `storageQuota` (default 5 MB). Either:
- Clean up old data with `sdk.storage.delete()`
- Increase `storageQuota` in the manifest (max 50 MB)
- Store large data externally via `sdk.http.fetch`

---

## Manifest Reference (Quick Lookup)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | string | Yes | — | Reverse-domain unique identifier |
| `name` | string | Yes | — | Display name |
| `version` | string | Yes | — | Semantic version |
| `description` | string | Yes | — | Brief description |
| `author` | string | Yes | — | Author name |
| `permissions` | string[] | Yes | — | Requested permissions |
| `icon` | string | No | — | Path to 64x64 SVG icon |
| `minAppVersion` | string | No | — | Minimum ClearPathAI version |
| `main` | string | No | — | Main process entry (CJS) |
| `renderer` | string | No | — | Renderer entry (bundled JS) |
| `allowedDomains` | string[] | No | `[]` | Domains for http:fetch |
| `contributes` | object | No | — | UI contributions |
| `contributes.navigation` | array | No | — | Sidebar nav entries |
| `contributes.panels` | array | No | — | Embedded panels |
| `contributes.widgets` | array | No | — | Dashboard widgets |
| `contributes.featureFlags` | string[] | No | — | Feature flags to register |
| `requires` | array | No | — | Integrations the extension needs |
| `requires[].integration` | string | Yes | — | Integration key (e.g., "github") |
| `requires[].label` | string | Yes | — | Human-readable name (e.g., "GitHub") |
| `requires[].message` | string | Yes | — | Message shown when not connected |
| `ipcNamespace` | string | No | — | IPC channel prefix |
| `ipcChannels` | string[] | No | — | IPC channels to register |
| `storageQuota` | number | No | 5242880 | Max storage in bytes |

---

## SDK API Reference (Quick Lookup)

### Renderer SDK (`useSDK()`)

| Method | Permission | Description |
|--------|-----------|-------------|
| `sdk.github.listRepos(opts?)` | `integration:github:read` | List repositories |
| `sdk.github.listPulls(owner, repo, opts?)` | `integration:github:read` | List pull requests |
| `sdk.github.getPull(owner, repo, num)` | `integration:github:read` | Get PR detail |
| `sdk.github.listIssues(owner, repo, opts?)` | `integration:github:read` | List issues |
| `sdk.github.search(query, type?)` | `integration:github:read` | Search GitHub |
| `sdk.storage.get(key)` | `storage` | Read from storage |
| `sdk.storage.set(key, value)` | `storage` | Write to storage |
| `sdk.storage.delete(key)` | `storage` | Delete from storage |
| `sdk.storage.keys()` | `storage` | List all keys |
| `sdk.storage.quota()` | `storage` | Get used/limit bytes |
| `sdk.notifications.emit(opts)` | `notifications:emit` | Send notification |
| `sdk.env.get(key)` | `env:read` | Read env var |
| `sdk.env.keys()` | `env:read` | List env var keys |
| `sdk.http.fetch(url, opts?)` | `http:fetch` | Proxied HTTP request |
| `sdk.theme.get()` | (always) | Get current theme |
| `sdk.theme.onChange(cb)` | (always) | Listen for theme changes |
| `sdk.navigate(path)` | `navigation` | Navigate host app |

### Main Process Context (`ExtensionMainContext`)

| Method | Description |
|--------|-------------|
| `ctx.registerHandler(channel, handler)` | Register IPC handler (namespace-enforced) |
| `ctx.invoke(channel, ...args)` | Call host IPC channel (permission-checked) |
| `ctx.store.get(key, default?)` | Read from storage (synchronous) |
| `ctx.store.set(key, value)` | Write to storage |
| `ctx.store.delete(key)` | Delete from storage |
| `ctx.store.keys()` | List all storage keys |
| `ctx.log.info/warn/error/debug(...)` | Log with extension prefix |
| `ctx.extensionId` | Extension's ID |
| `ctx.extensionPath` | Absolute path to extension directory |

---

## New Permissions (v1.8.0+)

| Permission | Description |
|---|---|
| `sessions:read` | Read session list and message logs |
| `sessions:lifecycle` | Subscribe to turn/session lifecycle events |
| `cost:read` | Read cost records, budget config, summaries |
| `feature-flags:read` | Read feature flag values |
| `feature-flags:write` | Set feature flags programmatically |
| `local-models:access` | Detect and chat with Ollama/LM Studio |
| `context:estimate` | Estimate token counts for context items |
| `notes:read` | Read notes/memory content |
| `skills:read` | Read skill content |

## New SDK APIs (v1.8.0+)

### Sessions

```typescript
sdk.sessions.list()              // List all sessions (active + persisted)
sdk.sessions.getMessages(id)     // Get message log for a session
sdk.sessions.getActive()         // Get currently active session ID
```

### Cost

```typescript
sdk.cost.summary()               // Cost summary (today/week/month totals)
sdk.cost.list({ since?, until? }) // List cost records with time filter
sdk.cost.getBudget()             // Get budget configuration
sdk.cost.bySession({ since? })   // Per-session cost breakdown
```

### Feature Flags

```typescript
sdk.featureFlags.getAll()         // Get all feature flag values
sdk.featureFlags.get(key)         // Get single flag
sdk.featureFlags.set(key, value)  // Set single flag (requires feature-flags:write)
```

### Local Models

```typescript
sdk.localModels.detect()          // Detect Ollama/LM Studio servers
sdk.localModels.chat({ model, messages, source? }) // Chat completion
```

### Context

```typescript
sdk.context.estimateTokens(text)  // Estimate token count (chars/4 heuristic)
```

### Events

```typescript
const unsub = sdk.events.on('turn:ended', (data) => { ... })
unsub() // unsubscribe
```

**Available events:**
- `session:started` — `{ sessionId, cli, name }`
- `session:stopped` — `{ sessionId, exitCode }`
- `turn:started` — `{ sessionId }`
- `turn:ended` — `{ sessionId, turnIndex, durationMs, inputTokens, outputTokens, hadError }`
- `cost:recorded` — `{ sessionId, totalTokens, estimatedCostUsd }`
- `slot:data-changed` — `{ ...slotData }` (dynamic data from host page)

## New Manifest Contributions (v1.8.0+)

### Tab Contributions

Extensions can contribute tabs to tabbed pages like Insights:

```json
"contributes": {
  "tabs": [
    { "id": "my-tab", "page": "insights", "label": "My Tab", "component": "MyComponent", "position": "end" }
  ]
}
```

### Sidebar Widget Contributions

```json
"contributes": {
  "sidebarWidgets": [
    { "id": "my-widget", "label": "My Widget", "component": "MyWidget", "position": "status" }
  ]
}
```

### Session Hooks

Extensions can hook into session lifecycle events:

```json
"contributes": {
  "sessionHooks": [
    { "event": "turn:ended", "handler": "my-namespace:on-turn-ended" }
  ]
}
```

When the event fires, the host calls the extension's registered IPC handler with the event data.

## ExtensionSlot Locations

Host pages provide named slots where extensions can inject UI via panel contributions:

| Slot Name | Location | Purpose |
|---|---|---|
| `work:above-input` | Work page, above command input | Pre-send controls, tips |
| `sidebar:status` | Sidebar, above nav items | Toggle switches, status |
| `session-summary:after-stats` | Session summary modal | Post-session analysis |
| `home:widgets` | Home page, bottom section | Dashboard widgets |
| `wizard:context` | Session wizard, context step | Context estimation |

### Slot Data

Slots can pass dynamic data to extensions:

```jsx
<ExtensionSlot slotName="wizard:context" slotData={{ selectedNoteIds, selectedSkillId }} />
```

Extensions receive this via the `slot:data-changed` event through `sdk.events.on()`.

## Reference Implementation: AI Efficiency Coach

The AI Efficiency Coach (`com.clearpathai.efficiency-coach`) is a bundled extension that demonstrates advanced extension capabilities:

- **21 IPC handlers** for telemetry, analysis, recommendations, and efficiency mode control
- **Session hooks** to capture turn metrics automatically via `turn:ended`
- **Feature flag control** to implement Efficiency Mode (gates sub-agents, composer, scheduler)
- **Local model integration** for LLM-assisted recommendations via Ollama/LM Studio
- **Multiple slot contributions** across Work page, sidebar, session summary, home, and wizard
- **Insights tab contribution** adding an "Efficiency" tab with scoring dashboard
- **50MB storage quota** for turn metrics, session efficiency records, and reports

Key patterns demonstrated:
1. Using `ctx.invoke()` to access host data (sessions, cost, notes, feature flags)
2. Session hooks for automatic data collection
3. Deterministic scoring with optional LLM enhancement
4. Feature flag manipulation for mode toggling with state preservation

## Context Source Tagging

Extensions and integrations can declare themselves as "context providers" that users can tag in AI sessions. When tagged, data is fetched at send-time and text-injected alongside the user's prompt.

### Declaring a Context Provider (Extension Manifest)

```json
"contributes": {
  "contextProviders": [
    {
      "id": "my-data",
      "label": "My Data Source",
      "description": "What this data source provides",
      "icon": "database",
      "parameters": [
        { "id": "project", "label": "Project", "type": "text", "required": true, "placeholder": "e.g. my-project" }
      ],
      "handler": "my-namespace:build-context",
      "examples": ["What does the data show?", "Summarize the key metrics"],
      "maxTokenEstimate": 3000
    }
  ]
}
```

### Handler Return Format

The `handler` IPC channel receives `params: Record<string, string>` and returns:

```typescript
{
  success: boolean
  context: string        // Formatted text to inject into the AI prompt
  tokenEstimate: number  // Estimated token count for the context
  metadata?: {
    itemCount?: number
    truncated?: boolean
  }
}
```

### How It Works

1. User opens "Context Sources" picker in QuickCompose
2. Available sources shown grouped by Extensions and Integrations
3. User selects a source and provides parameters (if needed)
4. Badge appears in the context bar (e.g., "PR Scores (acme/widgets)")
5. On send, app calls `context-sources:fetch-multi` with all selected sources
6. Data is fetched in parallel, formatted, and prepended to the prompt as `--- Context: Label ---`
7. AI receives the full context and can answer questions about it

### Built-in Integration Providers

Connected integrations automatically expose context providers:
- **GitHub Open PRs** — PR titles, authors, age, review status for a repo
- **GitHub Issues** — Open issues with labels and assignees
- **GitHub Search** — Search across code, issues, and PRs
- **Jira Current Sprint** — Sprint issues with status and priority
- **ServiceNow Incidents** — Recent open incidents
- **Datadog Monitor Status** — Alerting monitors

### IPC Channels

| Channel | Description |
|---|---|
| `context-sources:list` | List all available context providers (extensions + integrations) |
| `context-sources:fetch` | Fetch context from a single provider |
| `context-sources:fetch-multi` | Fetch context from multiple providers in parallel |
