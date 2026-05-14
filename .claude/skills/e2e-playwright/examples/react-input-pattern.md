# Example: React Input Pattern

`Locator.fill()` works correctly for React-controlled inputs in Playwright — no native-setter dance needed for the common case. Keep a fallback for stubborn cases (CodeMirror, Monaco, custom controlled wrappers that intercept events).

## The default — `locator.fill()` works

```ts
// Most React-controlled inputs — works out of the box
await page.getByLabel('Session name').fill('My Session');
await page.locator('#email').fill('me@example.com');

// Read it back — also works (returns the .value DOM property, not the attr)
const value = await page.getByLabel('Session name').inputValue();
expect(value).toBe('My Session');
```

Why does this work where WDIO's `setValue` failed? Playwright dispatches **real browser-level input events**, not synthetic JS events. React's onChange listener attached to the input fires correctly, and the controlled component's state updates.

## When it fails — the fallback helper

Three common cases where `fill()` doesn't behave:

1. **CodeMirror** (markdown / JSON editors throughout the app)
2. **Monaco** (in-app code editor)
3. **Custom inputs** that intercept input events to gate or transform values

For these, fall back to setting the value through the React-patched native setter:

```ts
import { setInputValueLowLevel } from './helpers/pw';

await setInputValueLowLevel(page, '#prompt-textarea', 'Hello, agent.');
```

The helper (defined in [examples/custom-helpers.md](custom-helpers.md)):

```ts
export async function setInputValueLowLevel(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    ([sel, val]) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) throw new Error(`Element not found: ${sel}`);
      const proto =
        el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (!setter) throw new Error('No value setter found on prototype');
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [selector, value] as const,
  );
}
```

## Why the native-setter pattern works

React patches `HTMLInputElement.prototype.value` setter with a tracking version that records "user changes." When you assign `input.value = 'x'`, React's listener doesn't fire because React thinks it's an "internal" change.

To fool React, the helper:
1. Reaches the **original** setter via `Object.getOwnPropertyDescriptor(prototype, 'value')?.set`
2. Calls the original setter on the element (bypasses React's tracking)
3. Dispatches a synthetic `input` event with `bubbles: true` so React's onChange fires

## CodeMirror specifically

CodeMirror v6 doesn't render a real `<input>` or `<textarea>` — it's a contenteditable div with custom event handling. To set its content programmatically:

```ts
await page.evaluate((value) => {
  const view = (window as any).__codemirrorView;     // exposed in dev/test builds
  view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
}, 'new code content');
```

If the app doesn't expose the CodeMirror view, fallback to keyboard:

```ts
await page.locator('.cm-editor').click();
await page.keyboard.press('Control+a');
await page.keyboard.press('Delete');
await page.keyboard.type('new code content', { delay: 10 });
```

## Monaco specifically

Monaco exposes its API on `window.monaco`. Pattern:

```ts
await page.evaluate((value) => {
  const editor = (window as any).monaco.editor.getEditors()[0];
  editor?.setValue(value);
}, 'new code content');
```

## When `fill()` is the wrong choice

Despite "fill works for React" — there are cases where you DO want to simulate keystrokes (e.g. typeahead, autocomplete that fires per-keystroke):

```ts
// Type one char at a time — fires keydown/keyup per stroke, lets the UI react
await page.getByPlaceholder('Search…').pressSequentially('clearp', { delay: 50 });

// Then assert on the dropdown
await expect(page.getByRole('option', { name: 'clear-path' })).toBeVisible();
```

`fill()` would set the value in one shot — no per-keystroke events, autocomplete dropdown wouldn't trigger.

## Reading values

`Locator.inputValue()` reads the actual `.value` property — the right choice for React. Don't use `getAttribute('value')` (returns initial DOM attribute, not current state).

```ts
const current = await page.getByLabel('Email').inputValue();          // ✅ '.value' property
const initial = await page.getByLabel('Email').getAttribute('value'); // ⚠ initial attr only
```

## Decision table

| Input type | Use |
|-----------|-----|
| Plain `<input>`/`<textarea>` (controlled) | `fill()` |
| Plain `<input>`/`<textarea>` (uncontrolled) | `fill()` (works either way) |
| Numeric input | `fill('42')` (Playwright handles `<input type="number">`) |
| Date picker | `fill('2026-01-15')` |
| Select dropdown | `selectOption({ label: 'X' })` |
| Search with typeahead | `pressSequentially('chars', { delay })` |
| CodeMirror editor | `setInputValueLowLevel` or `view.dispatch` |
| Monaco editor | `monaco.editor.getEditors()[0].setValue(...)` |
| Drag-to-select | `selectText()` then `keyboard.press('Backspace')` |
| File input | `setInputFiles(path)` |

## Pitfalls

1. **Forgetting to clear** — `fill('x')` replaces the value. To append, do `fill(current + 'x')` or use keyboard input.
2. **Auto-resize textareas** with debounced JS — `fill` is too fast to trigger the resize. Add `await page.waitForTimeout(150)` if the post-fill height matters for layout.
3. **Disabled/readonly inputs** — `fill()` throws actionability error. If you need to test with a disabled input populated, use `setInputValueLowLevel` (bypasses checks) — but consider whether the test is asserting the right behavior.
4. **Cleared by re-render** — if a parent component re-renders and resets state, your filled value disappears. Check the test sequence; consider `expect(loc).toHaveValue(...)` to catch this immediately.
