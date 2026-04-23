# Example: Complete GitHub Actions CI Workflow

Two separate workflows handle the two types of e2e testing: functional tests (does the app work?) and visual regression (does the app look right?). They run on different triggers and have different failure strategies.

---

## 1. Functional E2E Workflow

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  e2e:
    name: Functional E2E
    runs-on: ubuntu-latest

    steps:
      - name: Checkout (with LFS)
        uses: actions/checkout@v4
        with:
          lfs: true          # Required — baselines are stored in Git LFS

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Xvfb and Electron system deps
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y --no-install-recommends \
            xvfb \
            libgbm-dev \
            libasound2-dev \
            libxshmfence-dev

      - name: Start virtual display
        run: |
          Xvfb :99 -screen 0 1280x800x24 &
          echo "DISPLAY=:99" >> $GITHUB_ENV

      - name: Build Electron app
        run: npm run build
        # Produces out/main/index.js — wdio-electron-service needs this

      - name: Run E2E tests
        run: npm run e2e
        env:
          DISPLAY: ':99'
          CI: 'true'

      - name: Upload failure screenshots
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-failure-screenshots
          path: e2e/screenshots/failures/
          if-no-files-found: ignore
          retention-days: 7
```

### Why each step is necessary

**`lfs: true`** — Without this, Git LFS objects (the baseline PNG files) are downloaded as pointer text files, not the actual images. The visual service then compares a ~130-byte pointer against a real screenshot and always fails.

**Xvfb packages** — Electron on Linux requires a display server. `xvfb` provides the virtual framebuffer. `libgbm-dev` and `libasound2-dev` are Electron runtime dependencies that are missing from the default `ubuntu-latest` image. Missing these causes the Electron process to exit immediately with a cryptic error.

**`Xvfb :99 -screen 0 1280x800x24 &`** — Starts the virtual display in the background. The `&` is important — without it the job hangs. `:99` is the display number; `1280x800x24` sets resolution and color depth.

**`npm run build` before tests** — `wdio-electron-service` launches your built app (`out/main/index.js`), not the source. If the build is stale, tests run against an old version of the app.

**`ELECTRON_RUN_AS_NODE`** — This is intentionally NOT set in CI env vars. The `wdio.conf.ts` file handles it with `delete process.env.ELECTRON_RUN_AS_NODE` at the top. VS Code sets this variable in its integrated terminal, which breaks Electron by making it behave like plain Node. Deleting it in the config file fixes both local (VS Code) and CI runs without any per-environment configuration.

**`--no-sandbox`** — Also handled in `wdio.conf.ts` capabilities, not CI env vars. Electron requires `--no-sandbox` on Linux in CI because the kernel sandbox (user namespaces) is restricted. Setting it in the capabilities object means it applies consistently everywhere.

---

## 2. Screenshot Regression Workflow

```yaml
# .github/workflows/screenshot-regression.yml
name: Screenshot Regression

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  workflow_dispatch:   # Manual trigger for baseline updates

jobs:
  screenshot-regression:
    name: Visual Regression
    runs-on: ubuntu-latest
    # Skip if commit message requests a baseline update — the update job handles it
    if: "!contains(github.event.head_commit.message, '[update-screenshots]')"

    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Install Xvfb and Electron deps
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y --no-install-recommends \
            xvfb libgbm-dev libasound2-dev libxshmfence-dev

      - name: Start virtual display
        run: |
          Xvfb :99 -screen 0 1280x800x24 &
          echo "DISPLAY=:99" >> $GITHUB_ENV

      - run: npm run build

      - name: Run screenshot tests
        run: npm run e2e:screenshots
        env:
          DISPLAY: ':99'
          CI: 'true'

      - name: Upload actual screenshots (always — for diff review)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-screenshots-actual
          path: e2e/screenshots/actual/
          if-no-files-found: ignore
          retention-days: 14

  update-screenshots:
    name: Update Screenshot Baselines
    runs-on: ubuntu-latest
    # Runs when: manually triggered OR commit message contains [update-screenshots]
    if: |
      github.event_name == 'workflow_dispatch' ||
      contains(github.event.head_commit.message, '[update-screenshots]')

    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true
          # Need write permission to commit updated baselines
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Install Xvfb and Electron deps
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y --no-install-recommends \
            xvfb libgbm-dev libasound2-dev libxshmfence-dev

      - name: Start virtual display
        run: |
          Xvfb :99 -screen 0 1280x800x24 &
          echo "DISPLAY=:99" >> $GITHUB_ENV

      - run: npm run build

      - name: Update baselines
        run: npm run e2e:screenshots:update
        env:
          DISPLAY: ':99'
          CI: 'true'
          UPDATE_BASELINE: 'true'

      - name: Commit updated baselines
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add e2e/screenshots/baseline/
          git diff --staged --quiet || git commit -m "Update e2e baseline screenshots [skip ci]"
          git push
