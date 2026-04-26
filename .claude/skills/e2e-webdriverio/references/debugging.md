# Debugging WebdriverIO + Electron Tests

## 1. browser.debug() — Interactive REPL

Pause a test mid-run and get an interactive REPL with `$`, `$$`, and `browser` available:

```typescript
it('inspects the element', async () => {
  await waitForAppReady()
  await navigateSidebarTo('Configure')

  // Execution stops here — REPL opens in terminal
  await browser.debug()

  // After exiting REPL, test continues
  await expect($('#tab-settings')).toBeDisplayed()
})
```

**Critical**: Increase Mocha timeout before using `debug()`, or the test will timeout while you're in the REPL:

```typescript
// In wdio.conf.ts:
mochaOpts: {
  timeout: 24 * 60 * 60 * 1000  // 24 hours for debug sessions
}
// Or override for one run:
// WDIO_LOG_LEVEL=debug npx wdio run wdio.conf.ts --spec e2e/smoke.spec.ts
```

**REPL commands:**
- `await $('selector')` — query element
- `await $$('selector')` — query all
- `await browser.getTitle()` — page title
- `await browser.execute(() => document.querySelector('#root').innerHTML)` — DOM inspection
- `.exit` or `Ctrl+C` — resume test execution

## 2. VSCode launch.json

Run a single spec file with the VSCode debugger attached:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Run WDIO spec",
      "program": "${workspaceFolder}/node_modules/.bin/wdio",
      "args": ["run", "wdio.conf.ts", "--spec", "${file}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "env": {
        "NODE_ENV": "test"
      }
    }
  ]
}
```

Open the spec file you want to debug, then run "Run WDIO spec" from the Debug panel.

## 3. Run a Single Spec

```bash
# Run one spec file
npx wdio run wdio.conf.ts --spec e2e/smoke.spec.ts

# Run with verbose logging
WDIO_LOG_LEVEL=debug npx wdio run wdio.conf.ts --spec e2e/home.spec.ts

# Repeat a spec 5 times (flaky test validation)
npx wdio run wdio.conf.ts --spec e2e/home.spec.ts --repeat 5
```

## 4. Inspect Renderer Console Logs

```typescript
// After test action — check for renderer errors
const logs = await browser.getLogs('browser')
const errors = (logs as Array<{ level: string; message: string }>)
  .filter(e => e.level === 'SEVERE' || e.level === 'ERROR')

if (errors.length > 0) {
  console.log('Renderer errors:', errors)
}
```

## 5. Verbose DOM Inspection

```typescript
// Get full DOM for a section
const html = await browser.execute(() =>
  document.querySelector('#root')?.innerHTML ?? ''
)
console.log('Root HTML length:', html.length)

// Check computed styles
const display = await $('aside').getCSSProperty('display')
console.log('Sidebar display:', display.value)
```

## 6. ELECTRON_RUN_AS_NODE Issue

**Symptom**: Test starts, Electron launches, but no GUI window appears. Chrome exits immediately with "session not created" error.

**Cause**: VS Code sets `ELECTRON_RUN_AS_NODE=1` in child processes. This causes Electron to behave as a plain Node.js runtime instead of launching the renderer.

**Fix**: Ensure this line is at the TOP of every wdio config file (before `export const config`):

```typescript
delete process.env.ELECTRON_RUN_AS_NODE
```

This is already present in `wdio.conf.ts` and `wdio.screenshots.conf.ts`.

## 7. Flaky Test Strategies

| Problem | Strategy |
|---------|----------|
| Race condition | Replace `browser.pause()` with `waitUntil` or `waitFor*` |
| Timing-sensitive animation | Add `disableCSSAnimation: true` to visual service or `browser.pause(300)` |
| Element stale after navigation | Re-query after navigation; add `browser.pause(500)` after route change |
| Assertion timeout | Increase `waitforTimeout` in config or per-assertion options |
| Throttle CPU | `browser.throttleCPU(4)` to simulate slower machine |
| Renderer errors | Check `browser.getLogs('browser')` in `afterEach` |

## 8. specFileRetries for CI Flakiness

```typescript
// wdio.conf.ts
specFileRetries: 2,              // retry failed spec file up to 2 times
specFileRetriesDelay: 1,         // wait 1 second between retries
specFileRetriesDeferred: false,  // retry immediately (true = retry after all specs)
```

## 9. Debugging Visual Test Failures

When `checkScreen()` fails with mismatch above threshold:

1. Check `e2e/screenshots/diff/` for the diff image (red pixels = changed area)
2. Compare `e2e/screenshots/baseline/` (expected) vs `e2e/screenshots/actual/` (got)
3. If change is intentional: run `npm run e2e:screenshots:update` and commit new baselines
4. If unintentional: investigate what caused the visual regression
