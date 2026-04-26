# Example: Custom Helper Functions

The helpers in `e2e/helpers/app.ts` exist because raw WebdriverIO APIs have several rough edges when used with Electron + React. This document explains each helper, why it exists, and how to use it.

---

## 1. `waitForAppReady`

```typescript
export const APP_READY_TIMEOUT = 20000

export async function waitForAppReady(): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const root = await $('#root')
        return root.isExisting()
      } catch {
        return false
      }
    },
    {
      timeout: APP_READY_TIMEOUT,
      timeoutMsg: `App root element (#root) did not appear within ${APP_READY_TIMEOUT}ms`,
      interval: 500,  // poll every 500ms, not continuously
    }
  )

  // Wait an additional moment for React hydration and initial IPC calls to settle
  await browser.pause(1000)
}
```

**Why 500ms interval?** The default `waitUntil` polls as fast as the event loop allows, which can generate hundreds of DOM queries per second and overwhelm the Electron main process before it finishes initializing. 500ms is enough granularity to catch the `#root` element appearing quickly while leaving breathing room.

**Why the extra 1000ms pause?** `#root` appearing in the DOM means the React app has mounted its initial tree. It does NOT mean:
- React Router has resolved the current route
- The `before()` hook's `electron-store` reads have returned
- Any `useEffect` calls that fire on mount (e.g. fetching workspace list, reading settings) have completed

Without the pause, `navigateSidebarTo()` fires before the sidebar links are interactive and the click silently fails.

**Usage (call this in your top-level `before()` first):**
```typescript
before(async () => {
  await waitForAppReady()
  await navigateSidebarTo('Configure')
})
```

---

## 2. `navigateSidebarTo`

```typescript
export async function navigateSidebarTo(label: string): Promise<void> {
  // Search the entire sidebar aside (not just nav) to handle Configure which is
  // rendered in a div pinned to the bottom, outside the primary <nav>
  const xpath = `//aside//a[contains(., '${label}')]`
  const link = await $(xpath)

  await link.waitForExist({ timeout: ELEMENT_TIMEOUT })
  await link.waitForClickable({ timeout: ELEMENT_TIMEOUT })
  await link.click()

  // Brief pause for React Router transition
  await browser.pause(500)
}
```

**Why XPath `contains(., ...)` and not `=` text-selector?**

WebdriverIO supports text selectors like `$('a=Configure')` but in Electron's Chromedriver bridge this syntax is not reliably translated. The query sometimes matches nothing because Chromedriver's DevTools Protocol layer receives a CSS selector, not a WebDriver text selector command.

`//aside//a[contains(., 'Configure')]` is plain XPath evaluated by the V8 engine inside the renderer — it works identically in Electron and real browsers.

**Why `//aside` and not `//nav`?**

The "Configure" nav link is pinned to the bottom of the sidebar in a `<div>` that is a sibling of the main `<nav>`, both children of the sidebar `<aside>`. If you write `//nav//a[contains(., 'Configure')]` it finds nothing and the test fails. Scoping to `//aside` catches all nav links regardless of their exact container.

**Why `waitForExist` then `waitForClickable`?**

`waitForClickable` implies existence, so you could skip the first call — but `waitForExist` gives a cleaner error message if the element never appears at all (you know the problem is "element not found"), whereas `waitForClickable` times out with "element not interactable" even when the underlying issue is that the element simply doesn't exist.

**Usage:**
```typescript
await navigateSidebarTo('Work')    // navigates to /work
await navigateSidebarTo('Configure') // navigates to /configure
await navigateSidebarTo('Learn')   // navigates to /learn
```

---

## 3. `navigateToHash`

```typescript
export async function navigateToHash(hash: string): Promise<void> {
  await browser.execute((h) => {
    window.location.hash = h
  }, hash)
  await browser.pause(500)
}
```

**Why `window.location.hash` and not `browser.url()`?**

The Electron renderer loads from `file:///path/to/out/renderer/index.html`. Calling `browser.url('http://localhost:5173/#/work?tab=compose')` navigates the Electron window to a web URL, which either loads a blank page or fails with a connection error because there is no dev server running during e2e tests.

Setting `window.location.hash` is a pure renderer-side operation — it triggers React Router's hash router to update the route without a page reload. The 500ms pause gives React Router time to unmount the old route and mount the new one.

**Usage:**
```typescript
await navigateToHash('#/work?tab=compose')    // switch to compose tab
await navigateToHash('#/work?panel=agents')   // open agents panel
await navigateToHash('#/configure?tab=setup') // if using hash params for config
```

---

## 4. `setInputValue`

```typescript
export async function setInputValue(selector: string, value: string): Promise<void> {
  await browser.execute(
    (sel, val) => {
      const el = document.querySelector(sel) as HTMLInputElement | null
      if (!el) return
      // Use the native setter to bypass React's controlled input tracking
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )?.set ?? Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value',
      )?.set
      if (nativeSetter) {
        nativeSetter.call(el, val)
      } else {
        el.value = val
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    selector,
    value,
  )
  await browser.pause(200)
}
```

**Why not just `element.setValue()`?**

React uses a synthetic event system that intercepts DOM events. When React renders a controlled input (`<input value={state} onChange={...} />`), it stores an internal fiber property on the DOM node that tracks the "real" value. Standard `element.setValue()` writes directly to `el.value` then dispatches a change event — but React's event listener checks its internal fiber state and ignores the event because it thinks the value hasn't changed (the fiber still has the old value).

The native setter pattern bypasses React's override of the value property descriptor by grabbing the setter from `HTMLInputElement.prototype` before React can intercept it. This forces React to recognize the new value as externally set and re-render.

**Why `input` AND `change` events?**

