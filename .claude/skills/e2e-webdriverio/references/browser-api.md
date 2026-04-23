# Browser API Reference

The `browser` global is available in all WebdriverIO test files and hooks. It represents the browser/Electron window session. All methods return Promises — always `await` them.

---

## Script Execution

`browser.execute()` is the primary bridge between your test code and the Electron renderer process. Use it to read DOM state, trigger programmatic navigation, and interact with `window.electronAPI`.

### `browser.execute(fn, ...args)`

Injects a synchronous function into the renderer and returns its result. The function runs in the renderer's JavaScript context, not in Node.js.

```typescript
// Read a property from window
const hash = await browser.execute(() => window.location.hash)
// => '#/work'

// Read a DOM element's value (more reliable than element.getValue() for React inputs)
const value = await browser.execute(
  (selector) => (document.querySelector(selector) as HTMLInputElement)?.value ?? '',
  '[data-testid="prompt-input"]'
)

// Read multiple values in one round-trip
const appState = await browser.execute(() => ({
  hash: window.location.hash,
  ready: (window as any).__appReady,
  sessionCount: document.querySelectorAll('[data-testid="session-item"]').length,
}))

// Call window.electronAPI (exposed via contextBridge)
await browser.execute(() => {
  (window as any).electronAPI.clearAllSessions()
})

// Pass arguments to the injected function
const isVisible = await browser.execute((testId) => {
  const el = document.querySelector(`[data-testid="${testId}"]`)
  return el ? window.getComputedStyle(el).display !== 'none' : false
}, 'sidebar')

// Dispatch native events (useful for React controlled inputs)
await browser.execute((selector, newValue) => {
  const el = document.querySelector(selector) as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )!.set!
  setter.call(el, newValue)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}, '[data-testid="name-input"]', 'New Session Name')
```

### `browser.executeAsync(fn, ...args)`

Like `execute`, but the injected function receives a `done` callback as its last argument. Call `done(result)` when the async operation completes.

```typescript
// Wait for a Promise in the renderer to resolve
const result = await browser.executeAsync((done) => {
  (window as any).electronAPI.getAuthStatus().then(done)
})

// With arguments
const sessions = await browser.executeAsync((limit, done) => {
  (window as any).electronAPI.getSessions(limit).then(done)
}, 10)
```

> **Prefer `execute()` over `executeAsync()`** when you can. If your renderer API returns a Promise, wrap it in `execute` using `.then` chaining or just await inside `executeAsync`. Use `browser.waitUntil()` as an alternative to polling via `executeAsync`.

---

## Navigation (Electron-Specific)

Electron apps loaded from `file://` do not support `browser.url()` for in-app navigation. The URL scheme doesn't map to routes — use `window.location.hash` for hash-router navigation.

### Hash Router Navigation

```typescript
// Navigate to a route by setting the hash
await browser.execute((hash) => { window.location.hash = hash }, '#/work')
await browser.pause(500) // wait for React Router to render the new route

// Navigate with query params
await browser.execute((hash) => { window.location.hash = hash }, '#/work?tab=session')
await browser.pause(300)

// Verify current route
const currentHash = await browser.execute(() => window.location.hash)
expect(currentHash).toBe('#/configure')

// Full navigation pattern with verification
async function navigateTo(route: string) {
  await browser.execute((hash) => { window.location.hash = hash }, route)
  await browser.pause(400)
  // Verify a landmark element for the target route
  await $(`[data-testid="${route.replace('#/', '')}-page"]`).waitForDisplayed({
    timeout: 8000,
    timeoutMsg: `Page ${route} did not render`,
  })
}
```

### Other Navigation Methods

```typescript
// Get current URL (includes hash for Electron file:// URLs)
const url = await browser.getUrl()
// => 'file:///path/to/app/index.html#/work'

// Get window title
const title = await browser.getTitle()
// => 'ClearPath - Work'

// browser.url() — for web testing with a baseUrl; avoid in Electron
// await browser.url('/some-path') // DOES NOT work for in-app navigation in Electron
```

