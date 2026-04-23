# Visual Reporter — Viewing Screenshot Diffs

`@wdio/visual-reporter` is a standalone CLI tool that renders visual test results in a browser UI, showing baseline, actual, and diff images side-by-side for any failed or changed comparison.

---

## Prerequisites

The visual service must be configured with `createJsonReportFiles: true`. Without this, no report data is written and the reporter has nothing to render.

```typescript
// wdio.conf.ts
services: [
  ['visual', {
    createJsonReportFiles: true,  // ← required
    baselineFolder: './e2e/screenshots/baseline',
    screenshotPath: './e2e/screenshots',
    // ... other options
  }]
]
```

---

## Installation

```bash
npm install --save-dev @wdio/visual-reporter

# Optional: local HTTP server to serve the generated report
npm install --save-dev sirv-cli
```

---

## Generate Report

After running your visual tests, the JSON report data lands in `{screenshotPath}/report/`. Run the reporter CLI to compile it into a browsable HTML report:

```bash
npx wdio-visual-reporter \
  --jsonOutput=./e2e/screenshots/report \
  --reportFolder=./e2e/screenshots/visual-report
```

Or use the interactive CLI (prompts for paths):

```bash
npx @wdio/visual-reporter
```

### Options

| Flag | Description |
|------|-------------|
| `--jsonOutput` | Path to the JSON report directory written by `@wdio/visual-service` |
| `--reportFolder` | Output directory for the generated HTML report |

---

## Serve Report

```bash
npx sirv-cli ./e2e/screenshots/visual-report --single
# → Serving at http://localhost:5000
```

Open `http://localhost:5000` in your browser. The `--single` flag enables SPA routing so deep links work.

Alternatively, open `./e2e/screenshots/visual-report/index.html` directly in a browser — this works without a server for simple local review.

---

## What the Reporter Shows

The reporter UI is organized as:

- **Left panel — test navigation tree**: All visual tests grouped by suite. Failed or mismatched tests are highlighted.
- **Top bar — test metadata**: Browser name, viewport dimensions, mismatch percentage, and pass/fail result for the selected test.
- **Main area — three-panel image view**:
  - **Baseline** — the committed reference image (what the UI should look like)
  - **Actual** — the screenshot captured during this test run
  - **Diff** — pixel-level diff image; changed pixels appear in red

Click any image panel to zoom in for detailed inspection.

---

## CI Integration

Upload the visual report as a build artifact so it's downloadable from failed CI runs without needing to re-run tests locally.

### GitHub Actions

```yaml
jobs:
  e2e:
    steps:
      - name: Run visual tests
        run: npm run e2e:screenshots

      - name: Generate visual report
        if: always()  # run even if tests failed
        run: |
          npx wdio-visual-reporter \
            --jsonOutput=./e2e/screenshots/report \
            --reportFolder=./e2e/screenshots/visual-report

      - name: Upload visual report
        if: failure()  # only upload when tests fail
        uses: actions/upload-artifact@v4
        with:
          name: visual-report-${{ github.run_number }}
          path: e2e/screenshots/visual-report/
          retention-days: 14
```

Download the artifact from the GitHub Actions run summary, extract it, and open `index.html` to review what changed.

---

## When to Use

- **Test fails in CI**: Download the artifact, open the reporter, and see exactly which pixels changed without re-running tests.
- **Reviewing baseline update PRs**: Before merging a PR that updates baselines, open the reporter to verify every visual change is intentional and expected.
- **Investigating flaky tests**: If a test intermittently fails, review several runs' diff images to spot the pattern (animation not fully settled, font load timing, etc.).
- **Cross-platform debugging**: When screenshots pass on macOS but fail on Linux, compare the actual images from both runs to identify rendering differences.

---

## Alternative: Direct Image Inspection

If you don't want to set up the reporter, you can inspect diffs directly from the filesystem. The visual service writes three directories:

```
e2e/screenshots/
├── baseline/           ← committed to git; expected images
│   ├── home-initial.png
│   └── sidebar-closed.png
├── actual/             ← gitignored; captured this run
│   ├── home-initial.png
│   └── sidebar-closed.png
└── diff/               ← gitignored; pixel diff images
    ├── home-initial.png
    └── sidebar-closed.png
```

For any failing test:
1. Open `diff/{tag}.png` — red pixels show exactly what changed.
2. Open `baseline/{tag}.png` alongside `actual/{tag}.png` in an image viewer with side-by-side mode.

This is faster for quick one-off diagnosis but harder to use for reviewing many failures at once.

---

## Recommended npm Scripts

Add these to `package.json` for a smooth workflow:

```json
{
  "scripts": {
    "e2e:screenshots": "wdio run e2e/wdio.screenshots.conf.ts",
    "e2e:screenshots:update": "WDIO_VISUAL_UPDATE_BASELINE=true wdio run e2e/wdio.screenshots.conf.ts",
    "e2e:visual-report": "wdio-visual-reporter --jsonOutput=./e2e/screenshots/report --reportFolder=./e2e/screenshots/visual-report",
    "e2e:visual-report:serve": "sirv-cli ./e2e/screenshots/visual-report --single"
  }
}
```

Usage:
```bash
# Run visual tests
npm run e2e:screenshots

# If tests fail, generate and view the report
npm run e2e:visual-report
npm run e2e:visual-report:serve

# Update all baselines after intentional UI change
npm run e2e:screenshots:update
```
