# Screenshot System — Troubleshooting

## "No tests found" when trying to run the screenshot crawl

**Cause:** You tried to run the screenshot crawl under the default config — e.g. `npx playwright test e2e/screenshot-crawl.pw.spec.ts` — and got "No tests found." The default `playwright.config.ts` has both crawl specs in `testIgnore`, so the crawl spec needs its dedicated config to be picked up. (Plain `npx playwright test` is *not* affected; that runs the functional `.pw.spec.ts` suite as designed.)

**Fix:** Use the dedicated screenshot config:
```bash
npx playwright test -c playwright.screenshots.config.ts
# or via npm:
npm run pw:screenshots
```

For the experimental crawl, use `playwright.screenshots.experimental.config.ts` (`npm run pw:screenshots:experimental`).

---

## "Electron exited" / session not created

**Cause:** `ELECTRON_RUN_AS_NODE=1` is set in the environment (VS Code sets this). It causes Electron to launch as a plain Node.js process instead of a GUI app.

**Fix:** Both `playwright.config.ts` and `e2e/fixtures.ts` call `delete process.env.ELECTRON_RUN_AS_NODE`. The deletion in `fixtures.ts` is what actually reaches the worker — the config-level one only matters for the config eval. If you're seeing this error, confirm the line is present near the top of `e2e/fixtures.ts`:
```typescript
// Inside the electronApp fixture
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args, env, ... })
```

---

## Screenshot shows "Loading..." instead of real content

**Cause:** Some tabs (e.g. Configure > Setup Wizard) load their content via async IPC calls. The 800–1200ms default pause isn't long enough.

**Fix:** The `waitForLoadingToSettle(page, timeout)` helper polls until no `Loading...` text AND no skeleton-pulse animations are present. For slow tabs, pass a higher timeout:
```typescript
await page.waitForTimeout(1200)
await waitForLoadingToSettle(page, 6000)
```

For the Configure tabs section, the spec already navigates to Settings once in `test.beforeAll` then clicks tabs in-place — this avoids re-navigation loading flashes. Do not call `navigateToConfigureTab()` inside the Configure tab loop (it re-navigates and triggers the flash).

---

## "Taking page screenshot" hangs forever (especially on Memory tab, Skills tab)

**Cause:** Playwright's `page.screenshot` waits on `document.fonts.ready` and RAF stability. Some Electron pages keep a font-load promise pending forever in the headless renderer.

**Fix:** The spec already uses `BrowserWindow.capturePage()` via `electronApp.evaluate` for the write path, which bypasses every implicit wait. If you're adding a new helper that calls `page.screenshot` and hit the same hang locally, export `PW_TEST_SCREENSHOT_NO_FONTS_READY=1` for the run — CI sets it automatically on every visual job in `.github/workflows/ci.yml`; the npm scripts do **not** (so local runs that don't touch `page.screenshot` won't notice).

Easiest local invocation — prepend the env var to the existing npm
script so `CLEARPATH_E2E_VISUAL=1` (dark-mode emulation) stays set:

```bash
PW_TEST_SCREENSHOT_NO_FONTS_READY=1 npm run pw:screenshots:update
```

If you bypass the npm script and call `playwright test` directly,
**include `CLEARPATH_E2E_VISUAL=1`** so the `page` fixture forces dark
mode via `emulateMedia` — without it, `-u` will regenerate baselines in
the host's default (light) color scheme, which doesn't match the
committed dark baselines:

```bash
CLEARPATH_E2E_VISUAL=1 PW_TEST_SCREENSHOT_NO_FONTS_READY=1 \
  npx playwright test -c playwright.screenshots.config.ts -u
```

---

## Extension pages show "Loading {Name}..." permanently

**Expected behavior.** Extension routes (Backstage, Efficiency Coach) require external backend services. Without those configured, they show a loading/spinner state indefinitely. This is the correct screenshot to capture — it reflects what a new user sees before configuration.

---

## CI: missing baseline error

**Cause:** The screenshot crawl spec throws when `process.env.CI === 'true'` AND a baseline file doesn't exist on disk. Usually means Git LFS didn't pull the PNG, or a baseline was deleted but never regenerated.

**When it actually fires:** Only on a screenshot-crawl run executed in **compare mode** (no `-u`) under CI. The two committed jobs — `screenshot-regression` and `screenshot-regression-experimental` — explicitly pass `-u`, so they take the write path and create whatever's missing. The error usually surfaces only if someone adds a new compare-mode workflow, runs the screenshot config manually under `CI=true`, or the functional/extensions configs accidentally pick up a screenshot spec (none of them do today).

**Fix:** Verify the workflow's `actions/checkout` step has `lfs: true` (it does in `.github/workflows/ci.yml`). Locally, run `npm run pw:screenshots:update` to regenerate, then commit the new baseline.

---

## CI: "Electron exited" or display errors on Linux

**Cause:** Linux CI requires a virtual display for Electron to render. The CI jobs install Xvfb and set `DISPLAY=:99`.

**Fix:** Verify the CI steps in `.github/workflows/ci.yml` include:
```yaml
- name: Install Linux deps for Electron headless
  run: |
    sudo apt-get update -q
    sudo apt-get install -y --no-install-recommends xvfb libgbm-dev libasound2-dev

- name: Start virtual display
  run: |
    Xvfb :99 -screen 0 1440x900x24 &
    echo "DISPLAY=:99" >> $GITHUB_ENV
    sleep 2
```

The exact Xvfb screen size doesn't have to match the crawl viewport — the `page` fixture pins the BrowserWindow content area to `1280×800` via `setContentSize` regardless of host display.

---

## Stale screenshots in baseline/

After removing a page or tab from the crawl data tables, the old PNG file remains in `e2e/screenshots/baseline/`. It won't cause test failures but clutters the LFS store.

**Fix:** Delete the file manually, then commit:
```bash
rm e2e/screenshots/baseline/old-name.png
git add -u e2e/screenshots/baseline/
git commit -m "chore: remove stale screenshot baseline"
```

---

## Screenshots look identical for two different states

**Cause:** The captured state didn't change between navigations. Common case: `work--initial` and `work--tab-session` may both show the default session view if the page lands on the session tab.

**Fix:** Remove the duplicate from the data table. Confirm the URL hash actually navigated by reading `window.location.hash` in a `page.evaluate` before the capture.

---

## Tests pass but no actual/expected artifacts on a failed diff

**Cause:** Diff output is attached to the test report only when the comparison fails. The crawl uses `test.info().attach()` to surface actual + expected PNGs when `comparePngPixelRatio` reports > 0.02.

**Check:**
```bash
# Open the HTML report
npm run pw:report

# Or look at the trace ZIP under:
ls -R test-results-visual/
```

For ad-hoc captures (`captureScreenshot(page, tag)` from `helpers/pw-screenshots.ts`), output goes to `.tmp/visual/captures/` by default — override with `SCREENSHOT_DIR=...`.

---

## "Auto-update screenshot baselines" commit appears on an unrelated PR

**Cause:** A new dynamic format slipped past `freezeDynamicContent` and the page now renders a different timestamp/locale value on every CI run, or an element has random content with no `data-screenshot-stub`.

**Fix:**
1. Open the LFS-pointer diff in the PR to see which tag(s) changed.
2. Download the `screenshots` artifact and inspect the new baseline vs. the previous one. Usually the diff makes the culprit obvious (e.g. "5 minutes ago" → "6 minutes ago").
3. Either extend the regex set in `freezeDynamicContent()` (in `e2e/helpers/pw.ts`) or add `data-screenshot-stub="…"` to the component.
4. Re-run with `-u` locally to regenerate, then commit.
