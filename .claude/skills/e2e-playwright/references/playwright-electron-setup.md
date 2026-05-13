# Playwright Electron Setup

How to launch the CoPilot Commander Electron app under Playwright. Replaces `wdio-electron-service` and the WDIO capability config.

## Library mode — `_electron`

Electron is **not** a browser project in Playwright's project model. You launch it through the `playwright` library API and run tests through `@playwright/test`. The two pieces are bridged with a worker-scoped fixture (see [fixtures.md](fixtures.md)).

```ts
import { _electron as electron } from 'playwright';
import { test } from '@playwright/test';
```

> The `_electron` namespace ships in the same `playwright` package as `chromium`/`firefox`/`webkit`. The leading underscore signals "experimental" — but the API has been stable since v1.9. Both packages (`playwright` and `@playwright/test`) re-export it.

Supported Electron versions: **v12.2.0+, v13.4.0+, v14+**. The project uses Electron 39 (`^39.8.6` in package.json), well within the supported range.

## Install

```bash
npm install --save-dev @playwright/test
# Browser binaries are NOT needed for Electron — you don't need:
# npx playwright install
# unless you also run web tests in the same project.
```

For CI on Linux you DO want OS-level deps (the same set Chromium needs):
```bash
npx playwright install-deps chromium
```

## `_electron.launch(options)` — every option

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `args` | `string[]` | — | The first arg is your main script (`['out/main/index.js']` for unpackaged). Extra Chromium switches (`--no-sandbox`, `--force-device-scale-factor=1`) go here too. |
| `executablePath` | `string` | `node_modules/.bin/electron` | Override the binary. Use the packaged `.app`/`.exe` path for production-binary smoke tests. |
| `cwd` | `string` | — | Working directory the Electron process launches from. |
| `env` | `Record<string,string>` | `process.env` | **Strip `ELECTRON_RUN_AS_NODE` here** — VS Code sets it. |
| `timeout` | `number` | `30000` | Launch timeout in ms (`0` disables). |
| `acceptDownloads` | `boolean` | `true` | |
| `bypassCSP` | `boolean` | `false` | |
| `chromiumSandbox` | `boolean` | `false` | (v1.59+) |
| `colorScheme` | `'light' \| 'dark' \| 'no-preference' \| null` | `'light'` | Emulates `prefers-color-scheme`. |
| `extraHTTPHeaders` | `Record<string,string>` | — | |
| `geolocation` | `{ latitude, longitude, accuracy? }` | — | |
| `httpCredentials` | `{ username, password, origin?, send? }` | — | Basic auth. |
| `ignoreHTTPSErrors` | `boolean` | `false` | |
| `locale` | `string` | system | e.g. `'en-GB'`. |
| `offline` | `boolean` | `false` | |
| `recordHar` | `{ path, content?, mode?, urlFilter?, omitContent? }` | — | Must `await electronApp.close()` to flush. |
| `recordVideo` | `{ dir, size?, showActions? }` | — | Default size: 800×450 if no viewport. |
| `timezoneId` | `string` | system | ICU timezone id. |
| `tracesDir` | `string` | — | Where `context.tracing.stop({ path })` writes. |
| `artifactsDir` | `string` | temp dir | Traces, videos, downloads, HARs. (v1.59+) |

Returns `Promise<ElectronApplication>`.

## Canonical project launch

```ts
// e2e/fixtures.ts (excerpt)
import { _electron as electron } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ENTRY = path.join(__dirname, '..', 'out', 'main', 'index.js');

const env = { ...process.env, NODE_ENV: 'test' };
delete env.ELECTRON_RUN_AS_NODE;

const electronApp = await electron.launch({
  args: [
    APP_ENTRY,
    '--no-sandbox',                  // required on CI Linux
    '--disable-gpu',                 // CI without GPU
    '--disable-dev-shm-usage',       // CI containers
    '--force-device-scale-factor=1', // pin DPR for visual tests
  ],
  env,
  timeout: 30_000,
});
```

The `npm run build` step that generates `out/main/index.js` must run before any e2e test. Wire this through `package.json`:
```json
{
  "scripts": {
    "pw": "npm run build && playwright test",
    "pw:screenshots": "npm run build && playwright test -c playwright.screenshots.config.ts"
  }
}
```

## Electron Fuses caveat

If `electron.launch()` hangs at startup, the most common upstream cause is the `nodeCliInspect` (`FuseV1Options.EnableNodeCliInspectArguments`) fuse being set to `false`. Playwright connects via the Node inspector to drive the main process — disabling that fuse breaks the launch.

Check the project's electron-builder / `forge.config` for any `fuses:` block and ensure `EnableNodeCliInspectArguments` is `true` (or absent — the default is true).

## `executablePath` for packaged builds

To smoke-test the actual `.app` / `.exe` produced by `electron-builder`:

```ts
const electronApp = await electron.launch({
  executablePath: process.platform === 'darwin'
    ? path.join(__dirname, '..', 'dist-electron', 'mac-arm64', 'ClearPathAI.app', 'Contents', 'MacOS', 'ClearPathAI')
    : process.platform === 'win32'
    ? path.join(__dirname, '..', 'dist-electron', 'ClearPathAI.exe')
    : path.join(__dirname, '..', 'dist-electron', 'ClearPathAI.AppImage'),
  args: [],
});
```

Note: when launching the packaged app, **do NOT pass the main script as an arg** — the binary already knows where its main script is. Pass an empty `args: []` plus any runtime flags.

## Why no preload shim is needed

`wdio-electron-service` requires importing `wdio-electron-service/main` and `wdio-electron-service/preload` into your app code so the service can hook IPC for `browser.electron.execute()` / `browser.electron.mock()`. **Playwright doesn't need this.** It connects to Electron's main process via the Node inspector / Chrome DevTools Protocol directly, so `electronApp.evaluate()` works without any cooperation from app code.

You can leave `process.env.TEST = 'true'` conditionals in app code if they gate other tooling, but the WDIO preload imports can be deleted.

## What you lose vs WDIO

- No built-in Electron API mocking. Implement your own monkey-patch helper — see [electron-api-mocking.md](electron-api-mocking.md).
- No automatic app-version assertion (was `browser.electron.app.getVersion()`). Use `await electronApp.evaluate(({ app }) => app.getVersion())`.

## What you gain

- **Trace viewer** — full DOM/network/console replay (see [trace-viewer.md](trace-viewer.md))
- **UI mode** — `npx playwright test --ui` watches your tests, lets you edit locators live
- **Codegen** — `await page.pause()` opens an Inspector with Pick Locator
- **Web-first assertions** — auto-retrying `expect()` (no more `toBeDisplayed()` flakes)
- **Built-in visual regression** — `toHaveScreenshot()` (no extra service)
- **Sharding** — `--shard=1/4` works out of the box, plus `merge-reports` for blob output
- **Native parallelism** when you can use it (Electron suites typically pin to `workers: 1`)
