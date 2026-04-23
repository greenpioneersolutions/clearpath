# Timeouts in WebdriverIO

WebdriverIO has several independent timeout layers. Understanding each prevents "timeout" errors during test debugging.

## Timeout Hierarchy

```
WebDriver Protocol Timeouts (browser.setTimeout)
  └── Script timeout: 30s default
  └── Page load: 300s default
  └── Implicit wait: 0s (DO NOT increase — use explicit waits)

WDIO Testrunner Timeouts (wdio.conf.ts)
  └── waitforTimeout: 15000ms — default for all waitFor* commands
  └── waitforInterval: 100ms — polling frequency
  └── connectionRetryTimeout: 120000ms — driver connection
  └── connectionRetryCount: 3

Framework Timeouts (Mocha)
  └── mochaOpts.timeout: 60000ms — per-test timeout
```

## waitforTimeout (Default Element Wait)

Controls how long `waitForExist`, `waitForDisplayed`, `waitForClickable`, and all `expect(el).toBe*()` matchers wait before failing.

```typescript
// wdio.conf.ts
waitforTimeout: 15000,   // 15 seconds (project default)
waitforInterval: 100,    // poll every 100ms
```

Override per-call:

```typescript
await el.waitForDisplayed({ timeout: 30000, interval: 500 })
await expect(el).toBeDisplayed({ wait: 30000 })
```

## Mocha Test Timeout

Controls how long a single `it()` block can run before timing out.

```typescript
// wdio.conf.ts
mochaOpts: {
  ui: 'bdd',
  timeout: 60000,  // 60s per test (project default)
}
```

**Debug mode**: Increase to prevent the test timing out while you're in the `browser.debug()` REPL:

```typescript
mochaOpts: { timeout: 24 * 60 * 60 * 1000 }  // 24 hours
```

**Per-test override** (Mocha): Use `this.timeout()` inside `it()` — note this requires `function()` syntax, not arrow functions, because arrow functions don't bind `this` in Mocha:

```typescript
// Arrow functions don't have 'this' in Mocha — use function() syntax
it('long test', async function() {
  this.timeout(120000)
  // ...
})
```

## connectionRetryTimeout

How long WDIO waits for the ChromeDriver/Electron session to be established:

```typescript
connectionRetryTimeout: 120000,  // 2 minutes
connectionRetryCount: 3,         // retry 3 times
```

If Electron fails to launch: check `ELECTRON_RUN_AS_NODE`, `goog:chromeOptions`, and that the app is built (`out/main/index.js` exists).

## waitUntil Options

```typescript
await browser.waitUntil(
  async () => {
    const el = await $('#data-loaded')
    return el.isExisting()
  },
  {
    timeout: 10000,    // override waitforTimeout for this call
    interval: 300,     // override waitforInterval
    timeoutMsg: 'Data never loaded within 10s',
  }
)
```

## WebDriver Protocol Timeouts

Set via `browser.setTimeout()` — rarely needed:

```typescript
await browser.setTimeout({
  script: 30000,    // browser.execute() timeout (30s default)
  pageLoad: 60000,  // page load timeout (300s default)
  implicit: 0,      // DO NOT increase — use explicit waitFor* instead
})
```

**Never increase implicit wait** — it causes all element queries to block for that full duration if the element isn't found, making tests slow and masking bugs.

## Timeout Diagnostics

| Error message | Cause | Fix |
|---------------|-------|-----|
| `Element with selector "..." not found in 15000ms` | waitforTimeout too short or element never appears | Check selector; increase `waitforTimeout` or per-call timeout |
| `Timeout of 60000ms exceeded` | Mocha test timeout | Increase `mochaOpts.timeout`; test may have hung on `waitUntil` |
| `Failed to connect to ChromeDriver in 120000ms` | Electron not launching | Check `ELECTRON_RUN_AS_NODE`; verify `out/main/index.js` exists |
| `Script timeout of 30000ms exceeded` | `browser.execute()` too slow | Increase script timeout via `browser.setTimeout` |
