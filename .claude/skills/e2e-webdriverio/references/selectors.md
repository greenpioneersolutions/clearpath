# Selectors — Finding Elements in WebdriverIO

How to locate elements in your Electron + React app, ordered from most to least resilient.

---

## 1. ARIA Selectors (Recommended #1)

The most resilient selectors because they target accessibility semantics, not DOM structure or styling. They survive refactors as long as the element's accessible name stays the same.

```typescript
// By accessible name (button label, aria-label, legend, etc.)
await $('aria/Submit').click()
await $('aria/Close dialog').click()

// Explicit aria-label attribute
await $('[aria-label="Close"]').click()
await $('[aria-label="Open sidebar navigation"]').isDisplayed()

// Role + name
await $('[role="dialog"][aria-label="Settings"]').waitForDisplayed()
```

**When to use:** Interactive elements — buttons, inputs, links, dialogs, checkboxes. Anything a screen reader would announce.

**When to avoid:** Pure display content with no semantic role or label.

---

## 2. `data-testid` Attributes (Recommended #2)

Stable, intent-clear, and completely decoupled from styling or copy changes. Best for key interaction points in your tests.

```typescript
await $('[data-testid="sidebar-nav"]').isDisplayed()
await $('[data-testid="session-send-btn"]').click()
await $('[data-testid="model-selector"]').selectByVisibleText('claude-sonnet-4-5')

// Scoped lookup — find testid within a container
const panel = await $('[data-testid="agents-panel"]')
await panel.$('[data-testid="agent-card"]').click()
```

**When to use:** Primary navigation landmarks, form submission targets, modal triggers, any element your test suite critically depends on.

**When to avoid:** Every single element in the DOM — that's over-engineering. Reserve for genuinely important test targets.

---

## 3. CSS Selectors

Fast, familiar, and readable. Good for stable structural elements.

```typescript
// By ID (most specific)
await $('#root').waitForExist()
await $('#sidebar').isDisplayed()

// By class
await $('.modal-overlay').waitForDisplayed()
await $('.notification-badge').getText()

// Compound selectors
await $('button.primary').click()
await $('input[type="checkbox"]').click()
await $('input[placeholder="Search sessions..."]').setValue('my session')

// Attribute selectors
await $('[data-active="true"]').getText()
await $('[disabled]').isEnabled() // expect false
```

**When to use:** Structural elements, form inputs by type/placeholder, unique IDs.

**When to avoid:** Tailwind utility classes like `.text-blue-500` or `.bg-purple-600` — these change with theme updates and break tests silently.

---

## 4. XPath Selectors (Required for Text Matching in Electron)

XPath is the reliable way to find elements by visible text in Electron's Chromedriver context.

> **Why XPath instead of WebdriverIO's built-in text selectors?**
>
> WebdriverIO supports `$('button=Submit')` (exact text) and `$('button*=Submit')` (partial text) selectors, but these are **not reliably translated** in Electron's Chromedriver context — they may silently match nothing or throw. XPath `contains(., text)` is the safe, tested alternative.

```typescript
// Find element containing specific text
await $('//aside//a[contains(., "Configure")]').click()
await $('//button[contains(., "Submit")]').click()
await $('//h2[contains(., "Agent Settings")]').waitForDisplayed()

// Exact text match with normalize-space (handles whitespace)
await $('//button[normalize-space(.)="Save Changes"]').click()

// Compound XPath — exclude a role to narrow results
await $('//button[not(@role="tab") and contains(., "Settings")]').click()

// Navigate to parent
await $('//span[contains(., "Active")]/ancestor::div[@data-testid]')

// Find by text within a specific container
await $('//nav//a[contains(., "Dashboard")]').click()

// Sibling navigation
await $('//label[contains(., "Enable")]/following-sibling::input').click()
```

**When to use:**
- Finding buttons or links by their visible label when no ARIA/testid is available
- Navigating relative to text content
- Complex structural relationships that CSS can't express

**When to avoid:** When you have CSS or ARIA options — XPath is verbose and harder to maintain.

---

## 5. Tag Name Selectors

Rarely useful on their own. Prefer CSS or ARIA.

