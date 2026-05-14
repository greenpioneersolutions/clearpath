# Example: Custom Helpers (`e2e/helpers/pw.ts`)

Annotated tour of the helper module at `e2e/helpers/pw.ts`. Specs import via `from './helpers/pw'`.

## Full helper module

```ts
// e2e/helpers/pw.ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const APP_READY_TIMEOUT = 20_000;
export const ELEMENT_TIMEOUT = 10_000;

// ── App lifecycle ────────────────────────────────────────────────────────────

/**
 * Wait until the app renderer has fully loaded.
 *
 * The React app mounts under `<div id="root">` which is always present
 * in the renderer's index.html regardless of which route is active.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.locator('#root').waitFor({
    state: 'attached',
    timeout: APP_READY_TIMEOUT,
  });
  // The visible navigation indicates initial render finished.
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({ timeout: ELEMENT_TIMEOUT });
}

// ── Sidebar navigation ───────────────────────────────────────────────────────

/**
 * Click a sidebar navigation link by its visible text.
 *
 * The sidebar (`<aside>`) holds main nav links AND pinned-bottom links
 * (Connect, Settings) outside the primary `<nav>` — so we search the
 * whole `<aside>`, not just `nav`.
 */
export async function navigateSidebarTo(page: Page, label: string): Promise<void> {
  await page.locator('aside').getByRole('link', { name: label }).click();
  // Brief settle for React Router transition; the spec's follow-up assertion
  // is the real wait.
  await page.waitForTimeout(300);
}

// ── Hash routing ─────────────────────────────────────────────────────────────

/**
 * Navigate to a hash route. In Electron's file:// scheme, page.goto()
 * doesn't reliably handle hash routes — set window.location.hash directly.
 */
export async function navigateToHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForLoadState('domcontentloaded');
}

// ── Configure / Connect tabs ─────────────────────────────────────────────────

/**
 * Navigate to the Settings (was "Configure") page and select a specific tab.
 *
 * Tabs are rendered as `<button id="tab-${tabKey}" role="tab">`.
 * Tab keys: setup, accessibility, settings, tools, policies, memory,
 * agents, skills, wizard, workspaces, team, scheduler, branding.
 */
export async function navigateToConfigureTab(page: Page, tabKey: string): Promise<void> {
  await navigateSidebarTo(page, 'Settings');
  await page.locator(`#tab-${tabKey}`).click();
  await page.waitForTimeout(200);
}

/** Navigate to a Connect page tab via URL params. */
export async function navigateToConnectTab(page: Page, tabKey: string): Promise<void> {
  await navigateToHash(page, `#/connect?tab=${tabKey}`);
}

/** Read a tab's `aria-selected` state. */
export async function isConfigureTabSelected(page: Page, tabKey: string): Promise<boolean> {
  const selected = await page.locator(`#tab-${tabKey}`).getAttribute('aria-selected');
  return selected === 'true';
}

// ── Inputs (React-controlled) ────────────────────────────────────────────────

/**
 * Read an input value. `Locator.inputValue()` reads the actual DOM property
 * (not `getAttribute('value')` which is the initial attr).
 */
export async function getInputValue(page: Page, selector: string): Promise<string> {
  return page.locator(selector).inputValue();
}

/**
 * Set an input value. `Locator.fill()` correctly fires React's onChange
 * because it dispatches a real input event from the browser side. For
 * stubborn cases (CodeMirror, Monaco) use `setInputValueLowLevel` below.
 */
export async function setInputValue(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).fill(value);
}

/**
 * Native-setter fallback for controlled components that intercept input
 * events (rare). Walks the React-patched HTMLInputElement.prototype.value
 * setter and dispatches a synthetic input event with bubbles.
 */
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

// ── IPC bridge ───────────────────────────────────────────────────────────────

/** Round-trip an IPC call through the preload bridge. */
export async function invokeIPC<T = unknown>(
  page: Page,
  channel: string,
  args?: unknown,
): Promise<T> {
  return page.evaluate(
    ([ch, a]) => (window as any).electronAPI.invoke(ch, a),
    [channel, args] as const,
  ) as Promise<T>;
}

// ── Lookups ──────────────────────────────────────────────────────────────────

/** True if any element matching `text` exists on the page. */
export async function elementWithTextExists(page: Page, text: string): Promise<boolean> {
  return (await page.getByText(text).count()) > 0;
}

/** Wait for text to appear anywhere on the page (substring match). */
export async function waitForText(page: Page, text: string, timeout = ELEMENT_TIMEOUT): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible({ timeout });
}

/** True if any button containing `text` exists. */
export async function buttonExists(page: Page, text: string): Promise<boolean> {
  return (await page.getByRole('button', { name: text }).count()) > 0;
}

/** Click the first button containing `text`. */
export async function clickButton(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: text }).click();
}

/** Count elements matching a CSS/XPath selector. */
export async function countElements(page: Page, selector: string): Promise<number> {
  return page.locator(selector).count();
}

/** Wait for a selector to be attached. Prefer locator-targeted assertions. */
export async function waitForSelector(
  page: Page,
  selector: string,
  timeout = ELEMENT_TIMEOUT,
): Promise<void> {
  await page.locator(selector).waitFor({ state: 'attached', timeout });
}

