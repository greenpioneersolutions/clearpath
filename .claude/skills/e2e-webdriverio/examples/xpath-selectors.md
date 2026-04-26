# Example: XPath Selectors in Electron + Chromedriver

Electron's embedded Chromedriver does not reliably support WebdriverIO's convenience text selectors. XPath is the consistent, cross-version way to locate elements by visible text content in this project.

---

## Why XPath in Electron?

WebdriverIO has shorthand selectors that translate to browser-native strategies:

| WD shorthand | Translates to | Works in Electron? |
|---|---|---|
| `$('button=Submit')` | XPath `//button[.="Submit"]` | Sometimes, not reliably |
| `$('*=Partial Text')` | XPath `//\*[contains(text(),'Partial Text')]` | Sometimes |
| `$('button*=Save')` | Compound text+tag | Unreliable |
| `$('aria/Close')` | ARIA selector strategy | Requires newer Chromedriver |
| `$('//button[contains(., "Save")]')` | Literal XPath | Works consistently |

The problem is not WebdriverIO — it's the Chromedriver version bundled with Electron. Each Electron version ships a specific Chromedriver that corresponds to its Chromium version. Text selectors are translated client-side by WebdriverIO, but the resulting XPath or `css selector` strategy is then executed by Chromedriver, which may not support the exact selector form being sent.

Using explicit XPath from the start avoids this entire class of flakiness.

---

## XPath Patterns Used in This Project

### Sidebar navigation

The sidebar contains both a `<nav>` element and additional links outside it (e.g. Configure). To avoid assumptions about structure, search the entire `<aside>`:

```typescript
// helpers/navigation.ts — navigateSidebarTo()
export async function navigateSidebarTo(label: string): Promise<void> {
  // //aside//a searches any <a> that is a descendant of <aside>, at any depth
  const link = await $(`//aside//a[contains(., '${label}')]`)
  await link.waitForExist({ timeout: 10_000 })
  await link.click()
  await browser.pause(500)
}
```

`contains(., 'text')` matches on the element's full text content, including text in child elements. `contains(text(), 'text')` only matches on direct text nodes — avoid it for elements with child spans or icons.

### Button by text (clickButton helper)

```typescript
export async function clickButton(text: string): Promise<void> {
  const btn = await $(`//button[contains(., '${text}')]`)
  await btn.waitForExist({ timeout: 10_000 })
  await btn.click()
}

export async function buttonExists(text: string): Promise<boolean> {
  const btn = await $(`//button[contains(., '${text}')]`)
  return btn.isExisting()
}
```

### Insights tab buttons

The Insights page has tab buttons labelled "Analytics", "Compliance", "Activity", etc.:

```typescript
const INSIGHTS_TABS = [
  { label: 'Analytics',  screenshot: 'insights--analytics' },
  { label: 'Compliance', screenshot: 'insights--compliance' },
]

for (const tab of INSIGHTS_TABS) {
  it(`captures ${tab.screenshot}`, async () => {
    const btn = await $(`//button[contains(., '${tab.label}')]`)
    await btn.waitForExist({ timeout: 10_000 })
    await btn.click()
    await browser.pause(500)
    await checkScreenshot(tab.screenshot)
  })
}
```

### Inner sub-tabs — excluding the Configure sidenav

This is the trickiest selector in the project. The Configure page has a sidenav where each item is a `<button role="tab">`. Some inner pages also have sub-tabs that are plain `<button>` elements without a `role`. Both levels might use the same label (e.g. "Settings" appears as a sidenav tab AND as an inner sub-tab on some pages).

The correct selector excludes `role="tab"` buttons to target only inner sub-tabs:

```typescript
// Finds: <button>Settings</button>  (no role attribute)
// Skips: <button role="tab">Settings</button>  (sidenav item)
const subBtn = await $(`//button[not(@role='tab') and contains(., '${sub.subLabel}')]`)
```

Used in the Configure page crawl:

```typescript
const CONFIGURE_TABS = [
  { configureTab: 'general',      screenshot: 'configure--general' },
  { configureTab: 'models',       screenshot: 'configure--models' },
  {
    configureTab: 'team',
    screenshot:   'configure--team',
    subTabs: [
      { subLabel: 'Members', screenshot: 'configure--team--members' },
      { subLabel: 'Activity', screenshot: 'configure--team--activity', tolerance: 6 },
    ],
  },
]

