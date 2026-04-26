# Element API Reference

The element object returned by `$()` and items in `$$()` arrays exposes these methods. All methods return Promises — always `await` them.

---

## Querying Sub-Elements

Scope a lookup to within a specific element to avoid ambiguous matches.

```typescript
// Find a single child matching the CSS selector
const sidebar = await $('[data-testid="sidebar"]')
const link = await sidebar.$('a[href="#/configure"]')

// Find all matching children
const nav = await $('[data-testid="main-nav"]')
const items = await nav.$$('li')

for (const item of items) {
  console.log(await item.getText())
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `element.$('selector')` | `ChainablePromise<Element>` | First matching child |
| `element.$$('selector')` | `Promise<Element[]>` | All matching children |
| `element.shadow$('selector')` | `ChainablePromise<Element>` | First match inside shadow DOM |
| `element.shadow$$('selector')` | `Promise<Element[]>` | All matches inside shadow DOM |

---

## Waiting

Use waiting methods before reading state or asserting — elements must exist or be visible before you can inspect them.

```typescript
// Wait for element to appear in the DOM (not necessarily visible)
await $('[data-testid="result"]').waitForExist({ timeout: 5000 })

// Wait for element to become visible
await $('[data-testid="modal"]').waitForDisplayed({ timeout: 8000 })

// Wait for element to disappear (reverse)
await $('[data-testid="loading-spinner"]').waitForDisplayed({
  timeout: 10000,
  reverse: true, // wait until NOT displayed
})

// Wait until element is clickable (visible + enabled + in viewport)
await $('[data-testid="submit-btn"]').waitForClickable({ timeout: 5000 })

// Wait until input is enabled
await $('[data-testid="input"]').waitForEnabled({ timeout: 3000 })

// Wait for element to disappear from DOM entirely
await $('[data-testid="toast"]').waitForExist({ timeout: 5000, reverse: true })
```

| Method | Options | Auto-waited? | Description |
|--------|---------|-------------|-------------|
| `waitForExist(opts)` | `timeout`, `reverse`, `interval`, `timeoutMsg` | No | Waits for element in DOM |
| `waitForDisplayed(opts)` | `timeout`, `reverse`, `interval`, `timeoutMsg` | No | Waits for visibility |
| `waitForClickable(opts)` | `timeout`, `reverse`, `interval`, `timeoutMsg` | No | Waits until visible + enabled + in viewport |
| `waitForEnabled(opts)` | `timeout`, `reverse`, `interval`, `timeoutMsg` | No | Waits until `disabled` attribute is absent |

> **Important**: These `waitFor*` methods are NOT automatically called before other operations. Unlike `click()` and `setValue()`, read methods like `getText()` and `getValue()` do not auto-wait. Call `waitForExist()` or `waitForDisplayed()` explicitly before reading state.

---

## Interaction

Most interaction methods auto-wait for the element to be interactable before executing.

```typescript
// Basic clicks
await $('[data-testid="send-btn"]').click()
await $('[data-testid="item"]').doubleClick()
await $('[data-testid="item"]').rightClick()

// Text input — clears field first, then types
await $('[data-testid="prompt-input"]').setValue('Hello, world!')

// Append to existing value
await $('[data-testid="tags-input"]').addValue(', extra-tag')

// Clear an input
await $('[data-testid="search"]').clearValue()

// Keyboard input on a focused element
await $('[data-testid="prompt-input"]').keys(['Control', 'a']) // select all
await $('[data-testid="prompt-input"]').keys(['Delete'])
await $('[data-testid="prompt-input"]').keys(['Enter'])

// Hover (no click)
await $('[data-testid="tooltip-trigger"]').moveTo()
// With offset from element center
await $('[data-testid="canvas"]').moveTo({ xOffset: 10, yOffset: -5 })

// Drag and drop
const source = await $('[data-testid="draggable-widget"]')
const target = await $('[data-testid="drop-zone"]')
await source.dragAndDrop(target, { duration: 500 })

