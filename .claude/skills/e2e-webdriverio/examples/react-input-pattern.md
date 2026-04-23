# Example: Setting Values on React Controlled Inputs

Typing into a React controlled input from a WebdriverIO test is not the same as a user typing. The standard `element.setValue()` command sends WebDriver keystrokes that bypass React's event system, leaving the component's state out of sync with what appears in the DOM.

---

## The Problem

React controlled inputs work like this:

```tsx
// Controlled input — React owns the value
const [name, setName] = useState('')
<input value={name} onChange={e => setName(e.target.value)} />
```

When WebDriver calls `element.setValue('hello')`, it:
1. Clears the input (sends Ctrl+A, Delete)
2. Sends keystroke events for each character

The problem is that WebDriver's synthetic keystrokes trigger `keydown`/`keyup` browser events, but React's controlled input is listening for the `input` event's `e.target.value`. In Electron + Chromedriver, the DOM `.value` property is set but the `input` event is either not fired or is fired in a way that React's event delegation doesn't intercept.

Result: the input appears populated on screen but React's `useState` still holds the old value. When the user submits the form, React reads its state — not the DOM — and submits empty or stale data.

---

## The Solution: Native Setter + dispatchEvent

React patches `HTMLInputElement.prototype` to intercept value changes. By calling the **original native setter** before React patched it, and then manually dispatching `input` and `change` events, we trigger React's synthetic event pipeline correctly.

### Full setInputValue helper

```typescript
// e2e/helpers/input.ts

/**
 * Set a value on a React controlled input or textarea.
 *
 * Uses the native HTMLInputElement setter (bypassing React's override)
 * then dispatches input + change events so React's onChange fires correctly.
 */
export async function setInputValue(selector: string, value: string): Promise<void> {
  await browser.execute(
    (sel, val) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null
      if (!el) return

      // Get the native setter that existed before React patched the prototype.
      // React stores component state using this path.
      const nativeSetter =
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ??
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set

      if (nativeSetter) {
        nativeSetter.call(el, val)
      } else {
        // Fallback for non-React or uncontrolled inputs
        el.value = val
      }

      // Dispatch events so React's synthetic event system fires onChange
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    selector,
    value,
  )

  // Short pause for React's state update + any debounced onChange handlers to settle
  await browser.pause(200)
}
```

### Why This Works

React intercepts DOM mutations by overriding `HTMLInputElement.prototype.value`'s setter. When you assign `el.value = 'hello'` directly, React sees its own patched setter, sets the value, but does **not** trigger `onChange` — it's waiting for a real browser event.

The native setter is the one that existed **before** React's override. It writes to the underlying DOM property through the channel React is monitoring. After calling it:

- `el.value` now equals the new value via the native path
- Dispatching `input` with `bubbles: true` fires React's delegated event listener (React attaches to the document root, not the element itself)
- `onChange` fires, `setState` runs, React reconciles

`bubbles: true` is not optional. React's event delegation system listens at the root container, not on individual elements. A non-bubbling event never reaches React's listener.

---

## Reading Input Values Back

Don't use `element.getValue()` to read a React input's current value — it reads the HTML `value` attribute, which React doesn't always synchronise with the current state.

```typescript
// e2e/helpers/input.ts

/**
 * Read the current value of an input from the DOM property (not the attribute).
 * This reflects React's current rendered state.
 */
export async function getInputValue(selector: string): Promise<string> {
  return browser.execute((sel) => {
    const el = document.querySelector(sel) as HTMLInputElement | null
    return el?.value ?? ''
  }, selector)
}
```

The distinction: `.value` (DOM property) = what's currently displayed. `getAttribute('value')` (HTML attribute) = the initial value from the JSX prop, which may never change.

---

## Usage Example

```typescript
import { setInputValue, getInputValue } from '../helpers/input'
import { invokeIPC } from '../helpers/ipc'

it('saves a custom session name', async () => {
  // Navigate to the session rename UI
  await navigateSidebarTo('Work')
  await browser.pause(500)

  // Set input value — React state updates correctly
  await setInputValue('#session-name-input', 'My Test Session')

  // Optional: wait for debounced onChange handlers (e.g. 300ms debounce)
  await browser.pause(400)

  // Verify React reflected the value back into the DOM
  const displayed = await getInputValue('#session-name-input')
  expect(displayed).toBe('My Test Session')

  // Submit the form — React reads from its state, not the DOM attribute
  await $('//button[contains(., "Save")]').click()
  await browser.pause(500)

  // Verify persistence — IPC round-trip confirms the value reached the main process
  const session = await invokeIPC('session:get-current') as { name: string }
  expect(session.name).toBe('My Test Session')
})
```

---

## When element.setValue() IS Safe

Not every input in the app is a React controlled input. Use standard `element.setValue()` for:

| Case | Why it's safe |
|---|---|
| Plain HTML inputs (no React) | WebDriver keystrokes work fine with the browser's native event handling |
| Uncontrolled React inputs | These use `ref.current.value` directly — they don't rely on React state for the value |
| Search/filter inputs where you just need keystrokes | If the handler reads `e.target.value` from a `keyup` event listener (not `onChange`), keystrokes work |
| CodeMirror or other custom editors | These have their own APIs — neither setValue nor setInputValue work; use `browser.execute()` to call the editor's API directly |

A quick way to tell: if the input has both `value={...}` and `onChange={...}` props in the React source, it's controlled. Use `setInputValue`. If it has neither (or only `defaultValue`), it's uncontrolled — `element.setValue()` is fine.

---

## Textarea Variant

The same helper works for `<textarea>` elements. The `nativeSetter` lookup checks `HTMLTextAreaElement.prototype` as a fallback, so the selector just needs to point to a `<textarea>`:

```typescript
await setInputValue('textarea#prompt-input', 'Write me a summary of this PR...')
```

---

## Gotcha: Auto-resizing Textareas

CoPilot Commander's compose textarea auto-resizes as text is entered (via a `useEffect` that watches the value). After `setInputValue`, the textarea height updates based on React's state. If your test captures a screenshot immediately after setting a long value, allow extra settle time:

```typescript
await setInputValue('textarea#compose-input', longPromptText)
await browser.pause(400)   // let auto-resize effect run + layout settle
await checkScreenshot('compose--filled')
```