---

## Screenshots

### `browser.saveScreenshot(filepath)`

Saves a full viewport screenshot as a PNG file.

```typescript
// Save viewport screenshot
await browser.saveScreenshot('./screenshots/current-state.png')

// Save on test failure (in afterEach hook)
afterEach(async (test, ctx, result) => {
  if (result.error) {
    const safeName = test.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    await browser.saveScreenshot(`./screenshots/failures/${safeName}.png`)
  }
})
```

### Visual Regression with `@wdio/visual-service`

For baseline comparison and visual regression testing, use the visual service commands instead of raw `saveScreenshot`:

```typescript
// Compare full screen against baseline
await browser.checkScreen('dashboard-home')

// Compare a specific element against its baseline
await browser.checkElement(
  await $('[data-testid="agent-card"]'),
  'agent-card-default'
)

// Check full page (scrolls and stitches)
await browser.checkFullPageScreen('settings-full-page')

// Save a new baseline (run once, then use checkScreen)
await browser.saveScreen('dashboard-home')
await browser.saveElement(
  await $('[data-testid="sidebar"]'),
  'sidebar-default'
)
```

The visual service stores baselines in `.visual-regression/` (or configured `baselineFolder`) and fails tests when diff exceeds the configured threshold.

---

## Waiting

### `browser.waitUntil(condition, opts)`

The universal wait — use it when no `waitFor*` element method fits your condition.

```typescript
// Wait for a DOM condition
await browser.waitUntil(
  async () => {
    const items = await $$('[data-testid="session-item"]')
    return items.length >= 3
  },
  {
    timeout: 10000,
    interval: 300,
    timeoutMsg: 'Expected at least 3 session items within 10s',
  }
)

// Wait for a renderer window global
await browser.waitUntil(
  async () => {
    const ready = await browser.execute(() => (window as any).__appReady === true)
    return ready === true
  },
  { timeout: 20000, interval: 500, timeoutMsg: 'App never signaled ready' }
)

// Wait for IPC-driven state change
await browser.waitUntil(
  async () => {
    const status = await browser.execute(
      () => (window as any).electronAPI?.getLastStatus?.() ?? null
    )
    return status === 'connected'
  },
  { timeout: 15000, interval: 400, timeoutMsg: 'Never reached connected status' }
)
```

### `browser.pause(ms)`

Synchronous wait for a fixed duration. Use sparingly — prefer `waitUntil` / `waitFor*`.

```typescript
// Acceptable: after hash navigation, give React Router time to settle
await browser.execute((hash) => { window.location.hash = hash }, '#/configure')
await browser.pause(500)

// Acceptable: wait for CSS animation to finish before screenshot
await $('[data-testid="modal"]').waitForDisplayed()
await browser.pause(300) // animation settle before visual check
await browser.saveScreenshot('./screenshots/modal-open.png')

// Avoid: using pause as a substitute for waitForDisplayed
await browser.pause(3000) // SLOW — use waitForDisplayed instead
```

---

## Window Management

```typescript
// Get current viewport size
const { width, height } = await browser.getWindowSize()
console.log(`Window: ${width}x${height}`)

// Resize to specific dimensions
await browser.setWindowSize(1280, 800)
await browser.setWindowSize(1920, 1080) // full HD for screenshots

// Maximize window
await browser.maximizeWindow()

// Multi-window support (e.g., if Electron opens a second BrowserWindow)
const handles = await browser.getWindowHandles()
console.log(`Open windows: ${handles.length}`)

const mainHandle = await browser.getWindowHandle()
// Switch to another window
await browser.switchToWindow(handles[1])
// Switch back
await browser.switchToWindow(mainHandle)
```

---

## Debugging

### `browser.debug()`