// Select dropdown options (for native <select> elements)
await $('select[data-testid="model-select"]').selectByVisibleText('claude-sonnet-4-5')
await $('select[data-testid="mode-select"]').selectByIndex(2)
await $('select[data-testid="theme-select"]').selectByAttribute('value', 'dark')
```

| Method | Description |
|--------|-------------|
| `click()` | Left click |
| `doubleClick()` | Double left click |
| `rightClick()` | Right click (context menu) |
| `setValue(val)` | Clear then type. May not fire React synthetic events reliably — see note below |
| `addValue(val)` | Append text without clearing |
| `clearValue()` | Clear input content |
| `keys(keys[])` | Send keyboard keys to focused element |
| `moveTo(opts?)` | Move pointer to element (hover) |
| `dragAndDrop(target, opts?)` | Drag element to target |
| `selectByIndex(n)` | Select `<option>` by index |
| `selectByVisibleText(text)` | Select `<option>` by label |
| `selectByAttribute(attr, val)` | Select `<option>` by attribute value |

> **React `setValue` note**: For React controlled inputs, `setValue()` may not trigger the `onChange` synthetic event reliably in Electron. If the value doesn't update in React state, use `browser.execute()` to dispatch native input events or use the `setInputValue` helper pattern:
> ```typescript
> await browser.execute((selector, value) => {
>   const el = document.querySelector(selector) as HTMLInputElement
>   const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
>     window.HTMLInputElement.prototype, 'value'
>   )!.set!
>   nativeInputValueSetter.call(el, value)
>   el.dispatchEvent(new Event('input', { bubbles: true }))
>   el.dispatchEvent(new Event('change', { bubbles: true }))
> }, '[data-testid="my-input"]', 'new value')
> ```

---

## Reading State

These methods return the current state of the element. They do **not** auto-wait — ensure the element exists and is in the expected state first.

```typescript
// Text content
const text = await $('h1').getText() // trimmed visible text
const html = await $('[data-testid="card"]').getHTML() // outer HTML
const innerHtml = await $('[data-testid="card"]').getHTML({ includeSelectorTag: false })

// Form values
const inputValue = await $('[data-testid="name-input"]').getValue()
// Note: getValue() can be unreliable for React controlled inputs
// Use browser.execute() for guaranteed accuracy:
const reactValue = await browser.execute(
  (sel) => (document.querySelector(sel) as HTMLInputElement)?.value ?? '',
  '[data-testid="name-input"]'
)

// Attributes and properties
const href = await $('a[data-testid="docs-link"]').getAttribute('href')
const isDisabled = await $('[data-testid="btn"]').getAttribute('disabled')
const checked = await $('input[type="checkbox"]').getProperty('checked')
const tagName = await $('[data-testid="heading"]').getTagName() // 'h2', 'button', etc.

// Computed styles
const color = await $('[data-testid="status"]').getCSSProperty('color')
// color.value => 'rgb(29, 158, 117)'
// color.parsed => { r: 29, g: 158, b: 117, alpha: 1, type: 'color' }
const display = await $('[data-testid="panel"]').getCSSProperty('display')

// Size and position
const size = await $('[data-testid="modal"]').getSize()
// { width: 640, height: 480 }
const position = await $('[data-testid="modal"]').getLocation()
// { x: 320, y: 100 }
```

| Method | Returns | Description |
|--------|---------|-------------|
| `getText()` | `string` | Visible text content (trimmed) |
| `getValue()` | `string` | Form input value (unreliable for React) |
| `getAttribute(name)` | `string \| null` | HTML attribute value |
| `getProperty(name)` | `unknown` | DOM property value |
| `getHTML(opts?)` | `string` | outerHTML or innerHTML |
| `getTagName()` | `string` | Lowercase tag name |
| `getCSSProperty(prop)` | `CSSProperty` | Computed style with parsed values |
| `getSize()` | `{ width, height }` | Element dimensions in pixels |
| `getLocation()` | `{ x, y }` | Element position relative to viewport |

---

## Boolean State

Instant checks — no auto-wait. Use `waitFor*` variants when you need to wait for the state to change.

```typescript
// Existence checks
const exists = await $('[data-testid="optional-panel"]').isExisting()
const visible = await $('[data-testid="modal"]').isDisplayed()
const visibleInViewport = await $('[data-testid="footer"]').isDisplayedInViewport()

