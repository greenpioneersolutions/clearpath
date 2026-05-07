# Visual Testing

Playwright has built-in pixel-diff snapshot testing via `expect(page).toHaveScreenshot()`. Replaces `@wdio/visual-service`.

## Quick start

```ts
import { test, expect } from './fixtures';

test('home initial render', async ({ page }) => {
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveScreenshot('home--initial.png');
});
```

First run writes a baseline. Subsequent runs diff against it.

## Update baselines

```bash
# Update only missing baselines
npx playwright test

# Update changed baselines (keeps existing matches)
npx playwright test --update-snapshots
# or short form
npx playwright test -u

# Force update everything
npx playwright test --update-snapshots=all
```

CI tip: include `[update-screenshots]` in commit messages and gate the update step on it (see [examples/ci-github-actions.md](../examples/ci-github-actions.md)).

## Where snapshots live

Default: `<spec-file-name>.ts-snapshots/<assertion-arg>-<project>-<platform>.png`. Example: `e2e/home.spec.ts-snapshots/home--initial-electron-darwin.png`.

Configure globally:

```ts
// playwright.config.ts
expect: {
  toHaveScreenshot: {
    pathTemplate: 'e2e/screenshots/baseline/{arg}{ext}',
  },
},
snapshotPathTemplate: '{testFileDir}/screenshots/{arg}-{platform}{ext}',
```

Template tokens:
- `{testDir}` — config `testDir` (e.g. `e2e`)
- `{testFileDir}` — directory of the spec file
- `{testFileName}` — `home.spec.ts`
- `{testFilePath}` — full path
- `{testName}` — test title
- `{arg}` — the name passed to `toHaveScreenshot('foo.png')` (without extension)
- `{ext}` — `.png`
- `{projectName}` — current project (`'electron'`)
- `{platform}` — `'darwin'`/`'linux'`/`'win32'`

## Matching against an element

```ts
await expect(page.getByTestId('agent-card')).toHaveScreenshot('agent-card.png');
```

## Options

```ts
await expect(page).toHaveScreenshot('home.png', {
  // Difference tolerance
  maxDiffPixels: 100,        // absolute pixel count
  maxDiffPixelRatio: 0.02,   // 0..1 (2% of total pixels)
  threshold: 0.2,            // YIQ color diff per pixel (0..1, default 0.2)

  // Stability
  animations: 'disabled',    // pause CSS anim/transitions during capture
  caret: 'hide',             // hide blinking text caret

  // Mask dynamic regions (rendered as solid rectangles in both baseline + actual)
  mask: [
    page.getByTestId('time-now'),
    page.locator('[data-screenshot-stub]'),
  ],
  maskColor: '#ff00ff',      // default

  // Capture configuration
  fullPage: false,
  clip: { x: 0, y: 0, width: 1280, height: 800 },
  omitBackground: false,
  scale: 'css',              // 'css' = device-independent CSS pixels; 'device' = device pixels
  style: '/* inline css applied during capture */',
  stylePath: 'e2e/screenshot.css',

  timeout: 10_000,           // expect timeout
});
```

### Threshold vs maxDiff*

- `threshold` is **per-pixel** color tolerance (YIQ). Loosening this means small color differences are ignored on every pixel.
- `maxDiffPixels` / `maxDiffPixelRatio` are **whole-image** tolerance. Use these for "anti-alias jitter on a few hundred pixels is OK".

For desktop apps with subpixel-AA differences across hosts, `maxDiffPixelRatio: 0.02` is a sensible default.

## Hiding dynamic content

### Mask (rectangle overlay)
```ts
await expect(page).toHaveScreenshot({
  mask: [page.getByTestId('time-now'), page.locator('.live-counter')],
});
```

### `data-screenshot-stub` pattern (preserves layout)
The existing project freezes dynamic content via a DOM walk that replaces text matching common patterns (`Good morning`, `5m ago`, `2026-04-26`, etc.) and overrides any element with `[data-screenshot-stub="..."]`. The whole helper is reusable verbatim under Playwright:

