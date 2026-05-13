# Example: CI GitHub Actions

Complete GitHub Actions workflows for functional and visual regression Playwright runs.

## `.github/workflows/playwright.yml` — functional tests

```yaml
name: Playwright E2E
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          lfs: true                 # required for visual baselines (Git LFS)

      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - name: Install Playwright OS deps
        run: npx playwright install-deps chromium

      - name: Build app
        run: npm run build

      - name: Typecheck e2e
        run: npx tsc -p tsconfig.playwright.json --noEmit

      - name: Run Playwright
        run: xvfb-run npx playwright test
        env:
          CI: 'true'

      - name: Upload report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v5
        with:
          name: playwright-report-${{ github.run_attempt }}
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

> Use `xvfb-run` to provide a virtual X server so Electron can render. The Playwright Docker image bundles this; on stock Ubuntu it's installed via `playwright install-deps`.

## `.github/workflows/visual-regression.yml`

```yaml
name: Visual Regression
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  screenshots:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          lfs: true

      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci
      - run: npx playwright install-deps chromium
      - run: npm run build

      - name: Run visual crawl
        run: xvfb-run npx playwright test -c playwright.screenshots.config.ts
        env:
          CI: 'true'

      - name: Upload diffs on failure
        if: failure()
        uses: actions/upload-artifact@v5
        with:
          name: visual-diffs
          path: |
            test-results-visual/
            playwright-report/
          retention-days: 14

  update-baselines:
    if: ${{ github.event_name == 'push' && contains(github.event.head_commit.message, '[update-screenshots]') }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          lfs: true
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci
      - run: npx playwright install-deps chromium
      - run: npm run build

      - name: Update baselines
        run: xvfb-run npx playwright test -c playwright.screenshots.config.ts -u
        env: { CI: 'true' }

      - name: Commit updated baselines
        run: |
          git config user.email "actions@github.com"
          git config user.name "github-actions"
          git add e2e/screenshots/baseline
          git commit -m "chore: update visual baselines [skip ci]" || echo "No changes"
          git push
```

## Sharded workflow (for large suites)

```yaml
name: Playwright E2E (sharded)
on: pull_request

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v5
        with: { lfs: true }
      - uses: actions/setup-node@v6
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npx playwright install-deps chromium
      - run: npm run build
      - run: xvfb-run npx playwright test --shard=${{ matrix.shard }}/4 --reporter=blob
      - if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v5
        with:
          name: blob-${{ matrix.shard }}
          path: blob-report
          retention-days: 1

  merge-reports:
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with: { node-version: '22' }
      - run: npm ci
      - uses: actions/download-artifact@v5
        with:
          path: all-blob-reports
          pattern: blob-*
      - run: npx playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v5
        with:
          name: playwright-report-merged
          path: playwright-report
          retention-days: 7
```

## Container variant (no Xvfb needed)

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.59.1-noble
      options: --user 1001
    steps:
      - uses: actions/checkout@v5
        with: { lfs: true }
      - uses: actions/setup-node@v6
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - run: npx playwright test
        env: { CI: 'true' }
      - if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v5
        with:
          name: playwright-report
          path: playwright-report/
```

> Pin the image version to your installed `@playwright/test` version to avoid drift.

## `--only-changed` for fast PR feedback

Run only specs whose dependencies changed (best-effort graph analysis):

```yaml
- name: Run only changed tests
  if: github.event_name == 'pull_request'
  run: xvfb-run npx playwright test --only-changed=origin/${{ github.base_ref }}
- name: Run full suite (after the diff)
  if: github.event_name == 'pull_request'
  run: xvfb-run npx playwright test
```

This is best as a "fast first feedback, then full suite" pattern — don't rely on `--only-changed` alone for `main` builds.

## Required actions checklist

- [ ] `lfs: true` on `actions/checkout@v5` so visual baselines restore
- [ ] `npx playwright install-deps chromium` for OS deps (or use the official image)
- [ ] `npm run build` to produce `out/main/index.js`
- [ ] `xvfb-run` wrapper unless using container
- [ ] Upload `playwright-report/` AND `test-results/` artifacts on failure
- [ ] `if: ${{ !cancelled() }}` on artifact uploads (default `success()` skips on failure)
- [ ] `forbidOnly: !!process.env.CI` in playwright.config.ts to fail on stray `test.only`

## Reporters for CI

```ts
// playwright.config.ts
reporter: process.env.CI
  ? [
      ['github'],                                              // failure annotations
      ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ['blob'],                                                // for sharding/merge
    ]
  : [['list', { printSteps: true }], ['html', { open: 'on-failure' }]],
```

## Trace upload

Traces are part of `test-results/`:

```yaml
- if: ${{ !cancelled() }}
  uses: actions/upload-artifact@v5
  with:
    name: traces
    path: test-results/**/trace.zip
```

To open a trace from a CI run:
1. Download the artifact
2. Drag-and-drop the `.zip` into [trace.playwright.dev](https://trace.playwright.dev)
3. Or run `npx playwright show-trace <path-to-zip>` locally

## Caching

Cache `node_modules` via `setup-node` `cache: 'npm'`. **Do NOT cache Chromium binaries** — Playwright versions them tightly and stale caches cause hard-to-diagnose issues.

## Pinning the Node version

The project requires Node 22+ (for `@github/copilot`). Use `node-version: '22'` (or `lts/*` for the latest LTS).

## Other CI providers

The official Docker image works on:
- **Azure Pipelines** — same image, no Xvfb needed
- **CircleCI** — `mcr.microsoft.com/playwright:v1.59.1-noble`. Watch worker counts on the medium tier (2 cores).
- **GitLab CI** — `parallel: 4` + `--shard=$CI_NODE_INDEX/$CI_NODE_TOTAL` (CircleCI's `CI_NODE_INDEX` is 0-indexed, so `$((CI_NODE_INDEX+1))`)
- **Jenkins** / **Bitbucket** / **Drone** — use the image; `xvfb-run` only required if not using the image

## Common CI-only failures

| Symptom | Fix |
|---------|-----|
| `electron.launch` exits immediately | Add `--no-sandbox --disable-gpu --disable-dev-shm-usage` to args |
| Visual baselines never match | Pin DPR (`--force-device-scale-factor=1`); pin window size in `beforeEach`; use platform-suffixed snapshot template |
| LFS baselines don't restore | Add `lfs: true` to `actions/checkout` |
| Trace files missing | Use `if: ${{ !cancelled() }}` on the upload step |
| Random "browser closed" | Add `retries: 2`; capture trace on retry |
| `xvfb-run` not found | `sudo apt-get install -y xvfb` (or use the official image) |
| `npm ci` slow | Use `cache: 'npm'` on `setup-node` |
| Sharded merge fails | Make sure `blob-*` pattern matches what `--reporter=blob` produced |
| `forbidOnly` fails on PR | Remove the stray `test.only` or `describe.only` |

## Migration: parallel WDIO + Playwright

While migrating, run both side-by-side:

```yaml
jobs:
  wdio:
    name: WDIO (legacy)
    runs-on: ubuntu-latest
    steps: [/* existing WDIO steps */]
  playwright:
    name: Playwright (new)
    runs-on: ubuntu-latest
    steps: [/* new Playwright steps */]
```

Allow Playwright failures to be non-blocking by adding to PR rules `Required: WDIO only` until migration is complete. Once Playwright passes consistently for ~1 week, swap.
