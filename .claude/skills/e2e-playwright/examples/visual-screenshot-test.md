# Example: Visual Screenshot Test

A data-driven crawl spec using `expect(page).toHaveScreenshot()`, dynamic-content freezing, and per-page mask configuration. The production crawl lives at `e2e/screenshot-crawl.pw.spec.ts` and captures via `BrowserWindow.capturePage()` instead of `toHaveScreenshot` to bypass `fonts.ready` hangs — see the spec itself for the canonical pattern; this example illustrates a simpler shape.

## Spec skeleton

```ts
// e2e/screenshot-crawl.pw.spec.ts
import { test, expect } from './fixtures';
import {
  navigateSidebarTo,
  navigateToHash,
  navigateToConfigureTab,
  navigateToConnectTab,
} from './helpers/pw';
import { freezeDynamicContent } from './helpers/pw';

// Run serially — Electron + visual diffs need stable rendering.
test.describe.configure({ mode: 'serial' });

interface CrawlPage {
  /** Snapshot tag (used as filename `<tag>.png`) */
  tag: string;
  /** Sidebar label (or null if not a top-level nav) */
  sidebar?: string;
  /** Hash route, used when sidebar isn't applicable (Connect, etc.) */
  hash?: string;
  /** Optional: tab key to click after the page renders */
  tabKey?: string;
  /** Optional: testIDs/selectors to mask */
  maskSelectors?: string[];
  /** Optional: tag this page as optional (e.g. extension-contributed) */
  optional?: boolean;
}

const SIDEBAR_PAGES: CrawlPage[] = [
  { tag: 'home--initial',       sidebar: 'Home' },
  { tag: 'sessions--launchpad', sidebar: 'Sessions' },
  { tag: 'notes--empty',        sidebar: 'Notes' },
  { tag: 'insights--overview',  sidebar: 'Insights' },
  { tag: 'learn--landing',      sidebar: 'Learn' },
  { tag: 'connect--mcp',        hash: '/connect?tab=mcp' },
  { tag: 'connect--integrations', hash: '/connect?tab=integrations' },
  { tag: 'connect--plugins',    hash: '/connect?tab=plugins' },
  { tag: 'connect--extensions', hash: '/connect?tab=extensions' },
  { tag: 'configure--setup',    sidebar: 'Settings', tabKey: 'setup' },
  { tag: 'configure--accessibility', sidebar: 'Settings', tabKey: 'accessibility' },
  { tag: 'configure--settings', sidebar: 'Settings', tabKey: 'settings' },
  { tag: 'configure--tools',    sidebar: 'Settings', tabKey: 'tools' },
  { tag: 'configure--policies', sidebar: 'Settings', tabKey: 'policies' },
  { tag: 'configure--memory',   sidebar: 'Settings', tabKey: 'memory' },
  { tag: 'configure--agents',   sidebar: 'Settings', tabKey: 'agents' },
  { tag: 'configure--skills',   sidebar: 'Settings', tabKey: 'skills' },
  { tag: 'configure--workspaces', sidebar: 'Settings', tabKey: 'workspaces' },
  { tag: 'configure--scheduler', sidebar: 'Settings', tabKey: 'scheduler' },
  { tag: 'configure--branding', sidebar: 'Settings', tabKey: 'branding' },
];

test.describe('Screenshot crawl', () => {
  for (const page of SIDEBAR_PAGES) {
    test(`captures ${page.tag}`, async ({ page: pw, electronApp }) => {
      // Pin window size for stable visual baselines (also done in fixtures, but defensive)
      await electronApp.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        w?.setContentSize(1280, 800);
      });

      // Navigate
      if (page.sidebar) {
        await navigateSidebarTo(pw, page.sidebar);
      } else if (page.hash) {
        await navigateToHash(pw, '#' + page.hash);
      }

      if (page.tabKey) {
        await pw.locator(`#tab-${page.tabKey}`).click();
        await pw.waitForTimeout(300);
      }

      // Wait for the page to settle
      await waitForLoadingToSettle(pw);

      // Freeze dynamic content (timestamps, greetings, IDs)
      await freezeDynamicContent(pw);

      // Capture
      const masks = (page.maskSelectors ?? []).map((sel) => pw.locator(sel));
      await expect(pw).toHaveScreenshot(`${page.tag}.png`, {
        mask: [...masks, pw.locator('[data-screenshot-stub]')],
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});

