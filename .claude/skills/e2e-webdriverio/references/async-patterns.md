# Async/Await Patterns in WebdriverIO v9

WebdriverIO v9 is fully async. Every command returns a Promise. Getting async patterns right is the single biggest factor in test reliability.

---

## 1. The Golden Rule: Always `await` WDIO Commands

Every WebdriverIO method — element queries, interactions, assertions, browser commands — returns a Promise. Missing an `await` means the operation is silently skipped and the test may pass incorrectly or fail in confusing ways.

```typescript
// WRONG — click() returns a Promise that is never awaited
// The click never happens; the test may still "pass"
element.click()
browser.pause(500)
$('#result').getText()

// RIGHT — each command is awaited
await element.click()
await browser.pause(500)
const text = await $('#result').getText()
```

There is no TypeScript error for missing `await` on these calls — it is a silent logic bug. Enable ESLint's `@typescript-eslint/no-floating-promises` rule to catch these automatically.

---

## 2. Lazy Element Chaining — Don't Await the Selector

`$()` and `$$()` return a `ChainablePromise`, not a resolved element. You can store the lazy reference and await only when you perform an action. Both patterns below are correct:

```typescript
// Pattern A: store the lazy reference, await the action
const btn = $('button[data-testid="send"]')  // no await here
await btn.click()                              // await here

// Pattern B: chain directly — also correct
await $('button[data-testid="send"]').click()

// Pattern C: await the element first, then use it multiple times
const input = await $('[data-testid="prompt-input"]')
await input.setValue('Hello')
await input.keys(['Enter'])
const val = await input.getValue()

// GOTCHA: if you await the element and the DOM mutates,
// the reference may go stale — re-query in that case
```

Pattern A and B are equivalent. Pattern C is best when you need to call multiple methods on the same element without re-querying.

---

## 3. `for...of` vs `forEach` — Critical Difference

`Array.prototype.forEach` does **not** await async callbacks. Using `forEach` with `async` is one of the most common sources of flaky tests — the loop completes instantly while all the promises run (and possibly fail) in the background.

```typescript
const cards = await $$('[data-testid="agent-card"]')

// WRONG — forEach does not await async callbacks
// All clicks fire immediately, none are awaited
cards.forEach(async (card) => {
  await card.click() // this promise is discarded
  await browser.pause(200)
})

// RIGHT — for...of awaits each iteration in sequence
for (const card of cards) {
  await card.click()
  await browser.pause(200)
}

// RIGHT — parallel execution with Promise.all (use when order doesn't matter)
const names = await Promise.all(
  cards.map(card => card.getText())
)
```

**Rule:** Whenever you iterate over WDIO elements, use `for...of`. Use `map` + `Promise.all` only for read-only parallel operations where order doesn't matter.

---

## 4. Parallel Operations with `Promise.all`

Independent operations that don't depend on each other can run in parallel:

```typescript
// Fetch title and heading text at the same time
const [title, heading] = await Promise.all([
  browser.getTitle(),
  $('h1').getText(),
])

// Check multiple elements exist simultaneously
const [sidebarExists, navExists, workAreaExists] = await Promise.all([
  $('[data-testid="sidebar"]').isExisting(),
  $('[data-testid="main-nav"]').isExisting(),
  $('[data-testid="work-area"]').isExisting(),
])

// Read values from multiple inputs at once
const inputs = await $$('input[data-testid]')
const values = await Promise.all(inputs.map(el => el.getValue()))
```

**Caution:** Do not use `Promise.all` for interactions that modify state (clicks, setValue). Parallel mutations lead to race conditions and unpredictable DOM state. Use `for...of` for sequential mutations.

---

## 5. `waitUntil` for Custom Conditions

When no built-in `waitFor*` command matches your condition, use `browser.waitUntil`:

```typescript
// Wait until at least one item appears
await browser.waitUntil(
  async () => {
    const items = await $$('[data-testid="session-item"]')
    return items.length > 0
  },
  {
    timeout: 10000,
    interval: 300,
    timeoutMsg: 'Session items never appeared within 10s',
  }
)

// Wait for a specific text value
await browser.waitUntil(
  async () => {
    const status = await $('[data-testid="agent-status"]').getText()
    return status === 'Running'
  },
  { timeout: 15000, interval: 500, timeoutMsg: 'Agent never reached Running state' }
)

// Wait for DOM count to stabilize (useful after bulk operations)
await browser.waitUntil(
  async () => {
    const count = (await $$('.notification-item')).length
    return count === 3
  },
  { timeout: 8000, interval: 200, timeoutMsg: 'Expected exactly 3 notifications' }
)

// Wait for a window.electronAPI result via execute()
await browser.waitUntil(
  async () => {
    const ready = await browser.execute(() => window.__appReady === true)
    return ready === true
  },
  { timeout: 20000, interval: 500, timeoutMsg: 'App never signaled ready' }
)
```

The `condition` callback must return a truthy value when the wait should resolve. It must be `async` if it contains `await`.

---

## 6. Auto-Wait Behavior — What WDIO Waits For Automatically

WebdriverIO v9 automatically waits for an element to be **interactable** before executing most action commands (`click`, `setValue`, `doubleClick`, etc.). This means you often don't need explicit waits before interactions.

