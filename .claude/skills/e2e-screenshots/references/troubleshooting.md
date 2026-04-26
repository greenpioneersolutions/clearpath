# Screenshot System — Troubleshooting

## "No specs found to run, exiting with failure"

**Cause:** Using `npx wdio run wdio.conf.ts --spec e2e/screenshot-crawl.spec.ts`. In wdio v9, `--spec` cannot override the `exclude` array. The crawl spec is in `exclude` in `wdio.conf.ts`.

**Fix:** Always use the dedicated config:
```bash
npx wdio run wdio.screenshots.conf.ts
# or via npm:
npm run e2e:screenshots
```

---

## "Chrome instance exited" / session not created

**Cause:** `ELECTRON_RUN_AS_NODE=1` is set in the environment (VS Code sets this). It causes Electron to launch as a plain Node.js process instead of a GUI app.

**Fix:** Both `wdio.conf.ts` and `wdio.screenshots.conf.ts` have `delete process.env.ELECTRON_RUN_AS_NODE` at the top. If you're seeing this error, confirm the line is present:
```typescript
// At the top of wdio.screenshots.conf.ts, before `export const config`
delete process.env.ELECTRON_RUN_AS_NODE
```

---

## Screenshot shows "Loading..." instead of real content

**Cause:** Some tabs (e.g. Configure > Setup Wizard) load their content via async IPC calls. The 800ms default pause isn't long enough.

**Fix:** The `waitForLoadingToSettle(timeout)` helper polls until no `Loading...` text is present. For slow tabs, pass a higher timeout:
```typescript
await browser.pause(1200)
await waitForLoadingToSettle(6000)
```

For the Configure tabs section, the spec already navigates to Configure once in `before()` then clicks tabs in-place — this avoids re-navigation loading flashes. Do not use `navigateToConfigureTab()` inside the Configure tab loop (it re-navigates and triggers the flash).

---

## Extension pages show "Loading {Name}..." permanently

**Expected behavior.** Extension routes (Backstage, Efficiency Coach) require external backend services. Without those configured, they show a loading/spinner state indefinitely. This is the correct screenshot to capture — it reflects what a new user sees before configuration.

---

## Screenshot directory not created

**Cause:** `resolveScreenshotPath()` calls `mkdirSync({ recursive: true })` automatically. If this fails, it's likely a permissions issue on the output path.

**Check:**
```bash
ls -la e2e/screenshots/
```

---

## CI: "Electron exited" or display errors on Linux

**Cause:** Linux CI requires a virtual display for Electron to render. The CI jobs install Xvfb and set `DISPLAY=:99`.

**Fix:** Verify the CI steps in `.github/workflows/ci.yml` include:
```yaml
- name: Install system dependencies (Xvfb for headless Electron)
  run: |
    sudo apt-get update -q
    sudo apt-get install -y --no-install-recommends xvfb libgbm-dev libasound2-dev

- name: Start virtual display
  run: |
    Xvfb :99 -screen 0 1440x900x24 &
    echo "DISPLAY=:99" >> $GITHUB_ENV
    sleep 2
```

The exact Xvfb screen size doesn't have to match the crawl viewport — `wdio.screenshots.conf.ts` pins the BrowserWindow content area to `1280×800` via `setContentSize` regardless of host display.

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

**Cause:** The captured state didn't change between navigations. Common case: `work--initial` and `work--tab-wizard` both show "Session Wizard" because Work defaults to the wizard tab.

**Fix:** Remove the duplicate from the data table. The crawl spec removed `wizard` from `WORK_TABS` because `work--initial` already captures that state.

---

## Tests pass but no screenshots are written

**Cause:** You're checking the wrong output location. The screenshot crawl uses `@wdio/visual-service`, which writes actuals to `.tmp/visual/actual/{tag}.png` and diffs to `.tmp/visual/diff/{tag}.png`. Baseline images live under the configured `baselineFolder` (`e2e/screenshots/baseline/`), not under any `SCREENSHOT_DIR` env var.

**Check:**
```bash
ls -R .tmp/visual
# Re-run the crawl with the dedicated config:
npx wdio run wdio.screenshots.conf.ts

# `captureScreenshot()` (helpers/screenshots.ts) writes to .tmp/visual/captures/
# by default — override with SCREENSHOT_DIR if you need to write elsewhere.
SCREENSHOT_DIR=e2e/screenshots/baseline npx wdio run wdio.conf.ts
```
