# Example: Visual Regression Tests with @wdio/visual-service

Visual regression testing captures pixel-accurate screenshots and compares them against committed baselines. Any UI change that shifts pixels by more than the threshold causes the test to fail — preventing accidental regressions from reaching users.

---

## wdio.screenshots.conf.ts — Visual Service Setup

The screenshot config extends the base config and adds `@wdio/visual-service`:

```typescript
// wdio.screenshots.conf.ts (relevant excerpt)
import { config as baseConfig } from './wdio.conf.ts'

export const config: WebdriverIO.Config = {
  ...baseConfig,
  specs: ['./e2e/screenshot-crawl.spec.ts'],
  services: [
    ...baseConfig.services ?? [],
    [
      '@wdio/visual-service',
      {
        baselineFolder: './e2e/screenshots/baseline',
        screenshotPath: './e2e/screenshots/actual',
        formatImageName: '{tag}',        // filename = the name you pass to checkScreen()
        autoSaveBaseline: true,          // first run creates baseline; no failure on new screens
        disableCSSAnimation: true,       // freeze CSS transitions for stable captures
        hideScrollBars: true,
      },
    ],
  ],
}
```

Key options:
- `baselineFolder` — where committed PNGs live (tracked in Git LFS)
- `autoSaveBaseline: true` — when no baseline exists, save the current screenshot AS the baseline and pass the test. This means the **first run always passes** and creates the reference images.
- `formatImageName: '{tag}'` — the string you pass to `browser.checkScreen('my-name')` becomes the filename `my-name.png`. Keep names stable; renaming is a breaking change.
- `disableCSSAnimation: true` — prevents spinners, hover transitions, and fade-ins from causing non-deterministic diffs.

---

## The checkScreenshot Helper

This thin wrapper over `browser.checkScreen()` normalises the return type (the service returns either a number or an object) and enforces the project-wide threshold:

```typescript
// e2e/screenshot-crawl.spec.ts
const MISMATCH_THRESHOLD = 2   // 2% max pixel difference

function toMismatchPct(result: unknown): number {
  if (typeof result === 'number') return result
  if (result !== null && typeof result === 'object' && 'misMatchPercentage' in result) {
    return (result as { misMatchPercentage: number }).misMatchPercentage
  }
  return 0
}

async function checkScreenshot(
  name: string,
  options: {
    tolerance?: number
    blockOut?: Array<{ x: number; y: number; width: number; height: number }>
  } = {},
): Promise<void> {
  const { tolerance = MISMATCH_THRESHOLD, blockOut } = options
  const result = await browser.checkScreen(name, blockOut ? { blockOut } : {})
  expect(toMismatchPct(result)).toBeLessThanOrEqual(tolerance)
}
```

Why the `toMismatchPct` normalisation? The `@wdio/visual-service` API has returned both a plain number and an object with `misMatchPercentage` across different versions. The helper makes the spec code version-agnostic.

---

## Complete Describe Block: Sidebar Page Crawl

This pattern generates one `it()` per page, iterating a data table. New pages require only a new row in `SIDEBAR_PAGES` — no new test code.