```

The `[skip ci]` in the commit message prevents the baseline update commit from triggering another CI run, which would immediately overwrite the baselines again.

---

## 3. Caching npm and Electron Binary

The `actions/setup-node@v4` with `cache: 'npm'` handles the npm cache automatically. The Electron binary (~100MB) is cached separately because it lives in `~/.cache/electron/`, not in `node_modules`:

```yaml
- name: Cache npm packages
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-

- name: Cache Electron binary
  uses: actions/cache@v4
  with:
    path: ~/.cache/electron
    key: ${{ runner.os }}-electron-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-electron-
```

Add both caches before the `npm ci` step. The Electron cache saves ~60 seconds per run.

---

## 4. Sharding for Large Suites

When the full functional test suite grows past ~5 minutes, split it across parallel runners:

```yaml
jobs:
  e2e:
    name: E2E (shard ${{ matrix.shard }}/${{ strategy.job-total }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false    # Don't cancel other shards if one fails
      matrix:
        shard: [1, 2, 3]

    steps:
      # ... setup steps identical to non-sharded workflow ...

      - name: Run E2E tests (shard ${{ matrix.shard }}/3)
        run: npx wdio run wdio.conf.ts --shard=${{ matrix.shard }}/3
        env:
          DISPLAY: ':99'
          CI: 'true'

      - name: Upload failure screenshots
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-failures-shard-${{ matrix.shard }}
          path: e2e/screenshots/failures/
          if-no-files-found: ignore
```

`fail-fast: false` is important — if shard 1 fails, you still want shards 2 and 3 to complete so you see all failures in one run rather than debugging one shard at a time.

---

## 5. Environment Considerations

| Concern | How handled | Where |
|---|---|---|
| `ELECTRON_RUN_AS_NODE` breaking Electron | `delete process.env.ELECTRON_RUN_AS_NODE` | Top of `wdio.conf.ts` |
| `--no-sandbox` for Linux CI | In capabilities: `['--no-sandbox']` | `wdio.conf.ts` capabilities |
| Virtual display (Linux only) | Xvfb started in workflow step | CI workflow YAML |
| Git LFS baselines | `lfs: true` in checkout action | CI workflow YAML |
| Electron binary cache | `~/.cache/electron` cache step | CI workflow YAML |
| Build required before tests | `npm run build` step | CI workflow YAML |

Nothing about the CI environment requires changes to test code. The `wdio.conf.ts` file is written to work on both macOS (local dev) and Linux (CI) without conditionals.

---

## 6. Debugging CI Failures

**Download the failure artifact:**
1. Go to the failed workflow run on GitHub
2. Click "Artifacts" at the bottom of the run summary
3. Download `e2e-failure-screenshots` or `e2e-screenshots-actual`
4. The PNG files show exactly what the test saw when it failed

**Enable verbose Chromedriver logging:**
```yaml
- name: Run E2E tests
  run: npm run e2e
  env:
    DISPLAY: ':99'
    CI: 'true'
    WDIO_LOG_LEVEL: debug    # Dumps every WebDriver request/response
```

This is noisy (~1000 lines per test) but reveals exactly which selector failed and what Chromedriver returned.

**Verify the build output exists:**
```yaml
- name: Verify build output
  run: |
    ls -la out/main/
    test -f out/main/index.js || (echo "Build output missing" && exit 1)
```

Add this between the build step and test step if tests are failing immediately at startup.

**Check for missing Linux dependencies:**

If Electron exits immediately with exit code 1 or a signal, add:
```yaml
- name: Test Electron can launch
  run: |
    DISPLAY=:99 ./node_modules/.bin/electron --version
  continue-on-error: true
```

If this fails, you're missing a system package. Common culprits: `libgbm-dev`, `libasound2-dev`, `libatk-bridge2.0-dev`, `libxshmfence-dev`.
