# Expect Assertions — expect-webdriverio

WebdriverIO v9 ships with `expect-webdriverio` built in, extending Jest's `expect` API with async-aware matchers for browser and element assertions. All matchers auto-wait (polling up to `waitforTimeout`) before failing, so you rarely need explicit waits before asserting.

---

## Browser Matchers

```typescript
await expect(browser).toHaveUrl('https://example.com')
await expect(browser).toHaveUrl('example.com', { containing: true })
await expect(browser).toHaveTitle('My App')
await expect(browser).toHaveTitle('My', { containing: true })
await expect(browser).toHaveClipboardText('copied text')
```

| Matcher | Description |
|---------|-------------|
| `toHaveUrl(expected, options)` | Current URL equals (or contains) `expected` |
| `toHaveTitle(expected, options)` | Page `<title>` equals (or contains) `expected` |
| `toHaveClipboardText(expected)` | System clipboard content matches `expected` |

---

## Element State Matchers

```typescript
const el = await $('[data-testid="submit-btn"]')

await expect(el).toBeDisplayed()
await expect(el).toExist()
await expect(el).toBeClickable()
await expect(el).toBeEnabled()
await expect(el).toBeDisabled()
await expect(el).toBeFocused()
await expect(el).toBeSelected()
await expect(el).toBeChecked()
await expect(el).toBePresent()
```

| Matcher | Description |
|---------|-------------|
| `toBeDisplayed()` | Element is visible (rendered and not hidden) |
| `toExist()` | Element exists in the DOM (not necessarily visible) |
| `toBeClickable()` | Element is visible, enabled, and within the viewport |
| `toBeEnabled()` | Element is not `disabled` |
| `toBeDisabled()` | Element has `disabled` attribute (shorthand for `.not.toBeEnabled()`) |
| `toBeFocused()` | Element is the currently focused element |
| `toBeSelected()` | Checkbox, radio, or `<option>` is checked/selected |
| `toBeChecked()` | Alias for `toBeSelected()` |
| `toBePresent()` | Alias for `toExist()` |

---

## Content Matchers

```typescript
const el = await $('.message')

await expect(el).toHaveText('Hello World')
await expect(el).toHaveText('Hello', { containing: true })
await expect(el).toHaveHTML('<span>Hello</span>')
await expect(el).toHaveAttribute('aria-label', 'Submit')
await expect(el).toHaveAttribute('disabled')               // just check presence
await expect(el).toHaveElementClass('btn-primary')
await expect(el).toHaveValue('my input value')
await expect(el).toHaveId('main-heading')
await expect(el).toHaveHref('https://example.com')
await expect(el).toHaveStyle('color', 'rgb(0, 0, 0)')
```

| Matcher | Description |
|---------|-------------|
| `toHaveText(expected, options)` | Visible text content (trims whitespace by default) |
| `toHaveHTML(expected, options)` | Element `innerHTML` |
| `toHaveAttribute(attr, value?, options)` | Attribute exists; optionally checks its value |
| `toHaveElementClass(className, options)` | Element has the specified CSS class |
| `toHaveValue(value, options)` | Value of a form input, textarea, or select |
| `toHaveId(id)` | Element `id` attribute matches |
| `toHaveHref(href, options)` | `<a>` element `href` attribute matches |
| `toHaveStyle(prop, value)` | Computed style property matches value |

---

## Count Matchers

```typescript
const items = await $$('.list-item')

await expect(items).toBeElementsArrayOfSize(5)
await expect(items).toBeElementsArrayOfSize({ gte: 1 })   // at least 1

const container = await $('.parent')
await expect(container).toHaveChildren(3)
await expect(container).toHaveChildren({ gte: 1 })
```

| Matcher | Description |
|---------|-------------|
| `toBeElementsArrayOfSize(n)` | Element array has exactly `n` elements; accepts `{ gte, lte, gt, lt }` |
| `toHaveChildren(n)` | Element has `n` direct child elements; accepts comparison object |

---

## Visual Matchers (requires @wdio/visual-service)

Visual matchers compare screenshots against stored baselines. They throw on mismatch (unlike `checkScreen()` which returns a percentage).