// ── Helpers (could move to helpers/visual.ts) ────────────────────────────────

async function waitForLoadingToSettle(page: Page, timeout = 10_000): Promise<void> {
  // Wait for any loading spinners or skeletons to disappear
  await page
    .waitForFunction(
      () =>
        !document.querySelector(
          '[data-loading="true"], .animate-spin, [aria-busy="true"]',
        ),
      undefined,
      { timeout },
    )
    .catch(() => {/* best-effort */});
  // Small additional settle for Tailwind transition end states
  await page.waitForTimeout(200);
}
```

## Per-page mask configuration

Some pages have known-dynamic regions that can't be frozen via the text-replacement helper (e.g. random IDs, percentage badges). Mark them with `[data-screenshot-stub]` in the React component, OR pass selectors via the crawl page config:

```ts
{ tag: 'insights--overview', sidebar: 'Insights', maskSelectors: ['[data-testid="cost-chart"]', '[data-testid="recent-activity"]'] },
```

## Pinning device pixel ratio

The visual config passes `--force-device-scale-factor=1` to `electron.launch`. Combined with the `setContentSize(1280, 800)` in the test (defensive), this ensures CI Linux and macOS retina produce comparable baselines.

## Update workflow

```bash
# Run visual tests — first run auto-saves missing baselines
npm run pw:screenshots

# After an intentional UI change, re-record all baselines
npm run pw:screenshots:update
```

## Failure investigation

When a snapshot diff fires:

```bash
# Open the HTML report — has a slider view for baseline vs actual
npx playwright show-report
```

The report shows the failed test with three images side-by-side: expected, actual, diff. Drag the slider to compare pixel-by-pixel.

For deeper failure analysis (DOM state, console, network at the time of capture), open the trace:
```bash
npx playwright show-trace test-results-visual/.../trace.zip
```

## Optional pages (extension-contributed)

Some sidebar entries only appear when a corresponding extension is installed. Mark them `optional: true` and skip if missing:

```ts
{ tag: 'extensions--pr-scores', sidebar: 'PR Scores', optional: true },

// In the test body:
if (page.optional) {
  const link = pw.locator('aside').getByRole('link', { name: page.sidebar! });
  if ((await link.count()) === 0) {
    test.skip(true, `Optional page ${page.tag} not present`);
    return;
  }
}
```

## Dark theme variant

Add a separate config (`playwright.screenshots.dark.config.ts`) that sets `--force-dark-mode` and changes `pathTemplate` to a dark subfolder:

```ts
// playwright.screenshots.dark.config.ts
import { defineConfig } from '@playwright/test';
import baseVisual from './playwright.screenshots.config';

export default defineConfig({
  ...baseVisual,
  expect: {
    ...baseVisual.expect,
    toHaveScreenshot: {
      ...baseVisual.expect?.toHaveScreenshot,
      pathTemplate: 'e2e/screenshots/baseline-dark/{arg}{ext}',
    },
  },
  // Pass --force-dark-mode via fixture override or env-gated launch args
});
```

## Performance tips

- The crawl spec is one of the slowest tests in the suite. **Don't run it on every PR** — gate behind a label or run on `main` only.
- `mode: 'serial'` is required because each test mutates window state.
- For ~20 pages × 3-5s each, expect 2-5 min run time. Watch out for Tailwind transition effects that delay stability.

## What's different from WDIO `checkScreen`

| WDIO | Playwright |
|------|-----------|
| `await browser.checkScreen('home', { hideElements: ['.live-clock'] })` | `await expect(page).toHaveScreenshot('home.png', { mask: [page.locator('.live-clock')] })` |
| Returns numeric mismatch %, you check `<= threshold` manually | Built-in pass/fail via `maxDiffPixelRatio` / `maxDiffPixels` |
| Baselines in `e2e/screenshots/baseline/`, autoSaveBaseline in config | Same paths via `pathTemplate`; `--update-snapshots` to update |
| `blockOut: [{x,y,width,height}]` rectangles | `mask: [Locator]` — must use locators, not raw rectangles |
| Visual reporter as a separate package | Built-in HTML reporter with image slider |
