# Visual Options Reference

Full options for `toHaveScreenshot()` and `page.screenshot()`.

## `expect(page|locator).toHaveScreenshot(name?, options?)`

```ts
await expect(page).toHaveScreenshot('home.png', { /* options */ });
await expect(loc).toHaveScreenshot('card.png', { /* options */ });
```

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `animations` | `'disabled' \| 'allow'` | `'disabled'` | Pause CSS anim/transitions during capture. Recommended `'disabled'`. |
| `caret` | `'hide' \| 'initial'` | `'hide'` | Hide blinking text caret. |
| `clip` | `{x,y,width,height}` | — | Crop the capture (relative to viewport). |
| `fullPage` | boolean | `false` | Scroll-and-stitch full scrollable height. |
| `mask` | `Locator[]` | `[]` | Cover regions with a solid rectangle in both baseline + actual. |
| `maskColor` | string | `'#FF00FF'` | The color of mask rectangles. |
| `maxDiffPixels` | number | — | Max absolute pixel difference allowed. |
| `maxDiffPixelRatio` | `0..1` | — | Max ratio of differing pixels (e.g. `0.02` = 2%). |
| `omitBackground` | boolean | `false` | Transparent PNG. |
| `pathTemplate` | string | — | Override snapshot path for this assertion. |
| `scale` | `'css' \| 'device'` | `'css'` | `'css'`: device-independent CSS pixels. `'device'`: physical device pixels (Retina = 2×). |
| `style` | string | — | Inline CSS applied during capture (e.g. hide a banner). |
| `stylePath` | string \| string[] | — | Same, from file. |
| `threshold` | `0..1` | `0.2` | YIQ per-pixel color tolerance. Increase for AA jitter. |
| `timeout` | number | `expect.timeout` | Auto-retry budget (the assertion polls until the page settles). |

> If you set BOTH `maxDiffPixels` and `maxDiffPixelRatio`, both must be satisfied.

### Configuring globally

```ts
// playwright.config.ts
expect: {
  toHaveScreenshot: {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.02,
    threshold: 0.2,
    pathTemplate: 'e2e/screenshots/baseline/{arg}{ext}',
  },
},
```

### Tuning recipes

**Anti-alias jitter on a few hundred pixels**
```ts
{ maxDiffPixels: 500, threshold: 0.2 }
```

**Slight color drift across hosts**
```ts
{ maxDiffPixelRatio: 0.02, threshold: 0.3 }
```

**Strict — every pixel must match**
```ts
{ maxDiffPixels: 0, threshold: 0 }
```

**Layout-only check (ignore color completely)**
```ts
{ threshold: 1 }   // any color difference is OK; checks only structure
```

## `page.screenshot(options?)` / `locator.screenshot(options?)`

For ad-hoc captures (debugging, attaching to test info, building custom diff). No baseline comparison.

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `path` | string | — | Save to file. Format inferred from extension (`.png`/`.jpeg`). |
| `type` | `'png' \| 'jpeg'` | `'png'` | When `path` is omitted. |
| `quality` | `0..100` | — | JPEG only. |
| `fullPage` | boolean | `false` | Scroll-and-stitch. Page only — locator screenshots ignore. |
| `clip` | `{x,y,width,height}` | — | |
| `omitBackground` | boolean | `false` | Transparent PNG. |
| `animations` | `'disabled' \| 'allow'` | `'allow'` (page) / N/A (locator) | |
| `caret` | `'hide' \| 'initial'` | `'hide'` (locator) / `'initial'` (page) | |
| `mask` | `Locator[]` | `[]` | |
| `maskColor` | string | `'#FF00FF'` | |
| `scale` | `'css' \| 'device'` | `'device'` | Note: different default from `toHaveScreenshot`. |
| `style` | string | — | |
| `timeout` | number | `actionTimeout` | |

```ts
// Save to file
await page.screenshot({ path: 'home.png', fullPage: true });

// Buffer (e.g. attach to report)
const buf = await page.screenshot({ animations: 'disabled' });
testInfo.attach('debug', { body: buf, contentType: 'image/png' });

// Element only
await page.getByTestId('agent-card').screenshot({ path: 'card.png' });
```

## Snapshot naming and project structure

The project name (project's `name`) is part of the snapshot filename. With a single `electron` project:

```
e2e/screenshots/baseline/
  home--initial-electron-darwin.png
  home--initial-electron-linux.png
  sessions--list-electron-darwin.png
```

If you want a single platform-agnostic file (because you only run visual tests in CI where the OS is fixed), drop the platform from the template:

```ts
expect: {
  toHaveScreenshot: {
    pathTemplate: 'e2e/screenshots/baseline/{arg}{ext}',
  },
}
```

## Git LFS for baselines

Visual baselines are binary — they bloat git history. Use Git LFS for the snapshot folder:

```bash
git lfs install
git lfs track 'e2e/screenshots/**/*.png'
git add .gitattributes
git add e2e/screenshots/
git commit
```

CI must check out LFS files:
```yaml
- uses: actions/checkout@v5
  with:
    lfs: true
```

## Failure artifacts

When `toHaveScreenshot` fails, Playwright writes three files next to the baseline:

| File | What it is |
|------|------------|
| `<name>-actual.png` | What the test actually captured |
| `<name>-expected.png` | The committed baseline |
| `<name>-diff.png` | Red highlights on differing pixels |

These are uploaded to the HTML report and visible in the trace viewer. The report has a slider/swipe view for visual comparison.

## Dynamic content strategies (in order of preference)

1. **`mask`** — covers a region in both images. Use for live timestamps, counters.
2. **`data-screenshot-stub` attribute** — set by the React component; the helper replaces text with a fixed placeholder. See [visual-testing.md](visual-testing.md). Preserves layout without an opaque rectangle.
3. **Style override during capture** — `style: '.live-clock { visibility: hidden }'` removes the element from view (changes layout though).
4. **CSS animations off** — handled by `animations: 'disabled'` (default for `toHaveScreenshot`).
5. **Threshold tuning** — last resort. A loose threshold can mask real regressions.

## Animations & transitions

`animations: 'disabled'` is the default for `toHaveScreenshot` and pauses ALL CSS animations and transitions at their final state. For Tailwind transitions on hover/focus this means the element is in its hover-end state.

If you need to verify a *particular* animation frame:
```ts
{ animations: 'allow', timeout: 0 }
```
But this is fragile — visual tests should validate end states, not intermediate frames.