// ── Toggles (aria-checked-based) ─────────────────────────────────────────────

export async function getToggleState(page: Page, id: string): Promise<boolean> {
  const checked = await page.locator(`#${id}`).getAttribute('aria-checked');
  return checked === 'true';
}

export async function clickToggle(page: Page, id: string): Promise<void> {
  await page.locator(`#${id}`).click();
}

// ── Misc ─────────────────────────────────────────────────────────────────────

/** Get all text contents of elements matching a selector. */
export async function getTextContents(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).allTextContents();
}

/** Get the rendered #root HTML (for length-based smoke checks). */
export async function getRootHTML(page: Page): Promise<string> {
  return page.locator('#root').innerHTML();
}

/** Returns true if the main content region is rendered. */
export async function mainContentIsRendered(page: Page): Promise<boolean> {
  return (await page.locator('main, [role="main"], .flex-1').count()) > 0;
}
```

## `freezeDynamicContent` (lives in `e2e/helpers/pw.ts`)

The dynamic-content freezer is pure DOM logic. It lives inline in `pw.ts` next to the other helpers.

```ts
// in e2e/helpers/pw.ts (alongside the helpers above)
import type { Page } from '@playwright/test';

/**
 * Replace dynamic text patterns with deterministic placeholders so that
 * screenshot baselines don't drift between runs.
 *
 * Two complementary mechanisms:
 *  1. Pattern-based replacement of common timestamp/date formats.
 *  2. `data-screenshot-stub` attribute override for non-pattern dynamic content.
 */
export async function freezeDynamicContent(page: Page): Promise<void> {
  await page.evaluate(() => {
    function replaceDynamic(text: string): string {
      let next = text;
      next = next.replace(/Good (morning|afternoon|evening)/g, 'Good day');
      next = next.replace(/\b(just now|moments? ago|yesterday)\b/gi, '5 minutes ago');
      next = next.replace(
        /\b\d+\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|y)\s+ago\b/gi,
        '5 minutes ago',
      );
      next = next.replace(
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}(,\s+\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM))?/g,
        'Apr 26, 2026, 2:45 PM',
      );
      next = next.replace(/\b\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM)\b/g, '2:45 PM');
      next = next.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '4/26/2026');
      next = next.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '2026-04-26');
      next = next.replace(/\b\d+m\s+\d+s\b/g, '2m 15s');
      return next;
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const t = node as Text;
      const replaced = replaceDynamic(t.data);
      if (replaced !== t.data) t.data = replaced;
    }
    document.querySelectorAll<HTMLElement>('[data-screenshot-stub]').forEach((el) => {
      const stub = el.getAttribute('data-screenshot-stub') ?? '';
      if (el.textContent !== stub) el.textContent = stub;
    });
  });
}
```

## `e2e/helpers/pw-screenshots.ts`

For ad-hoc captures (during debug sessions, etc.) — Playwright's built-in `screenshot: 'only-on-failure'` covers most needs. Keep this for explicit "save now" captures.

```ts
// e2e/helpers/pw-screenshots.ts
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = path.resolve(process.cwd(), '.tmp/visual/captures');

export async function captureScreenshot(page: Page, tag: string): Promise<void> {
  try {
    const dir = process.env.SCREENSHOT_DIR ?? DEFAULT_DIR;
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${tag}.png`) });
  } catch (err) {
    console.warn(`captureScreenshot('${tag}') failed:`, err);
  }
}
```

## Why most helpers got smaller

- **`waitForAppReady`** — no more `browser.pause(1000)` after the root selector check; the follow-up `expect(navigation).toBeVisible()` does the same job and gives a better error message.
- **`navigateSidebarTo`** — drops the explicit `waitForExist`/`waitForClickable` calls because `click()` auto-waits for actionability.
- **`setInputValue`** — `locator.fill()` works for React out of the box. The native-setter helper survives as `setInputValueLowLevel` for stubborn cases (CodeMirror, Monaco).
- **`waitForText`** — uses `expect().toBeVisible()` instead of polling `browser.waitUntil`.

## Helpers that didn't need changes

- `freezeDynamicContent` — pure DOM logic
- `navigateToHash` — `page.evaluate(() => window.location.hash = ...)` is the natural Electron pattern
- `invokeIPC` — same shape

## Helpers that changed shape

- All helpers now take `page: Page` as the first arg (since there's no `browser` global). Specs that ported from `await navigateSidebarTo('Sessions')` need to add the `page` arg: `await navigateSidebarTo(page, 'Sessions')`.

## Bonus: TypeScript-typed `electronAPI`

Adding `src/renderer/types/electronAPI.d.ts` lets you drop the `as any` cast:

```ts
// src/renderer/types/electronAPI.d.ts
declare global {
  interface Window {
    electronAPI: {
      invoke<T = unknown>(channel: string, args?: unknown): Promise<T>;
      on?: (channel: string, listener: (...a: unknown[]) => void) => void;
    };
  }
}
export {};
```

Reference it from `tsconfig.playwright.json` `include`. Then:

```ts
const sessions = await page.evaluate(() => window.electronAPI.invoke<Session[]>('cli:list-sessions'));
```