```typescript
import { navigateSidebarTo, waitForLoadingToSettle } from './helpers/navigation'

const SIDEBAR_PAGES = [
  { nav: 'Home',      screenshot: 'home--initial' },
  { nav: 'Work',      screenshot: 'work--initial' },
  { nav: 'Insights',  screenshot: 'insights--initial' },
  { nav: 'Configure', screenshot: 'configure--initial' },
  { nav: 'Learn',     screenshot: 'learn--initial' },
  // optional: true means skip gracefully if the nav link is absent
  { nav: 'SubAgents', screenshot: 'subagents--initial', optional: true },
] as const

describe('Sidebar page screenshots', () => {
  for (const page of SIDEBAR_PAGES) {
    it(`captures ${page.screenshot}`, async () => {
      // Guard: skip if the nav item doesn't exist in this build
      if (page.optional) {
        const link = await $(`//aside//a[contains(., '${page.nav}')]`)
        const exists = await link.isExisting()
        if (!exists) {
          console.log(`Skipping optional page: ${page.nav}`)
          return
        }
      }

      await navigateSidebarTo(page.nav)
      await waitForLoadingToSettle()

      await checkScreenshot(page.screenshot)
    })
  }
})
```

### waitForLoadingToSettle helper

Call this after navigation to let async data loads and CSS transitions complete before capturing:

```typescript
// e2e/helpers/navigation.ts
export async function waitForLoadingToSettle(ms = 800): Promise<void> {
  // Wait for any skeleton/spinner elements to disappear
  await browser.waitUntil(
    async () => {
      const spinners = await $$('[data-loading="true"], .animate-spin')
      return spinners.length === 0
    },
    { timeout: 10_000, interval: 200 },
  )
  // Extra settle time for CSS transitions
  await browser.pause(ms)
}
```

### Optional page guard — XPath existence check

```typescript
const link = await $(`//aside//a[contains(., '${page.nav}')]`)
const exists = await link.isExisting()
if (!exists) return   // skip gracefully
```

`isExisting()` returns `false` (not an error) when the element is absent. This is the right guard for optional UI elements — do not use `waitForExist` with a short timeout because that throws.

---

## Dynamic Content Masking with blockOut

Some areas of the UI change every run: timestamps, live counters, chart axes with real dates. Block them out so pixel noise in those regions doesn't fail the test.

```typescript
// Block out a region by pixel coordinates (relative to screenshot top-left)
await checkScreenshot('home--initial', {
  blockOut: [
    { x: 0,   y: 0,  width: 200, height: 30 },   // header timestamp
    { x: 820, y: 60, width: 200, height: 40 },   // cost counter badge
  ],
})
```

For tabs with inherently live content, raise the tolerance rather than blocking:

```typescript
const CONFIG_TABS = [
  { configureTab: 'general',    screenshot: 'configure--general' },
  { configureTab: 'team',       screenshot: 'configure--team',        tolerance: 6 },
  { configureTab: 'analytics',  screenshot: 'configure--analytics',   tolerance: 8 },
]
```

Tolerance above ~10% defeats the purpose of visual testing. If a tab is this noisy, mask the live region instead.

---

## Baseline Update Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ First run (no baselines yet)                                │
│   autoSaveBaseline: true → creates PNG → test PASSES        │
│   git add e2e/screenshots/baseline/ && git commit           │
└──────────────────────────────────┬──────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Subsequent runs (CI)                                        │
│   actual screenshot compared against committed baseline     │
│   mismatch > 2% → test FAILS                                │
│   mismatch ≤ 2% → test PASSES                               │
└──────────────────────────────────┬──────────────────────────┘
                                   │
                    intentional UI change?
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Update baselines                                            │
│   npm run e2e:screenshots:update                            │
│   (runs with UPDATE_BASELINE=true or dedicated config)      │
│   git add e2e/screenshots/baseline/ && git commit           │
│   "Update e2e baseline screenshots"                         │
└─────────────────────────────────────────────────────────────┘
```

The `package.json` scripts:

```json
{
  "scripts": {
    "e2e:screenshots":        "wdio run wdio.screenshots.conf.ts",
    "e2e:screenshots:update": "UPDATE_BASELINE=true wdio run wdio.screenshots.conf.ts"
  }
}
```

In `wdio.screenshots.conf.ts`, read the env var:

```typescript
autoSaveBaseline: process.env.UPDATE_BASELINE === 'true',
```

When `UPDATE_BASELINE=true`, `autoSaveBaseline` is true for ALL screenshots — every capture overwrites its baseline. Run this only when you have intentionally changed the UI.

---

## tryScrollCapture Pattern

Some panels overflow their viewport. Capture the initial view, scroll, capture again:

```typescript
async function tryScrollCapture(name: string): Promise<void> {
  // First capture: visible portion
  await checkScreenshot(`${name}--top`)

  // Scroll the main content area
  await browser.execute(() => {
    const main = document.querySelector('main, [role="main"], .overflow-y-auto')
    if (main) main.scrollTop += 600
  })
  await browser.pause(300)

  // Second capture: scrolled content
  const hasMore = await browser.execute(() => {
    const main = document.querySelector('main, [role="main"], .overflow-y-auto')
    return main ? main.scrollTop > 0 : false
  })

  if (hasMore) {
    await checkScreenshot(`${name}--scrolled`)
  }
}
```

Use this for Settings pages, long lists, and anything that doesn't fit in 1280×800. Note this generates two baseline files per page — name them with `--top` and `--scrolled` suffixes so they're obviously paired.
