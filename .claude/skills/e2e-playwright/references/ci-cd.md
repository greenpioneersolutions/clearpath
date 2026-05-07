# CI/CD

Running Playwright + Electron in GitHub Actions, including Linux Xvfb setup, sharding, blob+merge reports, and visual regression.

## Linux dependencies

Electron on Linux needs the same X libs Chromium does, plus `xvfb` for headed-style automation. Use Playwright's installer:

```bash
# Installs Chromium browser binary AND OS deps
npx playwright install --with-deps chromium

# Or just OS deps (no browser binary — recommended for Electron-only suites)
npx playwright install-deps chromium
```

## Minimal GitHub Actions workflow

```yaml
# .github/workflows/playwright.yml
name: Playwright E2E
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  e2e:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          lfs: true              # required for visual baselines stored in Git LFS
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - run: npx playwright install-deps chromium
      - run: npm run build
      - run: xvfb-run npx playwright test
        env:
          CI: 'true'
      - uses: actions/upload-artifact@v5
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

> Use `xvfb-run` to provide a virtual X server so the Electron window can launch headed-style on a headless runner. Headless Electron is possible (`--headless`) but often differs visually from headed.

## Why `xvfb-run` instead of `headless: true`

- Electron renders correctly headed; some apps misbehave when truly headless
- Visual baselines should match what users see — same rendering pipeline
- `xvfb-run` is a one-line wrapper, no app code changes

## Container variant (no Xvfb needed)

```yaml
container:
  image: mcr.microsoft.com/playwright:v1.59.1-noble
  options: --user 1001
```

The official Playwright image has Xvfb pre-set up. You can run `npx playwright test` directly without `xvfb-run`. Pin the image version to your installed `@playwright/test` version.

## Sharding

Split a long suite across N parallel jobs:

```yaml
jobs:
  e2e:
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - run: npx playwright install-deps chromium
      - run: npm run build
      - run: xvfb-run npx playwright test --shard=${{ matrix.shard }}/4 --reporter=blob
      - uses: actions/upload-artifact@v5
        if: ${{ !cancelled() }}
        with:
          name: blob-${{ matrix.shard }}
          path: blob-report/
          retention-days: 1

  merge:
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    needs: e2e
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - uses: actions/download-artifact@v5
        with: { path: all-blob-reports, pattern: blob-* }
      - run: npx playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v5
        with:
          name: playwright-report
          path: playwright-report/
```

## Visual regression workflow

```yaml
# .github/workflows/visual-regression.yml
name: Visual Regression
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  screenshots:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          lfs: true              # baselines via Git LFS
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - run: npx playwright install-deps chromium
      - run: npm run build
      - name: Run visual crawl
        run: xvfb-run npx playwright test -c playwright.screenshots.config.ts
      - name: Upload diffs on failure
        if: failure()
        uses: actions/upload-artifact@v5
        with:
          name: visual-diffs
          path: |
            test-results/
            playwright-report/
          retention-days: 14
      - name: Upload baselines on intentional update
        if: ${{ contains(github.event.head_commit.message, '[update-screenshots]') }}
        uses: actions/upload-artifact@v5
        with:
          name: updated-baselines
          path: e2e/screenshots/baseline/
          retention-days: 30
```

For an "update baselines" workflow triggered on commit message:

```yaml
- name: Update baselines
  if: ${{ contains(github.event.head_commit.message, '[update-screenshots]') }}
  run: xvfb-run npx playwright test -c playwright.screenshots.config.ts -u
- name: Commit updated baselines
  if: ${{ contains(github.event.head_commit.message, '[update-screenshots]') }}
  run: |
    git config user.email "actions@github.com"
    git config user.name "github-actions"
    git add e2e/screenshots/baseline
    git commit -m "chore: update visual baselines [skip ci]" || echo "No changes"
    git push
```

## Caching

Don't cache Chromium binaries — Playwright versions them and stale caches cause hard-to-diagnose issues. Do cache `node_modules`:

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: '22'
    cache: 'npm'
```

## Recommended `use:` for CI

```ts
// playwright.config.ts
use: {
  trace: 'on-first-retry',           // capture only when needed
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
  actionTimeout: 10_000,
},
retries: process.env.CI ? 2 : 0,
workers: 1,                          // Electron — one window per worker
```

## Reporters for CI

```ts
reporter: process.env.CI
  ? [
      ['github'],                              // inline annotations on failures
      ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ['blob'],                                // for shard merging
    ]
  : [['list', { printSteps: true }], ['html', { open: 'on-failure' }]],
```

## Failing fast vs running through

```ts
// Fail fast — stop after first failure
maxFailures: process.env.CI ? 10 : undefined,

// Or stop instantly:
// npx playwright test -x
```

## `--only-changed` for PR feedback

Run only specs affected by changed files:
```yaml
- run: npx playwright test --only-changed=origin/${{ github.base_ref }}
  if: github.event_name == 'pull_request'
```

This is best-effort (graph analysis) — always follow with the full suite on `main` merges.

## Forbid `test.only`

```ts
forbidOnly: !!process.env.CI
```

CI fails immediately if any `test.only` slipped in.

## Linux fonts and rendering

On stock Ubuntu runners, the default font set may differ from your dev machine. To harden visual baselines:

1. Install consistent fonts:
   ```yaml
   - run: sudo apt-get install -y fonts-noto-color-emoji fonts-liberation
   ```
2. Pin DPR: `'--force-device-scale-factor=1'` in `electron.launch` args.
3. Use a separate baseline per platform (default behavior).

## Trace artifact retention

Traces are uploaded as part of `test-results/`. They include source code — be cautious about retention:

```yaml
retention-days: 7   # short for PR runs
retention-days: 30  # for main / scheduled
```

## Other CI providers

The official Docker image runs on:
- **Azure Pipelines** — same image, no Xvfb needed
- **CircleCI** — `mcr.microsoft.com/playwright:v1.59.1-noble`. Watch worker counts on the medium tier (2 cores).
- **GitLab CI** — `parallel: 4` + `--shard=$CI_NODE_INDEX/$CI_NODE_TOTAL` (CircleCI's `CI_NODE_INDEX` is 0-indexed, so `$((CI_NODE_INDEX+1))`)
- **Jenkins / Bitbucket / Drone** — use the image; `xvfb-run` only required if not using the image

## Common CI gotchas

| Symptom | Fix |
|---------|-----|
| `electron.launch` exits immediately | Add `--no-sandbox --disable-gpu --disable-dev-shm-usage` to args |
| Visual baselines never match | Pin DPR (`--force-device-scale-factor=1`); pin window size in `beforeEach`; use platform-suffixed templates |
| Test passes locally, fails in CI | Open the failed run's HTML report artifact; compare `-actual.png` vs `-expected.png` |
| LFS baselines don't restore | Add `lfs: true` to `actions/checkout@v5` |
| Trace files missing | `if: ${{ !cancelled() }}` on the upload step (default `if: success()` skips on failure) |
| Random "browser closed" failures | Add `retries: 2`; capture trace on retry to investigate |
| `xvfb-run` not found | Install: `sudo apt-get install -y xvfb` (or use the official image) |