```typescript
/// <reference types="@wdio/visual-service" />

// Full viewport
await expect(browser).toMatchScreenSnapshot('home-initial')

// Single element
const sidebar = await $('#sidebar')
await expect(sidebar).toMatchElementSnapshot('sidebar-closed')

// Full scrolled page
await expect(browser).toMatchFullPageSnapshot('home-full-page')
```

| Matcher | Description |
|---------|-------------|
| `toMatchScreenSnapshot(tag, options)` | Compare viewport screenshot against baseline |
| `toMatchElementSnapshot(tag, options)` | Compare element screenshot against baseline |
| `toMatchFullPageSnapshot(tag, options)` | Compare full scrolled-page screenshot against baseline |

See `visual-testing.md` and `visual-service-options.md` for configuration details and `options`.

---

## Common Options

All text and content matchers accept an options object as the last argument:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `containing` | boolean | `false` | Partial match — check if value contains `expected` |
| `ignoreCase` | boolean | `false` | Case-insensitive string comparison |
| `trim` | boolean | `true` | Trim whitespace from actual value before comparing |
| `wait` | number | `waitforTimeout` | Override the auto-wait timeout in ms |
| `interval` | number | `waitforInterval` | Polling interval in ms |
| `message` | string | — | Custom failure message |

```typescript
await expect(el).toHaveText('hello world', {
  ignoreCase: true,
  containing: true,
  wait: 10000,
})
```

---

## `.not` Modifier

Every matcher can be negated with `.not`:

```typescript
await expect(el).not.toBeDisplayed()
await expect(el).not.toHaveText('Error')
await expect(el).not.toBeDisabled()
await expect(browser).not.toHaveUrl('login', { containing: true })
```

---

## Soft Assertions (non-throwing)

Soft assertions collect failures without immediately throwing. Use them when you want to check multiple conditions and report all failures at once.

```typescript
// Accumulate failures (does not throw)
expect.soft(await $('h1')).toHaveText('Dashboard')
expect.soft(await $('.sidebar')).toBeDisplayed()
expect.soft(await $('[data-testid="user-name"]')).toHaveText('Alice')

// Throw if any soft failures occurred (call at end of test or in afterEach)
expect.assertSoftFailures()

// Or inspect failures programmatically
const failures = expect.getSoftFailures()
if (failures.length > 0) {
  console.log('Soft failures:', failures)
}
```

Soft failures are scoped per-test and cleared automatically between tests when using the WDIO test runner.

---

## Custom Matchers

Extend `expect` with project-specific matchers using `expect.extend()`.

```typescript
// test/matchers.ts
expect.extend({
  async toHaveLoadedData(el: WebdriverIO.Element) {
    const html = await el.getHTML()
    const pass = !html.includes('Loading')
    return {
      pass,
      message: () =>
        pass
          ? 'Expected element to still be loading'
          : 'Expected element to have loaded its data, but it still shows loading state',
    }
  },
})
```

Register in `wdio.conf.ts` so all specs have access:

```typescript
// wdio.conf.ts
import './test/matchers'

export const config = {
  // ...
  before() {
    // matchers loaded at module level above
  },
}
```

Add TypeScript types in a `.d.ts` file:

```typescript
// test/matchers.d.ts
declare namespace WebdriverIO {
  interface Matchers<R> {
    toHaveLoadedData(): R
  }
}
```

---

## Important Behavioral Notes

### Auto-wait is built in — don't manually await state

```typescript
// WRONG — bypasses auto-wait, fails if element isn't ready yet
expect(await el.isDisplayed()).toBe(true)

// RIGHT — auto-waits up to waitforTimeout, better error messages
await expect(el).toBeDisplayed()
```

### Prefer built-in matchers over raw element method checks

```typescript
// WRONG — fragile, no retry, poor failure message
const text = await el.getText()
expect(text).toBe('Submit')

// RIGHT — retries until text matches or timeout expires
await expect(el).toHaveText('Submit')
```

### Always `await` expect calls

All expect-webdriverio matchers return a `Promise`. Forgetting `await` means the assertion never runs and the test always passes silently.

```typescript
// WRONG — silent no-op
expect(el).toBeDisplayed()

// RIGHT
await expect(el).toBeDisplayed()
```
