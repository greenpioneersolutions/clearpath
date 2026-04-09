# Build, Distribution & Auto-Updates

---

## Build Toolchain

| Tool | Status | Description |
|------|--------|-------------|
| **Electron Forge** | Officially recommended | Integrated packaging, signing, fuses, updates |
| **electron-builder** | Community-maintained | Alternative with `electron-updater` for cross-platform updates |

## ASAR Archives

Bundles source into a single archive. Benefits: fixes Windows long paths, accelerates `require`, basic obfuscation.

### Limitations
- **Read-only** — write operations fail
- Cannot `chdir` into archive directories
- Some APIs trigger temp file extraction (`child_process.execFile`, `fs.open`, `process.dlopen`)
- `fs.stat` results are guessed — only trust file size and type

### Unpacking Native Modules
```bash
asar pack app app.asar --unpack *.node
```
Generates `app.asar` + `app.asar.unpacked/` — ship both.

---

## Fuses

Compile-time security toggles flipped before code signing.

| Fuse | Default | Effect |
|------|---------|--------|
| `RunAsNode` | Enabled | Controls `ELECTRON_RUN_AS_NODE`. Disabling breaks `child_process.fork` |
| `EnableCookieEncryption` | Disabled | OS-level cookie encryption. **One-way: enabling then disabling corrupts store** |
| `EnableNodeOptionsEnvironmentVariable` | Enabled | Controls `NODE_OPTIONS` env var |
| `EnableNodeCliInspectArguments` | Enabled | Controls `--inspect` flags |
| `OnlyLoadAppFromAsar` | Disabled | Restricts loading to `app.asar` only |
| `GrantFileProtocolExtraPrivileges` | Enabled | Controls `file://` elevated privileges |
| `EnableEmbeddedAsarIntegrityValidation` | Disabled | Validates `app.asar` content (macOS/Windows) |

```js
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
flipFuses(require('electron'), {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false
})
```

Validate: `npx @electron/fuses read --app /path/to/app`

---

## Code Signing

### macOS

- **Required:** Apple Developer Program enrollment + Xcode
- **Two-step:** Code sign → submit for notarization
- Tools: `@electron/osx-sign`, `@electron/notarize` (integrated in Forge)

### Windows

- **Required:** EV (Extended Validation) certificate since June 2023
- Must be on FIPS 140 Level 2 or Common Criteria EAL 4+ hardware
- **Azure Trusted Signing** available for US/Canada orgs (Oct 2025+)
- All tools use `@electron/windows-sign`

### Linux

No code signing requirements.

---

## Native Modules

Native modules must be recompiled for Electron's Node.js ABI (uses BoringSSL, not OpenSSL).

### Method 1: @electron/rebuild (Recommended)
```bash
npm install --save-dev @electron/rebuild
npx electron-rebuild
```

### Method 2: npm with env variables
```bash
export npm_config_target=31.0.0  # Electron version
export npm_config_runtime=electron
export npm_config_disturl=https://electronjs.org/headers
npm install
```

### Windows: win_delay_load_hook

Required in `binding.gyp`: `'win_delay_load_hook': 'true'`

Error indicators: "Module did not self-register" or "The specified procedure could not be found"

**Always rebuild native modules after every Electron upgrade.**

---

## Auto-Updates

### Built-in autoUpdater

**Process:** Main | macOS + Windows only (not Linux)

| Method | Description |
|--------|-------------|
| `setFeedURL(options)` | `{url, headers (macOS), serverType (macOS)}` |
| `checkForUpdates()` | Must call `setFeedURL` first. **Calling twice = duplicate downloads** |
| `quitAndInstall()` | Install after `update-downloaded` event |

| Event | Description |
|-------|-------------|
| `checking-for-update` | Checking started |
| `update-available` | Update found, download starts automatically |
| `update-not-available` | No update |
| `update-downloaded` | Ready to install |
| `error` | Update error |

**Platform differences:**
- macOS (Squirrel.Mac): JSON response, 204 for no update
- Windows (Squirrel.Windows/MSIX): RELEASES file + nupkg

### electron-updater (Cross-Platform)

```ts
import { autoUpdater } from 'electron-updater'

autoUpdater.checkForUpdatesAndNotify()
autoUpdater.on('update-downloaded', (info) => {
  // Prompt user to restart
  autoUpdater.quitAndInstall()
})
```

### Update Sources

| Source | Description |
|--------|-------------|
| **Cloud storage** (S3, GCS) | Static files — serverless |
| **update.electronjs.org** | Free service for public GitHub repos |
| **Hazel** | Vercel-deployable, private repos |
| **Nuts** | Caches on disk, supports private repos |
| **electron-release-server** | Dashboard, no GitHub dependency |

**Critical:** Only run update code in packaged apps — check `app.isPackaged`.

---

## Distribution Checklist

1. Bundle source with ASAR
2. Rebuild native modules with `@electron/rebuild`
3. Flip security fuses with `@electron/fuses`
4. Code-sign (macOS: notarize; Windows: EV cert)
5. Never ship `devDependencies`
6. Set up auto-updates
7. Test on target platforms