```typescript
// This automatically waits for the button to exist, be visible,
// and be clickable before clicking
await $('[data-testid="send-btn"]').click()

// This automatically waits for the input to be interactable before typing
await $('[data-testid="prompt-input"]').setValue('Hello world')
```

**Commands that are NOT auto-waited:**
- `waitForExist()` — you call this explicitly when you need to assert existence before chaining
- `isExisting()` — instant check, no wait
- `isDisplayed()` — instant check, no wait
- `getText()`, `getValue()` — instant, no auto-wait (element must already exist)

```typescript
// Use waitForExist when you need to confirm presence before reading
await $('[data-testid="result"]').waitForExist({ timeout: 5000 })
const text = await $('[data-testid="result"]').getText()

// Or chain directly after waiting
const el = await $('[data-testid="result"]')
await el.waitForExist({ timeout: 5000 })
const text = await el.getText()
```

---

## 7. Explicit Waits vs `browser.pause`

Prefer explicit waits that resolve as soon as the condition is met. `browser.pause` always waits the full duration, making your test suite slower than necessary.

```typescript
// PREFER: resolves as soon as element appears (up to 5s)
await $('[data-testid="modal"]').waitForDisplayed({ timeout: 5000 })

// PREFER: resolves as soon as condition is true
await browser.waitUntil(
  async () => (await $$('.session-item')).length > 0,
  { timeout: 8000, interval: 300 }
)

// AVOID for logic waits: always waits the full duration
await browser.pause(2000) // slow regardless of when element appears
```

**Acceptable uses of `browser.pause`:**
- Waiting for a CSS animation to finish before taking a screenshot
- Settling IPC round-trips (main process → renderer → DOM) where no DOM signal exists
- Debounce-based effects that only trigger after a delay
- After a `window.location.hash` change, a short pause (300–500ms) ensures the router has re-rendered

```typescript
// Acceptable: waiting for hash-router navigation to settle
await browser.execute((hash) => { window.location.hash = hash }, '#/configure')
await browser.pause(500) // give React router time to render the new route
await $('[data-testid="configure-page"]').waitForDisplayed({ timeout: 5000 })
```

---

## 8. Stale Element Handling

Elements go stale when the DOM node they reference is removed and re-created (common after React re-renders, list updates, or modal open/close cycles). When you get a "stale element" error, re-query the element.

```typescript
// This can go stale if the modal re-renders
const modal = await $('[data-testid="settings-modal"]')
await modal.$('[data-testid="save-btn"]').click()

// After a DOM mutation triggered by the click, the modal may have re-mounted
// Re-query instead of reusing the old reference
await browser.pause(300) // wait for re-render to settle
const updatedModal = await $('[data-testid="settings-modal"]') // fresh query
const status = await updatedModal.$('[data-testid="save-status"]').getText()

// Pattern: always re-query after actions that cause re-renders
await $('[data-testid="toggle"]').click()
// ↑ triggered state change, possibly re-mounted children
await $('[data-testid="result-label"]').waitForDisplayed() // fresh query
const label = await $('[data-testid="result-label"]').getText()
```

---

## 9. Async in Lifecycle Hooks

All hook functions must be declared `async` if they contain any `await` calls. Forgetting `async` on a hook causes the hook to return before async operations complete.

```typescript
describe('My feature', () => {
  before(async () => {
    // Runs once before all tests in this describe block
    await browser.execute((hash) => { window.location.hash = hash }, '#/work')
    await browser.pause(500)
    await $('[data-testid="work-area"]').waitForDisplayed({ timeout: 10000 })
  })

  after(async () => {
    // Cleanup after all tests
    await browser.execute(() => { window.location.hash = '#/' })
  })

  beforeEach(async () => {
    // Reset state before each test
    await $('[data-testid="clear-btn"]').click()
  })

  afterEach(async (test, ctx, result) => {
    // Save screenshot on failure
    if (result.error) {
      const name = test.title.replace(/\s+/g, '-')
      await browser.saveScreenshot(`./screenshots/failures/${name}.png`)
    }
  })
})
```

---

## 10. Common Mistakes Summary

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Missing `await` on `click()` | Click silently skipped; test may pass incorrectly | Add `await` |
| Missing `await` on `getText()` | Returns `Promise<string>` object, not string | Add `await` |
| `forEach` with async callback | All iterations fire in parallel, none awaited | Use `for...of` |
| Sync assertion on async value | `expect(el.isDisplayed()).toBe(true)` — compares Promise to boolean | Use `await` or WDIO matchers like `toBeDisplayed()` |
| `$$().forEach` | Same as `forEach` with async | `for...of` loop |
| `browser.pause` everywhere | Tests are slow; fails on slow CI machines | `waitForExist` / `waitUntil` with timeout |
| Reusing stale element reference | "Stale element reference" error after DOM mutation | Re-query element after mutations |
| Not making hook `async` | Hook completes before awaited operations finish | Declare hook `async () => { ... }` |
| `Promise.all` on sequential mutations | Race conditions, unpredictable DOM state | Use `for...of` for ordered mutations |
| Awaiting `$()` before action | Works, but lazy chaining is idiomatic | Either is valid; be consistent |
