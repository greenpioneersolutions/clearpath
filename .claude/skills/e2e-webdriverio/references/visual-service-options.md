# Visual Service Options — @wdio/visual-service Configuration

Complete reference for all configuration options accepted by `@wdio/visual-service`. Options are split into two groups: **service-level** (set once in `wdio.conf.ts`) and **method-level** (passed per `checkScreen()` / `checkElement()` call).

---

## Service-Level Options

Configured in the `services` array of `wdio.conf.ts`:

```typescript
services: [
  ['visual', {
    /* options here */
  }]
]
```

### Path Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baselineFolder` | `string` | `./screenshots/baseline` | Where baseline images are stored. Commit this directory to git. |
| `screenshotPath` | `string` | `./screenshots` | Root directory for `actual/` and `diff/` subdirectories. Gitignore these. |
| `actualFolder` | `string` | `{screenshotPath}/actual` | Override path for actual (captured) screenshots. |
| `diffFolder` | `string` | `{screenshotPath}/diff` | Override path for diff images. |
| `clearRuntimeFolder` | `boolean` | `false` | Delete `actual/` and `diff/` folders at the start of each run. |

### Baseline Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoSaveBaseline` | `boolean` | `false` | If no baseline exists, save the current screenshot as the baseline and pass the test. |
| `updateBaseline` | `boolean` | `false` | Overwrite all baselines unconditionally on every run. Useful for a one-off update run; revert afterward. |
| `savePerInstance` | `boolean` | `false` | Append `{browserName}` to the image name so different browsers have separate baselines. |
| `formatImageName` | `string` | `{tag}` | Template for image filenames. Tokens: `{tag}`, `{browserName}`, `{width}`, `{height}`, `{dpr}`, `{logName}`, `{testName}` |

```typescript
// Example: include browser and viewport in filename
formatImageName: '{tag}-{browserName}-{width}x{height}'
// → 'home-initial-chrome-1280x800.png'
```

### Rendering Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `disableCSSAnimation` | `boolean` | `false` | Inject CSS to disable all transitions and animations before capturing. Strongly recommended. |
| `disableBlinkingCursor` | `boolean` | `false` | Suppress text cursor blinking in inputs and textareas. |
| `hideScrollBars` | `boolean` | `false` | Hide browser and OS scrollbars. Prevents cross-OS width differences. |
| `waitForFontsLoaded` | `boolean` | `true` | Wait for the `document.fonts.ready` promise before capturing. |
| `enableLayoutTesting` | `boolean` | `false` | Enable layout comparison mode (structure rather than pixel-perfect). |

### Full-Page Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userBasedFullPageScreenshot` | `boolean` | `false` | Use scroll-and-stitch method instead of native full-page capture. Slower but handles sticky headers and lazy-loaded content better. |
| `fullPageScrollTimeout` | `number` | `1500` | Milliseconds to wait between scroll steps when stitching full-page screenshots. Increase if lazy-loaded images appear blank. |

### Report Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `createJsonReportFiles` | `boolean` | `false` | Generate JSON report files consumed by `@wdio/visual-reporter`. Required to use the visual reporter UI. |
| `alwaysSaveActualImage` | `boolean` | `false` | Write the actual screenshot to disk even when the test passes. Useful for audit trails. |
| `returnAllCompareData` | `boolean` | `false` | Return full comparison metadata from `checkScreen()` instead of just `misMatchPercentage`. |

---

## Recommended Production Config

```typescript
services: [
  ['visual', {
    baselineFolder: './e2e/screenshots/baseline',
    screenshotPath: './e2e/screenshots',
    autoSaveBaseline: true,
    formatImageName: '{tag}',
    disableCSSAnimation: true,
    hideScrollBars: true,
    waitForFontsLoaded: true,
    createJsonReportFiles: false,  // set true to use visual reporter
    alwaysSaveActualImage: false,
    returnAllCompareData: false,
  }]
]
```

---

## Method-Level Options

Passed as the last argument to any `checkScreen()`, `checkElement()`, or `checkFullPageScreen()` call. These override or supplement service-level settings for a single screenshot.

### Masking Options

Use masking to hide dynamic or irrelevant content before comparison.

