# Page Object Pattern

## Overview

The Page Object pattern encapsulates selectors and page actions into reusable classes. In WebdriverIO, this means:

- Selectors are defined as `get` properties (lazily evaluated — not queried at construction time)
- Actions are methods that combine multiple selector queries
- Classes export singleton instances, not the class itself

This pattern keeps tests readable and maintainable: when a selector changes, you update it in one place.

---

## Base Page Class

```typescript
// e2e/pages/page.ts
export class Page {
  /**
   * Navigate to a path. For Electron hash-router apps, use navigateToHash() instead.
   */
  open(path: string) {
    return browser.url(path)
  }
}
```

---

## Example: Configure Page

```typescript
// e2e/pages/configure.page.ts
import { Page } from './page.js'

class ConfigurePage extends Page {
  // Selectors as getters — evaluated lazily when accessed, not at construction
  get setupTab() { return $('#tab-setup') }
  get settingsTab() { return $('#tab-settings') }
  get policiesTab() { return $('#tab-policies') }
  get agentsTab() { return $('#tab-agents') }

  async selectTab(key: string) {
    const tab = await $(`#tab-${key}`)
    await tab.waitForClickable({ timeout: 10000 })
    await tab.click()
    await browser.pause(500)
  }

  async isTabSelected(key: string): Promise<boolean> {
    try {
      const tab = await $(`#tab-${key}`)
      return (await tab.getAttribute('aria-selected')) === 'true'
    } catch {
      return false
    }
  }
}

// Export singleton instance — not the class
export default new ConfigurePage()
```

---

## Using Page Objects in Tests

```typescript
// e2e/configure.spec.ts
import ConfigurePage from './pages/configure.page.js'
import { waitForAppReady, navigateSidebarTo } from './helpers/app.js'

describe('Configure page', () => {
  before(async () => {
    await waitForAppReady()
    await navigateSidebarTo('Configure')
  })

  it('can navigate to Settings tab', async () => {
    await ConfigurePage.selectTab('settings')
    expect(await ConfigurePage.isTabSelected('settings')).toBe(true)
  })
})
```

---

## Why Getters (Not Constructor Assignments)

```typescript
// WRONG — queried at construction time, element may not exist yet
class BadPage {
  settingsTab = $('#tab-settings')  // evaluated when new BadPage() runs
}

// RIGHT — evaluated lazily when accessed in a test
class GoodPage {
  get settingsTab() { return $('#tab-settings') }  // evaluated at access time
}
```

The `$()` call returns a ChainablePromiseElement. When used as a constructor assignment, it is called during module import — before the browser is connected and before the app has rendered. Using `get` defers the call to the moment the test actually uses the property.

---

## Folder Layout

```
e2e/
├── pages/
│   ├── page.ts              ← base class
│   ├── configure.page.ts    ← Configure page
│   ├── work.page.ts         ← Work page
│   └── insights.page.ts     ← Insights page
├── helpers/
│   └── app.ts               ← shared low-level utilities
└── *.spec.ts                ← test files
```

---

## When to Use vs. Plain Helpers

| Approach | Use when |
|----------|----------|
| Page object | Multiple tests share the same page selectors/actions |
| Helper function | Utility used across many pages (`waitForAppReady`, `navigateSidebarTo`) |
| Inline in test | Action used once, in one test |

---

## Electron-Specific Note

The base `Page.open(path)` method uses `browser.url()` which does not work for hash-router navigation in Electron (the app runs from `file://`). Use the `navigateToHash()` helper from `e2e/helpers/app.ts` instead:

```typescript
// In page object for Electron hash routing:
async navigateTo(hash: string) {
  await browser.execute((h) => { window.location.hash = h }, hash)
  await browser.pause(500)
}
```

Alternatively, expose a helper that navigates via the sidebar so the app's own routing logic runs correctly:

```typescript
// e2e/helpers/app.ts
export async function navigateSidebarTo(label: string) {
  const link = await $(`[data-testid="nav-${label.toLowerCase()}"]`)
  await link.waitForClickable({ timeout: 10000 })
  await link.click()
  await browser.pause(500)
}
```

---

## Page Object With State Verification

For pages where you need to verify that content has loaded before interacting, add a `waitForLoad` method:

```typescript
class WorkPage extends Page {
  get chatInput() { return $('[data-testid="chat-input"]') }
  get sendButton() { return $('[data-testid="send-button"]') }
  get messageList() { return $$('[data-testid="message"]') }

  async waitForLoad() {
    await this.chatInput.waitForDisplayed({ timeout: 15000 })
  }

  async sendMessage(text: string) {
    await this.chatInput.setValue(text)
    await this.sendButton.click()
  }

  async getMessageCount(): Promise<number> {
    return (await this.messageList).length
  }
}

export default new WorkPage()
```

Then in tests:

```typescript
before(async () => {
  await navigateSidebarTo('Work')
  await WorkPage.waitForLoad()
})
```
