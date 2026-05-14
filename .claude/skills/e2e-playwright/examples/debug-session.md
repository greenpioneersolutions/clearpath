# Example: Debug Session

A worked debug walkthrough using Playwright's tools. Follows the same shape as the WDIO debug example but with the trace viewer instead of `browser.debug()`.

## Step-by-step methodology

When a test fails, escalate through these tools — stop when you've found the cause.

### 1. Re-run the single failing spec

```bash
npx playwright test e2e/sessions.pw.spec.ts -g "archives a session"
```

### 2. Open the HTML report

```bash
npx playwright show-report
```

The report shows the failed test with stack trace, log of attempted actions, and the failure-time screenshot.

### 3. Open the trace

If you configured `trace: 'on-first-retry'` (the project default), the trace was captured on retry:

```bash
npx playwright show-trace test-results/sessions-archives-a-session-electron-retry1/trace.zip
```

Or drag-and-drop the `.zip` into [trace.playwright.dev](https://trace.playwright.dev).

In the trace UI:
- Scrub the timeline to see the page state before/during/after each action
- Click any action in the action list to time-travel
- Use Pick Locator on the snapshot to see what element resolved
- Check the Console panel for renderer errors at the failure time
- Check the Network panel for failed HTTP requests

### 4. Reproduce locally with `--debug`

```bash
npx playwright test e2e/sessions.pw.spec.ts -g "archives" --debug
```

This opens the Inspector and pauses at the start of the test. Step through actions one at a time, watching the page.

### 5. Add `await page.pause()` to drill in

If `--debug` is too slow, drop a programmatic breakpoint at the spot where things go wrong:

```ts
test('archives a session', async ({ page }) => {
  await navigateSidebarTo(page, 'Sessions');
  await page.getByRole('button', { name: 'New session' }).click();
  await page.pause();   // ← drops into the Inspector here
  await page.getByLabel('Session name').fill('test');
  // ...
});
```

Run the test normally — the Inspector opens at the `pause()`.

### 6. UI mode for active development

```bash
npx playwright test --ui
```

The UI mode has a watch feature, time-travel for every test, live-edit locators, and inline trace viewer. Best for actively developing a new spec or reproducing a flake.

## Inspector cheatsheet

| Action | Shortcut |
|--------|---------|
| Resume | F8 / play button |
| Step over | F10 |
| Pick Locator | toolbar button → click element on page |
| Record actions | toolbar button → subsequent UI actions transcribe to test code panel |
| Pin a test code change | "Save" button |
| Open in DevTools | F12 (Chromium DevTools attaches to the renderer) |

## VSCode

### Extension (recommended)
Install **Playwright Test for VSCode**. It puts run buttons next to each `test()` declaration and adds Inspector / trace viewer integration.

### `.vscode/launch.json` for breakpoint debugging

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Playwright: current spec",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["playwright", "test", "${file}", "--workers=1"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "env": {
        "ELECTRON_RUN_AS_NODE": ""
      }
    },
    {
      "name": "Playwright: current spec (headed)",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["playwright", "test", "${file}", "--workers=1", "--headed"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "env": {
        "ELECTRON_RUN_AS_NODE": ""
      }
    }
  ]
}
```

⚠️ Set `"ELECTRON_RUN_AS_NODE": ""` in `env` — VS Code's terminal sets it to `1` and breaks the launch.

## Verbose API logs

```bash
DEBUG=pw:api npx playwright test
DEBUG=pw:browser npx playwright test    # launch issues
DEBUG=pw:* npx playwright test          # everything
```

## Common-root-causes table

| Symptom | First check | Likely fix |
|---------|------------|-----------|
| `electron.launch` hangs | `ELECTRON_RUN_AS_NODE` set? `out/main/index.js` exists? | Strip env var; run `npm run build` |
| "Target page, context or browser has been closed" | Is `electronApp.close()` racing? | Move long-running work into the test, not after `await app.close()` |
| `expect(loc).toBeVisible()` times out | Open trace; the element is `display:none` or covered | Wait for the parent state first; check z-index for overlay |
| Strict mode violation: 4 elements | Locator too broad | Add `getByRole(... { name: 'X' })` or `.filter({ hasText: 'X' })` |
| Visual diff fails | Open HTML report slider | Add `mask` for the dynamic region; pin DPR with `--force-device-scale-factor=1` |
| Test passes locally, fails on CI | Compare `-actual.png` from CI artifacts | Mask dynamic content; ensure same OS in baseline + CI |
| Test passes once, fails on retry | Stale state from prior run | Reset stores in `beforeEach`; use per-worker `userDataDir` |
| Click registers but state doesn't change | Check Network/Console in trace | IPC handler errored — fix the handler or mock it |
| `dialog.showOpenDialog` hangs forever | The mock wasn't installed before the click | Move `mockElectronApi(...)` to `beforeEach` |
| `app.quit` test hangs at fixture teardown | `app.quit` was mocked but not restored | Always `restoreAllElectronMocks` in `afterEach` |
| Flaky once per dozen runs | Trace from the retry | Set `retries: 2`, `trace: 'on-first-retry'`, investigate the retry trace |

## REPL-style exploration

After `await page.pause()`, the **DevTools Console** in the renderer also exposes a `playwright` global if launched with `PWDEBUG=console`:

```bash
PWDEBUG=console npx playwright test e2e/smoke.pw.spec.ts
```

In the renderer's DevTools console:
```js
playwright.$('button')                          // first match
playwright.$$('button')                         // all matches
playwright.locator('button', { hasText: 'Save' })
playwright.inspect('#root')                     // reveal in Elements panel
playwright.selector($0)                         // generate locator for $0 (selected element)
```

This is the closest equivalent to WDIO's `browser.debug()` REPL.

## Capturing main-process logs

Renderer console messages appear in the trace's Console panel. Main-process logs do NOT — capture them via the fixture:

```ts
electronApp: [async ({}, use) => {
  const app = await electron.launch({ /* ... */ });
  app.process().stdout?.on('data', (b) => process.stdout.write(`[main] ${b}`));
  app.process().stderr?.on('data', (b) => process.stderr.write(`[main:err] ${b}`));
  app.on('console', (msg) => console.log(`[main:console] ${msg.text()}`));
  await use(app);
  await app.close();
}, { scope: 'worker' }],
```

For per-test attachment to the report:

```ts
test('with main logs attached', async ({ electronApp }, testInfo) => {
  const logs: string[] = [];
  const onMsg = (msg: any) => logs.push(`[${msg.type()}] ${msg.text()}`);
  electronApp.on('console', onMsg);
  try {
    // ...
  } finally {
    electronApp.off('console', onMsg);
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('main-process-logs', {
        body: logs.join('\n'),
        contentType: 'text/plain',
      });
    }
  }
});
```

## Walkthrough: a real failing test

Suppose this test fails:

```ts
test('archives a session', async ({ page }) => {
  await navigateSidebarTo(page, 'Sessions');
  const row = page.getByRole('row', { name: 'My session' });
  await row.getByRole('button', { name: 'Archive' }).click();
  await expect(row).toBeHidden();
});
```

**Step 1**: Open the HTML report. Failure shows `expect(row).toBeHidden()` timed out — the row is still visible.

**Step 2**: Open the trace. Time-travel to the click action. The "After" snapshot shows a confirmation dialog appeared.

**Step 3**: Realize the test is missing the confirm step. Add:
```ts
await page.getByRole('button', { name: 'Confirm' }).click();
```

**Step 4**: Re-run. Still failing — the confirmation dialog dismisses but the row reappears moments later.

**Step 5**: In trace, scrub past the confirm click. The Network panel shows a `cli:archive-session` IPC call returning an error.

**Step 6**: Check `electronApp.process()` stderr in the test attachment — main-process exception "no such session id".

**Step 7**: The bug is real — the row's session ID isn't matching the IPC handler's expectation. File and fix.

This kind of guided post-mortem is what the trace viewer is for. Without it, you'd be re-running with `console.log` until you guess the answer.