```typescript
// Selects first matching tag — fragile if layout changes
await $('<button />').click()    // first button on page
await $('<input />').setValue('text')

// More useful as a scoped child query
const form = await $('[data-testid="login-form"]')
await form.$('<button />').click() // first button inside form
```

---

## 6. Multiple Elements (`$$`)

`$$()` returns an array of all matching elements. Use `for...of` for async iteration — **never `forEach`** with async callbacks.

```typescript
// Get all matching elements
const cards = await $$('[data-testid="agent-card"]')
console.log(`Found ${cards.length} agents`)

// Correct: for...of with await
for (const card of cards) {
  const name = await card.getText()
  console.log(name)
}

// WRONG — forEach ignores async, promises are not awaited
cards.forEach(async (card) => {
  const name = await card.getText() // silently ignored!
})

// Finding the nth match safely
const items = await $$('.session-item')
const second = items[1] // index access is fine, avoid magic numbers
await second.click()

// Filter by condition
const activeCards = []
for (const card of cards) {
  if (await card.$('[data-active="true"]').isExisting()) {
    activeCards.push(card)
  }
}
```

---

## 7. Chaining Selectors

Scope lookups to a container to avoid ambiguity.

```typescript
// CSS descendant (single query — fastest)
const link = await $('#sidebar a[href="#/configure"]')

// Chained queries (two queries — clearer intent)
const sidebar = await $('#sidebar')
const link = await sidebar.$('a[href="#/configure"]')

// Deep chain
const nav = await $('[data-testid="main-nav"]')
const activeItem = await nav.$('[aria-current="page"]')
const label = await activeItem.getText()
```

Single CSS descendants are slightly faster; chained queries are easier to read when the parent element is reused across multiple lookups.

---

## 8. Selector Strategy Comparison

| Strategy | Use when | Avoid when |
|----------|----------|------------|
| `aria/Name` | Interactive elements with accessible names | Static display-only content |
| `[data-testid]` | Key interaction points in test suite | Every element (over-engineering) |
| XPath `contains(., text)` | Text-based lookup in Electron Chromedriver | A CSS/ARIA option exists |
| CSS `#id` | Single unique element with stable ID | Multiple instances expected |
| CSS `.class` | Style-defined groups with stable class names | Tailwind utility classes |
| CSS `[attr]` | Attribute-based state (`[disabled]`, `[type]`) | Dynamic attribute values |
| Tag name | Scoped "first child of type" lookups | Page-level queries |
| XPath ancestor/sibling | Navigating relative to known text | Simple parent-child CSS works |

---

## 9. Anti-Patterns to Avoid

```typescript
// BAD: Tailwind class — changes with theme updates
await $('.text-blue-500').click()
await $('.bg-purple-600').isDisplayed()

// BAD: Index-based — breaks when items are added/reordered
await $$('button')[3].click()
await $$('.nav-item')[0].getText()

// BAD: WebdriverIO text prefix (unreliable in Electron Chromedriver)
await $('button=Submit').click()       // may not work
await $('button*=Subm').click()        // may not work

// GOOD alternatives
await $('[data-testid="submit-btn"]').click()
await $('//button[contains(., "Submit")]').click()
await $('aria/Submit').click()
```

---

## 10. Shadow DOM

For web components that use a shadow root (uncommon in React apps but possible with third-party components):

```typescript
// Query inside shadow DOM
const inner = await $('my-custom-component').shadow$('.inner-button')
await inner.click()

// Query all inside shadow DOM
const items = await $('my-list-component').shadow$$('li')
for (const item of items) {
  console.log(await item.getText())
}
```

---

## 11. Electron-Specific Notes

- **`=` text prefix** (`$('button=Submit')`) — unreliable in Electron Chromedriver. Use XPath instead.
- **`*=` partial text prefix** — similarly unreliable. Use `contains(., text)` in XPath.
- **Chromedriver version matters**: The Electron version determines the bundled Chromedriver version. Selector behavior can differ from browser-based Chromedriver.
- **`file://` origin**: The app runs from a `file://` URL. Some selectors and browser APIs behave slightly differently than `http://` — test in the actual Electron environment, not in a regular browser.
- **IPC-driven UI**: State changes often happen via `window.electronAPI` IPC calls. After triggering IPC-driven UI changes, use `waitForDisplayed()` or `waitUntil()` rather than assuming immediate DOM updates.
