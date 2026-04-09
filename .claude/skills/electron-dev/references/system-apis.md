# System APIs: globalShortcut, powerMonitor, screen, systemPreferences, safeStorage

---

## globalShortcut

**Process:** Main

| Method | Returns | Description |
|--------|---------|-------------|
| `register(accelerator, callback)` | boolean | Silently fails if taken by another app |
| `registerAll(accelerators, callback)` | void | Same silent-fail behavior |
| `isRegistered(accelerator)` | boolean | False if taken by other apps |
| `unregister(accelerator)` | void | |
| `unregisterAll()` | void | **Always call in `will-quit` event** |

**macOS 10.14+:** Media shortcuts require "trusted accessibility client" authorization.

---

## powerMonitor

**Process:** Main

### Events

| Event | Parameters | Platform |
|-------|-----------|----------|
| `suspend` / `resume` | — | All |
| `on-ac` / `on-battery` | — | macOS, Windows |
| `thermal-state-change` | `{state}` | macOS |
| `speed-limit-change` | `{limit}` (CPU %, <100 = throttled) | macOS, Windows |
| `shutdown` | — (`preventDefault()` to delay) | Linux, macOS |
| `lock-screen` / `unlock-screen` | — | macOS, Windows |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getSystemIdleState(threshold)` | string | `'active'`, `'idle'`, `'locked'`, `'unknown'` |
| `getSystemIdleTime()` | Integer | Seconds idle |
| `getCurrentThermalState()` | string | macOS only |
| `isOnBatteryPower()` | boolean | |

---

## powerSaveBlocker

**Process:** Main

| Method | Returns | Description |
|--------|---------|-------------|
| `start(type)` | Integer (ID) | `'prevent-app-suspension'` or `'prevent-display-sleep'` |
| `stop(id)` | boolean | |
| `isStarted(id)` | boolean | |

**Note:** `prevent-display-sleep` supersedes `prevent-app-suspension` when both active.

---

## screen

**Process:** Main | **Cannot use until `app.ready`**

**IMPORTANT:** In renderer, `window.screen` is a reserved DOM property — don't destructure at top level.

### Events

| Event | Parameters |
|-------|-----------|
| `display-added` | `event`, `newDisplay` |
| `display-removed` | `event`, `oldDisplay` |
| `display-metrics-changed` | `event`, `display`, `changedMetrics` |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getCursorScreenPoint()` | Point | **Not supported on Wayland** |
| `getPrimaryDisplay()` | Display | Primary display |
| `getAllDisplays()` | Display[] | All displays |
| `getDisplayNearestPoint(point)` | Display | Closest to point |
| `getDisplayMatching(rect)` | Display | Best match for rect |

---

## systemPreferences

**Process:** Main, Utility

### Events

| Event | Platform | Description |
|-------|----------|-------------|
| `accent-color-changed` | Windows, Linux | Accent color changed |
| `color-changed` | Windows | System color changed |

### macOS Notification System

| Method | Description |
|--------|-------------|
| `subscribeNotification(event, callback)` | Subscribe to NSNotification. Returns subscription ID |
| `unsubscribeNotification(id)` | Unsubscribe |
| `postNotification(event, userInfo)` | Post notification |

Notable macOS events: `AppleInterfaceThemeChangedNotification`, `AppleColorPreferencesChangedNotification`, `AppleShowScrollBarsSettingChanged`

### macOS User Defaults

| Method | Description |
|--------|-------------|
| `getUserDefault(key, type)` | Type: `'string'`, `'boolean'`, `'integer'`, `'float'`, `'double'`, `'url'`, `'array'`, `'dictionary'` |
| `setUserDefault(key, type, value)` | Throws on type/value mismatch |
| `removeUserDefault(key)` | Remove key |

### Colors

| Method | Returns | Platform | Description |
|--------|---------|----------|-------------|
| `getAccentColor()` | string (RGBA hex) | macOS 10.14+ | Accent color |
| `getColor(color)` | string (#RRGGBBAA) | Windows, macOS | System UI color |
| `getSystemColor(color)` | string (#RRGGBBAA) | macOS | Values: blue, brown, gray, green, orange, pink, purple, red, yellow |

### Appearance & Accessibility

| Method | Returns | Platform | Description |
|--------|---------|----------|-------------|
| `getEffectiveAppearance()` | string | macOS | `'dark'`, `'light'`, `'unknown'` |
| `canPromptTouchID()` | boolean | macOS | Touch ID available |
| `promptTouchID(reason)` | `Promise<void>` | macOS | Authenticate with Touch ID |
| `isTrustedAccessibilityClient(prompt)` | boolean | macOS | Check accessibility permission |
| `getMediaAccessStatus(type)` | string | macOS, Windows | `'granted'`, `'denied'`, `'not-determined'`, `'restricted'` |
| `askForMediaAccess(type)` | `Promise<boolean>` | macOS | Request camera/microphone. Requires Info.plist keys |
| `getAnimationSettings()` | Object | All | `{shouldRenderRichAnimation, prefersReducedMotion, ...}` |

---

## safeStorage

**Process:** Main

| Method | Returns | Description |
|--------|---------|-------------|
| `isEncryptionAvailable()` | boolean | Whether platform encryption works |
| `encryptString(plainText)` | Buffer | Throws on failure |
| `decryptString(encrypted)` | string | Throws on failure |
| `setUsePlainTextEncryption(use)` | void | **Linux only** — forces in-memory key |
| `getSelectedStorageBackend()` | string | **Linux only** — `'basic_text'`, `'gnome_libsecret'`, `'kwallet'`, etc. |

### Platform Security

| Platform | Backend | Protection Level |
|----------|---------|-----------------|
| macOS | Keychain | Other users AND apps |
| Windows | DPAPI | Other users only (NOT same-user apps) |
| Linux | kwallet/gnome-libsecret | May fall back to unencrypted plaintext |

**Gotcha:** macOS/Linux system calls may **block the main thread** to collect user input.