```typescript
await browser.checkScreen('tag', {
  // Hide elements — they appear as blank (background color) in the screenshot
  hideElements: [
    await $('#live-clock'),
    await $('.notification-badge'),
  ],

  // Remove elements from the DOM entirely before capture (restored afterward)
  removeElements: [
    await $('#cookie-consent-banner'),
  ],

  // Block out rectangular pixel regions (coordinates in CSS pixels from top-left corner)
  blockOut: [
    { x: 0,   y: 0,  width: 320, height: 60 },   // top navigation bar
    { x: 900, y: 50, width: 100, height: 100 },   // avatar / dynamic image
  ],
})
```

`blockOut` coordinates are in CSS pixels relative to the top-left corner of the screenshot area (viewport for `checkScreen`, element bounds for `checkElement`).

### Resize Option (checkElement only)

```typescript
const card = await $('.card')
await browser.checkElement(card, 'tag', {
  // Add padding around the element before capturing
  resizeDimensions: { top: 10, right: 10, bottom: 10, left: 10 },
})
```

### Compare Options

Control how the pixel-by-pixel comparison is performed:

```typescript
await browser.checkScreen('tag', {
  // Ignore alpha channel differences
  ignoreAlpha: true,

  // Ignore anti-aliasing differences — recommended when comparing across GPUs or OS
  ignoreAntialiasing: true,

  // Compare structure only, ignoring all color information
  ignoreColors: false,

  // Ignore less perceptible pixel differences (uses perceptual diff algorithm)
  ignoreLess: false,

  // Disable threshold for large images (set 0 to always compare every pixel)
  largeImageThreshold: 0,

  // Auto-scale images to same size before comparison (handles DPI differences)
  scaleImagesToSameSize: false,

  // Return full comparison metadata instead of just misMatchPercentage
  returnAllCompareData: true,

  // Only save diff image if mismatch exceeds this percentage (reduces noise)
  saveAboveTolerance: 10,
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ignoreAlpha` | `boolean` | `false` | Skip alpha channel in comparison |
| `ignoreAntialiasing` | `boolean` | `false` | Skip anti-aliased pixels |
| `ignoreColors` | `boolean` | `false` | Ignore all color; compare luminance only |
| `ignoreLess` | `boolean` | `false` | Ignore imperceptible pixel differences |
| `largeImageThreshold` | `number` | `0` | Width threshold above which pixels are skipped (0 = disabled) |
| `scaleImagesToSameSize` | `boolean` | `false` | Resize images to match before comparison |
| `returnAllCompareData` | `boolean` | `false` | Return full metadata object |
| `saveAboveTolerance` | `number` | `0` | Only write diff image if mismatch exceeds this % |

### Per-Method Folder Overrides

Override the baseline, actual, or diff directory for a single check:

```typescript
await browser.checkScreen('tag', {
  actualFolder: './custom/actual',
  baselineFolder: './custom/baseline',
  diffFolder: './custom/diff',
})
```

---

## Full Method-Level Example

Combining masking, comparison tuning, and metadata for a real-world noisy page:

```typescript
const result = await browser.checkScreen('dashboard', {
  // Mask dynamic regions
  hideElements: [
    await $('#session-timer'),
    await $('.cost-badge'),
  ],
  blockOut: [
    { x: 0, y: 0, width: 1280, height: 56 },  // top bar with live clock
  ],
  // Tolerate minor rendering differences
  ignoreAntialiasing: true,
  ignoreAlpha: true,
  // Get full comparison data for debugging
  returnAllCompareData: true,
})

// result is full object when returnAllCompareData: true
expect(result.misMatchPercentage).toBeLessThanOrEqual(2)
expect(result.isSameDimensions).toBe(true)
```

---

## Environment Variable Overrides

Some options can be overridden at runtime via environment variables, useful for CI baseline update runs:

```bash
# Force baseline update for this run
WDIO_VISUAL_UPDATE_BASELINE=true npm run e2e

# Auto-save baseline if none exists (alternative to config flag)
WDIO_VISUAL_AUTO_SAVE_BASELINE=true npm run e2e
```

Check the `@wdio/visual-service` changelog for the current list of supported env vars, as these may vary by version.