for (const tab of CONFIGURE_TABS) {
  it(`Configure: ${tab.configureTab}`, async () => {
    // Click the sidenav tab (role="tab")
    const sidenavTab = await $(`//button[@role='tab' and contains(., '${tab.configureTab}')]`)
    await sidenavTab.click()
    await browser.pause(400)

    if (tab.subTabs) {
      for (const sub of tab.subTabs) {
        // Click the inner sub-tab (no role attribute)
        const subBtn = await $(`//button[not(@role='tab') and contains(., '${sub.subLabel}')]`)
        await subBtn.click()
        await browser.pause(400)
        await checkScreenshot(sub.screenshot, { tolerance: sub.tolerance })
      }
    } else {
      await checkScreenshot(tab.screenshot)
    }
  })
}
```

---

## XPath Quick Reference

| Pattern | Example | Use case |
|---|---|---|
| `//tag[contains(., 'text')]` | `//button[contains(., 'Save')]` | Find by text content (including child text) |
| `//tag[contains(text(), 'text')]` | `//h2[contains(text(), 'Dashboard')]` | Find by direct text node only |
| `//tag[@attr='val']` | `//input[@type='checkbox']` | Find by exact attribute value |
| `//tag[@attr]` | `//button[@disabled]` | Find elements that have an attribute |
| `//tag[not(@attr='val')]` | `//button[not(@role='tab')]` | Exclude by attribute value |
| `//tag[not(@attr)]` | `//button[not(@disabled)]` | Exclude elements with attribute |
| `//parent//child` | `//aside//a` | Any descendant (any depth) |
| `//parent/child` | `//ul/li` | Direct child only |
| Compound AND | `//button[not(@role='tab') and contains(., 'Save')]` | Multiple conditions |
| Compound OR | `//button[@type='submit' or @type='button']` | Either condition |
| Position | `(//button)[3]` | Third button on page — fragile, avoid |
| Parent axis | `//span/..` | The parent of a span — use sparingly |

---

## CSS vs XPath Decision Table

For selectors that don't require text matching, CSS is simpler and faster:

| Need | Prefer | Example |
|---|---|---|
| By ID | CSS | `$('#session-name-input')` |
| By class | CSS | `$('.sidebar-link')` |
| By data-testid | CSS | `$('[data-testid="save-btn"]')` |
| By ARIA label (on modern Chromedriver) | CSS attr | `$('[aria-label="Close dialog"]')` |
| By exact visible text | XPath | `$('//button[contains(., "Save")]')` |
| By text, excluding a role | XPath | `$('//button[not(@role="tab") and contains(., "Save")]')` |
| Navigate to parent | XPath | `$('//span[@class="badge"]/..')` |

### Gotcha: data-testid is the best option when available

If the component you're testing has a `data-testid` attribute, use it — it's the most stable selector because it survives refactors, copy changes, and DOM restructuring:

```typescript
// Best — survives all refactors
await $('[data-testid="save-session-btn"]').click()

// Good — stable as long as label text doesn't change
await $('//button[contains(., "Save Session")]').click()

// Fragile — breaks if DOM structure changes
await $$('button')[2].click()
```

When writing new components for this project, add `data-testid` attributes to interactive elements that tests need to reach.

---

## Debugging XPath in the REPL

When `browser.debug()` is active:

```
# Check if a selector matches anything
> await $("//aside//a[contains(., 'Configure')]").isExisting()
true

# Count matches
> (await $$("//button[contains(., 'Settings')]")).length
3   // ← too many matches — need to narrow

# Inspect text of all matches
> for (const b of await $$("//button[contains(., 'Settings')]")) { console.log(await b.getAttribute('role'), await b.getText()) }
tab Settings        // sidenav
null Settings       // inner sub-tab
null Account Settings  // another match

# Confirm the refined selector
> await $("//button[not(@role='tab') and . = 'Settings']").isExisting()
true

# Test exact-match vs contains
> await $("//button[. = 'Settings']").isExisting()          // exact
true
> await $("//button[contains(., 'Settings')]").isExisting() // contains
true  // both work here; use contains unless you need exact
```

Note: `. = 'text'` is exact match (normalised whitespace). `contains(., 'text')` is substring. For button labels that are also prefixes of other labels (e.g. "Model" vs "Model Settings"), prefer exact match or refine the ancestor context.
