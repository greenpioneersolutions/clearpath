# CI/CD — Running Electron e2e in GitHub Actions

## Linux CI Requirements

Electron requires a display server on Linux (CI runs headless by default). Install Xvfb and Electron's native library dependencies:

```yaml
- name: Install display dependencies
  run: |
    sudo apt-get update -q
    sudo apt-get install -y --no-install-recommends \
      xvfb libgbm-dev libasound2-dev

- name: Start virtual display
  run: |
    Xvfb :99 -screen 0 1280x800x24 &
    echo "DISPLAY=:99" >> $GITHUB_ENV
    sleep 2
```

`libgbm-dev` is required by Chromium (the renderer inside Electron). `libasound2-dev` provides audio device stubs that Electron expects at startup even if no audio is used.

---

## Required Chrome Flags for CI

Add to the Electron capabilities in `wdio.conf.ts`. The Chromium sandbox is unavailable in most CI environments (no user namespace support):

```typescript
capabilities: [{
  'browserName': 'electron',
  'wdio:electronServiceOptions': {
    appBinaryPath: './out/ClearPathAI-linux-x64/ClearPathAI',
  },
  'goog:chromeOptions': {
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  },
}],
```

Without `--no-sandbox`, Electron exits immediately with a "Chrome failed to start" error on Ubuntu. Without `--disable-dev-shm-usage`, Chromium may crash on low-memory runners (the default `/dev/shm` is 64 MB, too small for Chromium).

---

## ELECTRON_RUN_AS_NODE

VS Code sets `ELECTRON_RUN_AS_NODE=1` in its integrated terminal, which causes Electron to run as a plain Node.js process instead of an Electron app — breaking e2e tests entirely.

This is already handled at the top of `wdio.conf.ts` and `wdio.screenshots.conf.ts`:

```typescript
// Top of wdio.conf.ts — must be before any imports that trigger Electron
delete process.env.ELECTRON_RUN_AS_NODE
```

No CI-specific action needed — this runs automatically when WDIO loads the config.

---

## Full CI Workflow

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true  # Required for screenshot baselines stored in Git LFS

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install display dependencies
        run: |
          sudo apt-get update -q
          sudo apt-get install -y --no-install-recommends \
            xvfb libgbm-dev libasound2-dev

      - name: Start virtual display
        run: |
          Xvfb :99 -screen 0 1280x800x24 &
          echo "DISPLAY=:99" >> $GITHUB_ENV
          sleep 2

      - name: Build app
        run: npm run build

      - name: Run e2e tests
        run: npm run e2e

      - name: Upload failure screenshots
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-failure-screenshots
          path: e2e/screenshots/failures/
          if-no-files-found: ignore
```

---

## Visual Regression CI Workflow

Run screenshot regression as a separate job to keep it isolated from functional tests:

```yaml
  screenshot-regression:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install display dependencies
        run: |
          sudo apt-get update -q
          sudo apt-get install -y --no-install-recommends \
            xvfb libgbm-dev libasound2-dev

      - name: Start virtual display
        run: |
          Xvfb :99 -screen 0 1280x800x24 &
          echo "DISPLAY=:99" >> $GITHUB_ENV
          sleep 2

      - name: Build app
        run: npm run build

      - name: Run screenshot crawl
        run: npm run e2e:screenshots

      - name: Upload actual screenshots
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: screenshots-actual
          path: e2e/screenshots/actual/
          if-no-files-found: ignore

  update-screenshots:
    runs-on: ubuntu-latest
    if: contains(github.event.head_commit.message, '[update-screenshots]')

    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install display dependencies
        run: |
          sudo apt-get update -q
          sudo apt-get install -y --no-install-recommends \
            xvfb libgbm-dev libasound2-dev

      - name: Start virtual display
        run: |
          Xvfb :99 -screen 0 1280x800x24 &
          echo "DISPLAY=:99" >> $GITHUB_ENV
          sleep 2

      - name: Build app
        run: npm run build

      - name: Update baselines
        run: npm run e2e:screenshots:update

      - name: Commit updated baselines
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add e2e/screenshots/baseline/
          git diff --staged --quiet || git commit -m "chore: update screenshot baselines [skip ci]"
          git push
```

---

## Git LFS for Screenshots

Baseline screenshots are binary PNG files that balloon repository size if tracked normally. Store them with Git LFS:

```bash
# .gitattributes
e2e/screenshots/baseline/**/*.png filter=lfs diff=lfs merge=lfs -text
```

Ensure LFS is initialized on the runner:

```yaml
- uses: actions/checkout@v4
  with:
    lfs: true
```

Without `lfs: true`, the checkout step downloads LFS pointer files rather than the actual PNGs, causing every visual comparison to fail with a "baseline not found" error.

---

## specFileRetries for CI Flakiness

Electron app startup can be slower in CI than locally. A spec that passes locally may time out on the first CI run and succeed on retry:

```typescript
// wdio.conf.ts
specFileRetries: 2,
specFileRetriesDelay: 1,
specFileRetriesDeferred: false,
```

For a CI-specific override without modifying the base config, use `deepmerge-ts`:

```typescript
// wdio.ci.conf.ts
import { config as baseConfig } from './wdio.conf.js'
import { deepmerge } from 'deepmerge-ts'

export const config = deepmerge(baseConfig, {
  specFileRetries: 2,
  specFileRetriesDelay: 1,
})
```

```bash
# In CI:
npx wdio run wdio.ci.conf.ts
```

---

## Debugging CI Failures

1. **Download the `e2e-failure-screenshots` artifact** — PNG screenshots captured at the point of failure show exactly what the app displayed

2. **Add verbose driver logging** — set `WDIO_LOG_LEVEL=debug` as an env var on the CI step:
   ```yaml
   - name: Run e2e tests
     run: npm run e2e
     env:
       WDIO_LOG_LEVEL: debug
   ```

3. **Capture browser console logs** in `afterEach` to surface renderer errors:
   ```typescript
   afterEach(async () => {
     const logs = await browser.getLogs('browser')
     const errors = logs.filter(l => l.level === 'SEVERE')
     if (errors.length) console.error('Browser errors:', errors)
   })
   ```

4. **Verify the build artifact exists** before the e2e step. A missing `out/main/index.js` means the build step failed silently:
   ```yaml
   - name: Verify build
     run: test -f out/main/index.js || (echo "Build output missing" && exit 1)
   ```

5. **Verify Xvfb started** — if `DISPLAY` is not set, Electron exits immediately:
   ```yaml
   - name: Verify display
     run: echo "DISPLAY=$DISPLAY" && xdpyinfo -display $DISPLAY > /dev/null
   ```

6. **Check Electron crash logs** — on Linux these land in `~/.config/ClearPathAI/logs/`. Upload them as an artifact if the app crashes before WDIO connects:
   ```yaml
   - name: Upload Electron logs
     if: failure()
     uses: actions/upload-artifact@v4
     with:
       name: electron-logs
       path: ~/.config/ClearPathAI/logs/
       if-no-files-found: ignore
   ```

---

## macOS CI Notes

macOS runners do not need Xvfb. Electron runs natively. However:

- Use `macos-latest` or pin to a specific macOS version for consistent rendering in screenshot tests
- Code signing is not required for e2e (WDIO launches the unpackaged app)
- `libasound2-dev` and `libgbm-dev` are Linux-only — do not include them in macOS workflow steps
