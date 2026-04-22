# Extension Testing — Developer Guide

How to build the SDK example extension from source and run the extension e2e test suite.

---

## Prerequisites

- **Node.js 18+**
- Root dependencies installed: `npm install`
- App built at least once: `npm run build` (required before e2e)

---

## Running the Extension E2E Tests

### Single command

```bash
npm run e2e:extensions
```

This runs three steps in sequence:

1. **Build and package** — `node scripts/build-sdk-for-testing.js`
2. **Build the Electron app** — `npm run build`
3. **Run WebdriverIO tests** — `wdio run wdio.extensions.conf.ts`

The test suite installs the example extension, exercises all IPC channels, toggles it, and uninstalls it.

---

## How the Build Works

`scripts/build-sdk-for-testing.js` mirrors exactly what a consumer does when they get the SDK from npm:

| Step | What happens | Why |
|------|-------------|-----|
| 1 | Compile SDK TypeScript → `extension-sdk/dist/` | Produces the published JS+types |
| 2 | `npm pack` the SDK → `clearpath-extension-sdk-*.tgz` | Registry-equivalent tarball |
| 3 | `npm install --legacy-peer-deps` in example dir | Install example devDependencies |
| 4 | `npm install --no-save <tarball>` in example dir | Install SDK as a consumer would |
| 5 | `node build.mjs --dist` in example dir | Bundle against installed SDK, no source alias |
| 6 | `package-extension.js` → `com.clearpathai.sdk-example-v1.0.0.clear.ext` | Zip to project root |

The `--dist` flag in step 5 disables the local source alias so esbuild resolves `@clearpath/extension-sdk` from `node_modules` — the compiled package — rather than from `../../src/index.ts`. This is the same bundle a real consumer would ship.

---

## Building the Example Extension Manually

### For local development (source alias — fast iteration)

```bash
cd extension-sdk/example/com.clearpathai.sdk-example
npm install --legacy-peer-deps
npm run bundle          # build.mjs — aliases @clearpath/extension-sdk to ../../src/
npm run package         # bundle + package (output to example dir)
```

| File | Description |
|------|-------------|
| `dist/main.cjs` | Main-process entry (Node.js, CommonJS) |
| `dist/renderer.js` | Renderer entry (self-contained IIFE for sandboxed iframe) |

### For distribution testing (dist mode — mirrors consumer install)

Use the automated script from the project root:

```bash
node scripts/build-sdk-for-testing.js
```

Or, run the steps manually:

```bash
# 1. Build SDK
cd extension-sdk
npm run build

# 2. Pack SDK into a tarball
npm pack
# → clearpath-extension-sdk-0.2.0.tgz

# 3. Install example deps + SDK tarball
cd example/com.clearpathai.sdk-example
npm install --legacy-peer-deps
npm install --no-save --legacy-peer-deps ../../clearpath-extension-sdk-0.2.0.tgz

# 4. Bundle in dist mode
node build.mjs --dist

# 5. Package to a .clear.ext
node ../../scripts/package-extension.js . --output ../../../../
```

### SDK-level shortcuts (from `extension-sdk/`)

```bash
npm run example:bundle        # dev bundle only (source alias)
npm run example:package       # dev bundle + package (output to example dir)
npm run example:test-dist     # full dist test build → .clear.ext at project root
```

---

## Packaging the Extension

```bash
# From project root — output to project root (where e2e tests expect it)
node extension-sdk/scripts/package-extension.js extension-sdk/example/com.clearpathai.sdk-example --output ./

# To a specific directory
node extension-sdk/scripts/package-extension.js extension-sdk/example/com.clearpathai.sdk-example --output ~/Desktop
```

The packaged `.clear.ext` is a standard ZIP archive containing the manifest, `dist/`, and `assets/` — no `node_modules`, no source files.

---

## What the E2E Tests Cover

### SDK Build Pre-conditions
| Test | What is checked |
|------|----------------|
| .clear.ext exists at expected path | Fails with a useful message if pretest wasn't run |
| .clear.ext is a non-empty file | Basic archive integrity |

### Extension Install
| Test | What is checked |
|------|----------------|
| Install via IPC | `extension:install` returns success and correct manifest ID |
| Shows in list | Extension card appears in the UI |
| Source badge | Newly installed extension is marked `user` source |
| extension:list IPC | Lists the extension with correct source |

### IPC Channel Access (13 handlers)
| Test | Handler | What is verified |
|------|---------|-----------------|
| Health check | `sdk-example:health` | status=healthy, handlers array non-empty |
| Get config | `sdk-example:get-config` | Returns config object |
| Config round-trip | `sdk-example:set-config` + `sdk-example:get-config` | Written value reads back correctly |
| Increment counter | `sdk-example:increment-counter` | Returns numeric counter |
| Event log | `sdk-example:get-event-log` | Returns array |
| Storage stats | `sdk-example:get-storage-stats` | Returns keyCount |
| Clear event log | `sdk-example:clear-event-log` | Returns success |
| Demo data | `sdk-example:get-demo-data` | Returns extensionId |
| Context provider | `sdk-example:ctx-demo` | Returns context + topic metadata |
| Handler count | `sdk-example:health` | Exactly 13 handlers registered (matches manifest) |

### Toggle and Restart Flow
| Test | What is verified |
|------|----------------|
| No restart banner on install | refreshExtensionChannels() used; no pendingRestart |
| Toggle shows banner | `Changes require a restart` appears |
| Dismiss hides banner | Banner removed after click |
| Restart now / Restart App buttons | Present when pending |
| Tab navigation guard | Modal appears when navigating away with pending changes |
| Stay here / Continue without restart | Both options work correctly |

### IPC Integration
| Test | What is verified |
|------|----------------|
| extension:toggle | Enabled state changes and persists |
| extension:get | Returns manifest, enabled, source, grantedPermissions |

### Cleanup
| Test | What is verified |
|------|----------------|
| Uninstall | extension:uninstall completes without error |
| No critical errors | Console has no critical errors after all tests |

---

## Running Just the Unit Tests

Extension unit tests run as part of the main test suite:

```bash
npm test
# or target just extension files:
npx vitest run src/main/extensions/ src/main/ipc/extensionHandlers.test.ts
```

---

## TypeScript Configs

The example ships two TypeScript configs for type-checking (bundling uses esbuild directly, not `tsc`):

| File | When to use |
|------|-------------|
| `tsconfig.json` | Source checkout — resolves `@clearpath/extension-sdk` via path alias to `../../src/` |
| `tsconfig.dist.json` | Distribution — no path aliases; expects the SDK in `node_modules` |

```bash
cd extension-sdk/example/com.clearpathai.sdk-example

# Type-check against local SDK source
npx tsc -p tsconfig.json --noEmit

# Type-check against installed SDK (distribution validation)
npx tsc -p tsconfig.dist.json --noEmit
```