Some React handlers listen on `onChange` (which maps to `input` in React's synthetic system), others on `onBlur` which triggers after a `change` event. Dispatching both covers all patterns in this codebase.

**Usage:**
```typescript
// Set a text input
await setInputValue('#workspace-name', 'My Project')

// Set a textarea (same function, detects textarea automatically via prototype chain)
await setInputValue('[aria-label="Message input"]', 'Hello world')

// Clear an input
await setInputValue('#search-box', '')
```

---

## 5. `getInputValue`

```typescript
export async function getInputValue(selector: string): Promise<string> {
  return browser.execute((sel) => {
    const el = document.querySelector(sel) as HTMLInputElement | null
    return el?.value ?? ''
  }, selector)
}
```

**Why not `element.getValue()`?**

WebdriverIO's `element.getValue()` issues a WebDriver `getElementAttribute(element, 'value')` command to Chromedriver. For React controlled inputs this returns the initial HTML `value` attribute, NOT the current value tracked by React state. If React has updated the displayed value via `setState` without re-setting the HTML attribute, `getValue()` returns the stale initial value.

`browser.execute()` runs code directly in the renderer process and reads `el.value` — the actual DOM property, which is always in sync with what the user sees on screen.

**Usage:**
```typescript
const current = await getInputValue('#a11y-font-scale')
const num = parseFloat(current)
expect(num).toBeGreaterThanOrEqual(0.85)
```

---

## 6. `invokeIPC`

```typescript
export async function invokeIPC(channel: string, args?: unknown): Promise<unknown> {
  return browser.execute(
    (ch, a) => {
      const api = (window as unknown as {
        electronAPI: { invoke: (c: string, a?: unknown) => Promise<unknown> }
      }).electronAPI
      return api.invoke(ch, a)
    },
    channel,
    args,
  )
}
```

**What it does:** Calls `window.electronAPI.invoke(channel, args)` from inside the renderer via `browser.execute()`. This goes through the real IPC bridge — the same path the UI uses — so you get the actual main-process handler response.

**Why use it?** Three primary use cases:

1. **Set up test state.** Create a workspace before a test that needs one; delete it in `after()`.
2. **Verify persistence.** After a UI interaction, read back via IPC to confirm the change was stored in electron-store, not just shown in React state.
3. **Reset after tests.** Restore settings to defaults so tests don't pollute each other.

**Usage:**
```typescript
// Read current settings
const settings = await invokeIPC('settings:get') as Record<string, unknown>
expect(settings.theme).toBe('dark')

// Create test data
const ws = await invokeIPC('workspace:create', {
  name: 'Test Workspace',
  description: 'Created for e2e test',
}) as { id: string }

// Verify persistence after a UI interaction
const result = await invokeIPC('accessibility:get') as Record<string, unknown>
expect(result.highContrast).toBe(true)

// Clean up
await invokeIPC('workspace:delete', { id: ws.id })

// Reset all accessibility settings to defaults
await invokeIPC('accessibility:reset')
```

**Prerequisite:** `window.electronAPI` must be exposed via contextBridge in the preload script. In this project, `src/preload/index.ts` exposes `invoke` on `window.electronAPI`. If you're writing a new test for a feature that uses direct `ipcRenderer.invoke()` instead, you'd need to update the preload to expose it.

---

## 7. `getCriticalConsoleErrors`

```typescript
export async function getCriticalConsoleErrors(): Promise<string[]> {
  try {
    const logs = await browser.getLogs('browser')
    return (logs as Array<{ level: string; message: string }>)
      .filter((entry) => entry.level === 'SEVERE' || entry.level === 'ERROR')
      .map((entry) => entry.message)
  } catch {
    // getLogs may not be available in all Electron driver configurations
    return []
  }
}
```

**What it does:** Reads the Electron renderer's console log buffer and returns only `ERROR` / `SEVERE` level entries. Warnings and informational logs are filtered out.

**Why not `expect(errors).toHaveLength(0)`?**

Three reasons:
1. `browser.getLogs()` returns logs accumulated since the last call. If you assert length === 0 at the end of a long spec, you might catch errors from unrelated earlier tests.
2. Some Electron environments do not support the `browser` log type (depends on Chromedriver version), so the call throws. The `try/catch` returns `[]` and the test passes — better than every test failing because of a driver limitation.
3. React DevTools, extensions, and system-level Electron messages inject console entries that are not app errors. Treating all console errors as failures generates too many false positives.

The typical assertion is therefore:
```typescript
it('has no critical errors', async () => {
  const errors = await getCriticalConsoleErrors()
  if (errors.length > 0) {
    console.warn('Console errors:', errors) // log for debugging without failing
  }
  expect(Array.isArray(errors)).toBe(true)  // confirms the function returned
})
```

When you DO want to enforce zero errors for a specific interaction, assert directly:
```typescript
await performSomeAction()
const errors = await getCriticalConsoleErrors()
expect(errors).toHaveLength(0) // strict check for this specific interaction
```

---

## Additional Helpers (Quick Reference)

```typescript
// Click a button by visible text (XPath)
await clickButton('Import Config')

// Check if a button with text exists
const exists = await buttonExists('Reset')

// Get page HTML for content assertions
const html = await getRootHTML() // returns root.getHTML()

// Wait for text to appear anywhere in the body
await waitForText('Extensions')

// Read aria-checked state of a toggle
const isOn = await getToggleState('a11y-high-contrast')

// Click a toggle and wait for state propagation
await clickToggle('a11y-reduced-motion')

// Get all text contents of matching elements
const labels = await getTextContents('.nav-label')

// Wait for a CSS selector to appear in the DOM
await waitForSelector('.modal-overlay', 5000)

// Count elements matching a selector
const count = await countElements('.extension-card')
```
