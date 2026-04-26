# Visual Testing — @wdio/visual-service

`@wdio/visual-service` adds pixel-level screenshot comparison to WebdriverIO v9. It stores baseline images in git, captures actual screenshots during test runs, and diffs them to detect unintended UI regressions.

---

## Installation

```bash
npm install --save-dev @wdio/visual-service
```

---

## Configuration in wdio.conf.ts

```typescript
import type { Options } from '@wdio/types'

export const config: Options.Testrunner = {
  services: [
    ['visual', {
      // Directory where baseline images are stored (commit to git)
      baselineFolder: './e2e/screenshots/baseline',
      // Root directory for actual and diff screenshots (gitignore these)
      screenshotPath: './e2e/screenshots',
      // Auto-create baseline on first run (test always passes; saves screenshot as new baseline)
      autoSaveBaseline: true,
      // Image naming: {tag} is replaced by the name passed to checkScreen()/saveScreen()
      formatImageName: '{tag}',
      // Disable CSS transitions and animations for stable, deterministic screenshots
      disableCSSAnimation: true,
      // Hide browser/OS scrollbars for cleaner comparison
      hideScrollBars: true,
    }]
  ],
}
```

For all available service-level options, see `visual-service-options.md`.

---

## TypeScript Setup

Add `@wdio/visual-service` to your `tsconfig.json` types:

```json
{
  "compilerOptions": {
    "types": ["node", "@wdio/globals/types", "@wdio/visual-service"]
  }
}
```

Add a triple-slash reference at the top of spec files that use visual matchers:

```typescript
/// <reference types="@wdio/visual-service" />
```

---

## Save Methods

Save methods capture a screenshot and write it to disk without performing any comparison. Use them to create or update baselines.

```typescript
// Save viewport (what's currently visible)
await browser.saveScreen('home-initial')

// Save a specific element only
const sidebar = await $('#sidebar')
await browser.saveElement(sidebar, 'sidebar-closed')

// Save the full page by scrolling and stitching
await browser.saveFullPageScreen('home-full-page')

// Highlight all tabbable elements and save (for accessibility review)
await browser.saveTabbablePage('home-tabbable')
```

Saved files land in `{screenshotPath}/baseline/` when used as baseline captures, or in `{screenshotPath}/actual/` during regular test runs.

---

## Check Methods

Check methods compare a new screenshot against the stored baseline and return a mismatch percentage.

```typescript
// Returns number (mismatch percentage, 0–100)
const mismatch = await browser.checkScreen('home-initial')
expect(mismatch).toBeLessThanOrEqual(2)  // allow up to 2% mismatch

// Element comparison
const sidebar = await $('#sidebar')
const mismatch = await browser.checkElement(sidebar, 'sidebar-closed')

// Full page comparison
const mismatch = await browser.checkFullPageScreen('home-full-page')
```

| Method | Description |
|--------|-------------|
| `checkScreen(tag, options?)` | Compare viewport screenshot against baseline |
| `checkElement(el, tag, options?)` | Compare element screenshot against baseline |
| `checkFullPageScreen(tag, options?)` | Compare full scrolled-page screenshot against baseline |

The returned value is a plain number (`misMatchPercentage`) unless `returnAllCompareData: true` is set, in which case it returns a full result object (see below).

---

## Assert Matchers (throws on mismatch)

The visual service also integrates with `expect-webdriverio` for assertion-style usage. These throw immediately on mismatch rather than returning a percentage.

```typescript
/// <reference types="@wdio/visual-service" />

await expect(browser).toMatchScreenSnapshot('home-initial')
await expect(sidebar).toMatchElementSnapshot('sidebar-closed')
await expect(browser).toMatchFullPageSnapshot('home-full-page')
```

Pass method-level options as the second argument:

```typescript
await expect(browser).toMatchScreenSnapshot('home-initial', {
  hideElements: [await $('#live-clock')],
})
```

---

## Baseline Management Flow

```
First run (no baseline exists):
  autoSaveBaseline: true
    → Screenshot taken
    → Saved as baseline image
    → Test passes (no comparison performed)

Subsequent runs:
  checkScreen('tag')
    → Screenshot taken
    → Compared pixel-by-pixel against baseline
    → Returns misMatchPercentage
    → Test fails if percentage exceeds your threshold

After an intentional UI change:
  Option A: Run save methods locally, commit updated baselines to git
  Option B: Run the project update script (e.g. npm run e2e:screenshots:update)
  Option C: Set updateBaseline: true in service config for one run, then revert
```

---

## Result Object (with returnAllCompareData: true)

When `returnAllCompareData: true` is set (service-level or per-call), check methods return a full object instead of a plain number:

```typescript
const result = await browser.checkScreen('home-initial', {
  returnAllCompareData: true,
})

// result shape:
{
  misMatchPercentage: number,          // 0–100
  isWithinMisMatchTolerance: boolean,  // true if below configured threshold
  isSameDimensions: boolean,           // false = baseline and actual have different sizes
  analysisTime: number,                // ms taken for comparison
}
```

---

## Directory Structure

```
e2e/screenshots/
├── baseline/           ← committed to git; the expected images
│   ├── home-initial.png
│   └── sidebar-closed.png
├── actual/             ← gitignored; what the test captured this run
│   ├── home-initial.png
│   └── sidebar-closed.png
└── diff/               ← gitignored; pixel diff (red = changed pixels)
    ├── home-initial.png
    └── sidebar-closed.png
```

Add to `.gitignore`:

```
e2e/screenshots/actual/
e2e/screenshots/diff/
```

---

## Complete Example Spec

```typescript
/// <reference types="@wdio/visual-service" />

describe('Home page visual regression', () => {
  before(async () => {
    await browser.url('/')
    // Wait for app to fully render before taking screenshots
    await $('[data-testid="app-loaded"]').waitForDisplayed({ timeout: 10000 })
  })

  it('matches the home initial state', async () => {
    const mismatch = await browser.checkScreen('home-initial')
    expect(mismatch).toBeLessThanOrEqual(2)
  })

  it('matches the sidebar in closed state', async () => {
    const sidebar = await $('#sidebar')
    const mismatch = await browser.checkElement(sidebar, 'sidebar-closed')
    expect(mismatch).toBeLessThanOrEqual(2)
  })

  it('matches home page with live content masked', async () => {
    const mismatch = await browser.checkScreen('home-masked', {
      hideElements: [await $('#live-clock'), await $('.usage-stats')],
    })
    expect(mismatch).toBeLessThanOrEqual(2)
  })
})
```

---

## Important Considerations

### Same platform requirement
Baselines captured on macOS will fail when compared against screenshots from Linux CI due to font rendering and anti-aliasing differences. Capture baselines on the same OS used in CI, or use `ignoreAntialiasing: true` to reduce false positives.

### No headless mode
The visual service requires real GPU rendering. It does not work with headless Electron or headless Chrome — the app must run with a real display (or virtual framebuffer like Xvfb on Linux).

### Dynamic content
Mask regions with live data (timestamps, counters, avatars loaded from network) using `hideElements`, `removeElements`, or `blockOut` to prevent flaky test failures. See `visual-service-options.md` for the full masking API.

### formatImageName and tag names
The `{tag}` token in `formatImageName` maps directly to the string you pass to `checkScreen(tag)`. The baseline file is stored as `{baselineFolder}/{tag}.png`. Keep tag names lowercase, hyphenated, and descriptive.

### Threshold strategy
A `misMatchPercentage` of 0 is brittle — sub-pixel rendering differences will cause failures. A threshold of 1–3% is typical for stable tests. Increase to 5% if you have anti-aliasing or font rendering variance across machines.
