# Example: Debugging a Failing Test

When a test fails with "element not found" or times out, the fastest path to a fix is pausing execution mid-test, inspecting the live DOM, and understanding what the app actually rendered vs. what the test expected.

---

## Step 1: Run Just That Spec

Don't run the full suite. Isolate the failing file:

```bash
# Run a single spec file
npx wdio run wdio.conf.ts --spec e2e/configure.spec.ts

# Run a single spec with verbose driver logging
WDIO_LOG_LEVEL=debug npx wdio run wdio.conf.ts --spec e2e/configure.spec.ts
```

`WDIO_LOG_LEVEL=debug` dumps every Chromedriver request and response to stdout. It's noisy but shows you exactly which selector was sent and what Chromedriver returned. Useful for distinguishing "element exists but is hidden" from "element genuinely absent."

---

## Step 2: Add browser.debug() to Pause

Insert a `browser.debug()` call immediately before the failing line. This opens a REPL attached to the live Electron window — the app stays open and you can run commands interactively.

```typescript
it('selects the Settings tab', async () => {
  await navigateSidebarTo('Configure')

  // PAUSE HERE — opens interactive REPL, test waits indefinitely
  await browser.debug()

  // After you exit the REPL with .exit, execution continues here
  const tab = await $('#tab-settings')
  await tab.waitForExist({ timeout: ELEMENT_TIMEOUT })
  await tab.click()
})
```

Before doing this, increase the Mocha timeout so the test doesn't time out while you're in the REPL:

```typescript
// In wdio.conf.ts — temporary, revert after debugging
mochaOpts: {
  timeout: 24 * 60 * 60 * 1000,   // 24 hours — effectively unlimited
}
```

---

## Step 3: REPL Investigation

Once the REPL opens, the Electron app is frozen on screen. You can run any WebdriverIO command or execute arbitrary JS in the renderer context.

**Check basic app state:**
```
> await browser.getTitle()
'CoPilot Commander'

> await browser.execute(() => window.location.hash)
'#/configure?tab=settings'

> await $('#root').isExisting()
true
```

**Inspect the sidebar:**
```
> await $('aside').getHTML()
// Dumps the full aside HTML — look for the link text and structure
```

**Find all links in the sidebar (use for...of, not .map()):**
```
> for (const a of await $$('//aside//a')) { console.log(await a.getText()) }
Home
Work
Insights
Configure
Learn
```

Why `for...of` and not `.map()`? In the REPL, `$$('//aside//a')` returns an array of Element objects. Calling `.map(a => a.getText())` would create an array of Promises without awaiting them. The `for...of` loop with `await` is the correct pattern.

**Test a selector before using it in code:**
```
> await $('//button[contains(., "Settings")]').isExisting()
false   // ← the problem! It doesn't exist yet

> await $$('//button').length
3

> for (const b of await $$('//button')) { console.log(await b.getText()) }
General
Team
Billing
// ← "Settings" is not a button here, it's in the sidenav as role="tab"

> await $('//button[@role="tab" and contains(., "Settings")]').isExisting()
true   // ← found it
```

**Exit the REPL:**
```
> .exit
```

Execution resumes from the line after `browser.debug()`.

---

## Step 4: VSCode launch.json for Breakpoint Debugging

For Node.js-level debugging (main process code, wdio config, helpers), use the Node debugger:

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "WDIO: run current spec",
      "program": "${workspaceFolder}/node_modules/.bin/wdio",
      "args": ["run", "wdio.conf.ts", "--spec", "${file}"],
      "console": "integratedTerminal",
      "env": {
        "WDIO_LOG_LEVEL": "debug"
      }
    }
  ]
}
```

Open the failing spec in the editor, press F5. Set breakpoints in `wdio.conf.ts`, helper files, or spec files. This works for the Node side of the test — not the renderer. For renderer-side investigation, use `browser.debug()` + the REPL.

---

## Step 5: Capture Renderer Errors After Failure

The renderer may have thrown a React error, unhandled rejection, or console.error that explains why the element didn't render. Hook this into `afterEach`:

```typescript
// e2e/helpers/console.ts
export async function getCriticalConsoleErrors(): Promise<string[]> {
  return browser.execute(() => {
    // This assumes you've collected console errors in a global array
    // Set up in onPrepare or in the app itself via browser.execute() at test start
    return (window as any).__e2eConsoleErrors ?? []
  })
}

// In your spec or in wdio.conf.ts afterEach hook:
afterEach(async function (test, ctx, result) {
  if (result && !result.passed) {
    const errors = await getCriticalConsoleErrors()
    if (errors.length) {
      console.log('Renderer errors at time of failure:', errors)
    }
    // Also take a failure screenshot
    const name = (test?.title ?? 'unknown').replace(/\s+/g, '-')
    await browser.saveScreenshot(`./e2e/screenshots/failures/${name}.png`)
  }
})
```

To collect errors, inject a listener early in your test run:

```typescript
// In wdio.conf.ts, before() hook or at the top of each spec's before():
await browser.execute(() => {
  (window as any).__e2eConsoleErrors = []
  const orig = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    (window as any).__e2eConsoleErrors.push(args.map(String).join(' '))
    orig(...args)
  }
})
```

---

## Common Root Causes Table

| Error message | Likely cause | Fix |
|---|---|---|
| `Element not found in 10000ms` | Wrong selector, or element not rendered yet | Inspect DOM in REPL; verify navigation completed; check `waitForExist` timeout |
| `Chrome instance exited unexpectedly` | `ELECTRON_RUN_AS_NODE=1` is set | Add `delete process.env.ELECTRON_RUN_AS_NODE` at the very top of `wdio.conf.ts` |
| `Timeout of 60000ms exceeded` | Test hung on `waitUntil` or `waitForExist` | Add `browser.debug()` before the wait to inspect what's on screen |
| `No specs found to run` | `--spec` path excluded by config, or wrong glob | Check `specs` and `exclude` arrays in config; use exact file path |
| `Cannot read properties of undefined (reading 'click')` | Element query returned `undefined` or query resolved before render | Use `waitForExist` before any action; check selector syntax |
| `stale element reference` | The DOM updated between query and action | Re-query the element; avoid storing element refs across async gaps |
| `checkScreen baseline not found` | First run with `autoSaveBaseline: false` | Either set `autoSaveBaseline: true` or run `e2e:screenshots:update` first |
| Text selector `$('button=Save')` not working | Electron Chromedriver doesn't support WD text selectors | Rewrite as XPath: `$('//button[contains(., "Save")]')` |

---

## Quick Reference: Debug Commands

```bash
# Run one spec, verbose
WDIO_LOG_LEVEL=debug npx wdio run wdio.conf.ts --spec e2e/my.spec.ts

# Run with unlimited timeout (set in mochaOpts first)
npx wdio run wdio.conf.ts --spec e2e/my.spec.ts

# Check your built app exists (tests will fail if build is stale)
ls out/main/index.js

# List all spec files that would be picked up
npx wdio run wdio.conf.ts --help  # not perfect but shows config
```

```
# In browser.debug() REPL — most useful commands:
> await browser.getTitle()
> await browser.execute(() => window.location.hash)
> await $('#root').isExisting()
> await $('aside').getHTML()
> await $('//button[contains(., "Save")]').isExisting()
> await $('//button[contains(., "Save")]').getText()
> for (const el of await $$('//button')) { console.log(await el.getText()) }
> .exit
```