// Interaction state
const enabled = await $('[data-testid="btn"]').isEnabled()
const clickable = await $('[data-testid="btn"]').isClickable() // visible + enabled + in viewport
const focused = await $('[data-testid="input"]').isFocused()

// Selection state
const checked = await $('input[type="checkbox"]').isSelected()
const optionSelected = await $('option[value="dark"]').isSelected()

// Conditional logic based on state
if (await $('[data-testid="sidebar"]').isDisplayed()) {
  await $('[data-testid="sidebar-toggle"]').click()
}
```

| Method | Returns | Description |
|--------|---------|-------------|
| `isExisting()` | `boolean` | Element is in the DOM (may be hidden) |
| `isDisplayed()` | `boolean` | Visible (opacity/display/visibility-aware) |
| `isDisplayedInViewport()` | `boolean` | Visible within the current viewport |
| `isEnabled()` | `boolean` | Not disabled |
| `isClickable()` | `boolean` | Visible + enabled + in viewport |
| `isFocused()` | `boolean` | Currently has focus |
| `isSelected()` | `boolean` | Checkbox/radio/option is selected |

---

## Scrolling

```typescript
// Scroll element into view (align to center by default)
await $('[data-testid="footer-section"]').scrollIntoView()

// Align to top of viewport
await $('[data-testid="section-header"]').scrollIntoView(true)

// Align to bottom of viewport
await $('[data-testid="section-header"]').scrollIntoView(false)

// Fine-grained control (CSS ScrollIntoViewOptions)
await $('[data-testid="item"]').scrollIntoView({
  block: 'start',   // 'start' | 'center' | 'end' | 'nearest'
  inline: 'center', // 'start' | 'center' | 'end' | 'nearest'
})
```

---

## Screenshots

```typescript
// Save a screenshot of just this element (cropped to bounding box)
await $('[data-testid="agent-card"]').saveScreenshot('./screenshots/agent-card.png')

// Useful for visual regression on specific components
const card = await $('[data-testid="notification-card"]')
await card.saveScreenshot(`./baseline/notification-card.png`)
```

For full-page or viewport screenshots and visual regression, use `browser.saveScreenshot()` or the `@wdio/visual-service` `browser.checkScreen()` / `browser.checkElement()` commands.

---

## DOM Navigation

Navigate the DOM tree relative to a known element.

```typescript
// Parent element
const listItem = await $('[data-testid="active-item"]')
const list = await listItem.parentElement()

// Siblings
const firstItem = await $('[data-testid="first-item"]')
const secondItem = await firstItem.nextElement()
const nothing = await firstItem.previousElement() // null if no previous sibling

// Nth sibling
const thirdSibling = await firstItem.nextSibling(2) // skip 2 forward
```

| Method | Description |
|--------|-------------|
| `parentElement()` | Parent DOM node |
| `nextElement()` | Next sibling |
| `previousElement()` | Previous sibling |
| `nextSibling(n)` | nth next sibling |
| `previousSibling(n)` | nth previous sibling |

---

## Key Notes

- **Auto-wait applies to interactions**: `click()`, `setValue()`, `addValue()`, `doubleClick()`, `rightClick()`, `keys()`, `selectBy*()` all automatically wait for the element to be interactable.
- **Auto-wait does NOT apply to reads**: `getText()`, `getValue()`, `getAttribute()`, `isDisplayed()`, `isExisting()` are instant checks. Use `waitForDisplayed()` / `waitForExist()` before reading if the element might not be ready.
- **Stale elements**: Re-query elements after DOM mutations. After a `click()` that triggers a React state update and re-render, any previously stored element references may be stale.
- **`getValue()` and React**: React controlled inputs may not reflect their current value via `getValue()`. Use `browser.execute((sel) => document.querySelector(sel).value, selector)` for accuracy.
- **`$$` and async iteration**: Always use `for...of`, never `forEach`, when iterating over element arrays with async operations.