Pauses the test and opens an interactive REPL in your terminal. You can run `$`, `$$`, and `browser` commands interactively to explore the current page state.

```typescript
it('inspects element state', async () => {
  await navigateTo('#/configure')
  await browser.debug() // <-- pauses here, drops into REPL
  // In REPL: await $('[data-testid="save-btn"]').getText()
  // Exit REPL with Ctrl+C or .exit
  await $('[data-testid="save-btn"]').click()
})
```

> **Set a long timeout before using `browser.debug()`** — Mocha's default timeout will kill the test while you're inspecting:
> ```typescript
> // In wdio.conf.ts or at the top of the describe block
> mochaOpts: { timeout: 86400000 } // 24h — for debugging sessions
> ```

### `browser.getLogs('browser')`

Retrieves console output from the renderer process. Essential for catching uncaught errors, warnings, and debug output.

```typescript
// Get all renderer logs
const logs = await browser.getLogs('browser')
// Each entry: { level: 'INFO' | 'WARNING' | 'SEVERE', message: string, timestamp: number }

// Filter for errors only
const errors = logs.filter(
  (e) => e.level === 'SEVERE' || e.level === 'ERROR'
)
if (errors.length > 0) {
  console.error('Renderer errors:', errors.map(e => e.message))
}

// Assert no console errors during a test
afterEach(async () => {
  const logs = await browser.getLogs('browser')
  const severe = logs.filter(e => e.level === 'SEVERE')
  expect(severe).toHaveLength(0)
})
```

---

## Keyboard and Actions

```typescript
// Global keyboard input (not tied to a specific element)
await browser.keys(['Meta', 'a'])  // Cmd+A on macOS
await browser.keys(['Control', 'z'])  // Ctrl+Z

// W3C Actions API for complex sequences
await browser.action('key')
  .down('Control')
  .down('a')
  .up('a')
  .up('Control')
  .perform()

// Mouse actions
await browser.action('pointer', { parameters: { pointerType: 'mouse' } })
  .move({ x: 100, y: 200 })
  .down()
  .up()
  .perform()
```

---

## Session Management

```typescript
// Reload the session (restart renderer, same capabilities — faster than full restart)
await browser.reloadSession()

// End the session entirely
await browser.deleteSession()

// Inspect session metadata
console.log('Session ID:', browser.sessionId)
console.log('Capabilities:', browser.capabilities)
console.log('WDIO options:', browser.options)
```

---

## Alerts

If your app uses native `window.alert()`, `window.confirm()`, or `window.prompt()` dialogs:

```typescript
// Dismiss the alert and check its text
const alertText = await browser.getAlertText()
await browser.dismissAlert()

// Accept/confirm a dialog
await browser.acceptAlert()

// Type into a prompt dialog
await browser.sendAlertText('my input')
await browser.acceptAlert()
```

> **Note**: Most React apps (including Electron + React setups) use custom modal components instead of native dialogs. Check whether your app actually triggers native alerts before using these methods.

---

## Key Electron Notes

| Concern | Approach |
|---------|---------|
| In-app navigation | `browser.execute((h) => { window.location.hash = h }, '#/route')` + `pause(300–500)` |
| React controlled input value | `browser.execute((sel) => document.querySelector(sel).value, selector)` |
| IPC calls from tests | `browser.execute(() => window.electronAPI.someMethod())` |
| Renderer console errors | `browser.getLogs('browser')` |
| Visual regression | `browser.checkScreen(tag)` via `@wdio/visual-service` |
| Interactive debugging | `browser.debug()` with extended Mocha timeout |
| App readiness check | `browser.waitUntil(() => browser.execute(() => window.__appReady))` |
| `browser.url()` | Works for web; **does not navigate routes** in Electron `file://` apps |
| `ELECTRON_RUN_AS_NODE` | Must be unset in `wdio.conf.ts` — VS Code sets this env var and breaks Electron launch |