```ts
async function freezeDynamicContent(page: Page) {
  await page.evaluate(() => {
    function replaceDynamic(text: string): string {
      let next = text;
      next = next.replace(/Good (morning|afternoon|evening)/g, 'Good day');
      next = next.replace(/\b(just now|moments? ago|yesterday)\b/gi, '5 minutes ago');
      next = next.replace(/\b\d+\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|y)\s+ago\b/gi, '5 minutes ago');
      next = next.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}(,\s+\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM))?/g, 'Apr 26, 2026, 2:45 PM');
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

// usage
await freezeDynamicContent(page);
await expect(page).toHaveScreenshot('home.png');
```

## Cross-platform pinning

Snapshots are platform-specific by default (the platform suffix in the filename). For a desktop Electron app, **commit one platform's baselines** (matching CI) and let local dev compare against those. To pin DPR and avoid Retina-vs-1x drift, pass `--force-device-scale-factor=1` to `electron.launch()`:

```ts
args: [APP_ENTRY, '--no-sandbox', '--force-device-scale-factor=1'],
```

And pin window size in a fixture:

```ts
beforeEach: async ({ electronApp }) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    win?.setContentSize(1280, 800);
  });
}
```

If you only want platform-suffixed baselines on CI:
```ts
expect: {
  toHaveScreenshot: {
    pathTemplate: process.env.CI
      ? 'e2e/screenshots/baseline/{arg}-{platform}{ext}'
      : 'e2e/screenshots/baseline/{arg}{ext}',
  },
}
```

## `page.screenshot()` (manual capture, no diff)

For ad-hoc debug captures or saving an artifact:

```ts
await page.screenshot({ path: 'debug.png' });
await page.screenshot({ path: 'card.png', fullPage: true });
const buf = await page.screenshot({ animations: 'disabled' });
testInfo.attach('debug', { body: buf, contentType: 'image/png' });
```

Common options: `path`, `fullPage`, `clip`, `type` (`'png'|'jpeg'`), `quality`, `omitBackground`, `animations`, `caret`, `mask`, `maskColor`, `scale`, `style`, `timeout`.

## Element vs page screenshots

```ts
// Page (the whole window)
await expect(page).toHaveScreenshot('home.png');

// Specific element
await expect(page.getByTestId('agent-card')).toHaveScreenshot('agent-card.png');

// Region with clip
await expect(page).toHaveScreenshot('header.png', {
  clip: { x: 0, y: 0, width: 1280, height: 80 },
});
```

## Non-image snapshots

For text/json/html, use `toMatchSnapshot`:
```ts
expect(JSON.stringify(state, null, 2)).toMatchSnapshot('app-state.json');
```

## Aria snapshots

Capture and compare the accessibility tree (more resilient than pixel diff for accessibility-focused checks):

```ts
await expect(page.getByRole('navigation')).toMatchAriaSnapshot(`
- navigation:
  - link "Home"
  - link "Sessions"
  - link "Notes"
  - link "Insights"
  - link "Settings"
`);
```

## Failure artifacts

When `toHaveScreenshot` fails, Playwright writes:
- `<test>.spec.ts-snapshots/<arg>-<project>-<platform>-actual.png` (the real capture)
- `<test>.spec.ts-snapshots/<arg>-<project>-<platform>-expected.png` (the baseline)
- `<test>.spec.ts-snapshots/<arg>-<project>-<platform>-diff.png` (red highlights)

These are visible in the HTML report and trace viewer. The HTML report has a slider to compare baseline/actual pixel-by-pixel.

## Workflow

1. **Author a new visual test** — run once locally; baseline is auto-saved.
2. **Commit the baseline** to git (use Git LFS for large suites — see [ci-cd.md](ci-cd.md)).
3. **CI compares** every PR against the baseline; failures upload artifacts.
4. **Intentional UI change** — run `npx playwright test -u`, review diffs, commit updated baselines.
5. **Investigate failure** — open the HTML report (`npx playwright show-report`) and use the slider, or open the trace (`npx playwright show-trace`) to see the full timeline.

## See also
- [visual-options.md](visual-options.md) — every option for `toHaveScreenshot` and `page.screenshot`
- [examples/visual-screenshot-test.md](../examples/visual-screenshot-test.md) — data-driven crawl spec
