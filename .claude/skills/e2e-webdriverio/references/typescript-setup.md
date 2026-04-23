# TypeScript Setup for WebdriverIO

## Required Packages

Install the core WDIO TypeScript dependencies:

```bash
npm install --save-dev tsx @wdio/globals @wdio/types
# Mocha framework types:
npm install --save-dev @wdio/mocha-framework
# Visual service types (if using @wdio/visual-service):
npm install --save-dev @wdio/visual-service
# Electron service types:
npm install --save-dev wdio-electron-service
```

`tsx` is required to run `wdio.conf.ts` and spec files directly without a separate compile step.

---

## tsconfig.json

Minimal TypeScript config for WDIO e2e tests:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "types": [
      "node",
      "@wdio/globals/types",
      "@wdio/mocha-framework"
    ]
  },
  "include": ["e2e/**/*.ts", "wdio.conf.ts", "wdio.screenshots.conf.ts"]
}
```

Keep this as a dedicated `tsconfig.json` at the project root or in the `e2e/` folder, separate from your app's `tsconfig.json`. Mixing e2e and app compiler options causes conflicts (the app typically uses `commonjs` module, while WDIO works best with `ESNext`).

---

## Adding Type References per File

For visual service commands (`browser.checkScreen`, `browser.saveScreen`, etc.), add to each spec file that uses them:

```typescript
/// <reference types="@wdio/visual-service" />
```

For Mocha globals in spec files:

```typescript
/// <reference types="mocha" />
```

For WDIO globals (`browser`, `$`, `$$`, `expect`):

```typescript
/// <reference types="@wdio/globals/types" />
```

Alternatively, include them globally via `tsconfig.json` `types` array (already shown above) so you do not need per-file triple-slash directives.

---

## Config Typing

```typescript
// wdio.conf.ts
import type { Options } from '@wdio/types'

export const config: Options.Testrunner = {
  // TypeScript will validate all config options
  runner: 'local',
  specs: ['./e2e/**/*.spec.ts'],
  maxInstances: 1,
  // ...
}
```

For a screenshots-specific config that extends the base:

```typescript
// wdio.screenshots.conf.ts
import { config as baseConfig } from './wdio.conf.js'
import type { Options } from '@wdio/types'

export const config: Options.Testrunner = {
  ...baseConfig,
  specs: ['./e2e/screenshot-crawl.spec.ts'],
  // Override or add screenshot-specific options
}
```

---

## Custom Command Types

If you add custom browser commands via `browser.addCommand()`, extend the `WebdriverIO.Browser` interface so TypeScript recognizes them:

```typescript
// e2e/types/wdio.d.ts
declare namespace WebdriverIO {
  interface Browser {
    waitForAppReady(): Promise<void>
  }
}
```

Register the custom command in a `before` hook or a WDIO setup file:

```typescript
// wdio.conf.ts
before: async () => {
  browser.addCommand('waitForAppReady', async () => {
    await $('[data-testid="app-root"]').waitForDisplayed({ timeout: 20000 })
  })
}
```

---

## How tsx Works

`tsx` is a drop-in TypeScript executor built on esbuild. WDIO uses it to run `wdio.conf.ts` and spec files without a build step:

- It **does not type-check** — it strips types and runs
- Run type checking separately: `npx tsc --noEmit --project tsconfig.json`
- Add type checking to CI as a separate step before e2e tests

```yaml
# In GitHub Actions:
- name: Type check e2e
  run: npx tsc --noEmit --project tsconfig.json

- name: Run e2e tests
  run: npm run e2e
```

---

## Common Type Errors and Fixes

| Error | Fix |
|-------|-----|
| `Property 'checkScreen' does not exist on type 'Browser'` | Add `/// <reference types="@wdio/visual-service" />` to the spec file, or add `"@wdio/visual-service"` to tsconfig types |
| `Property 'electron' does not exist on type 'Browser'` | `wdio-electron-service` types not installed or not in tsconfig types |
| `Cannot find name '$'` | Add `"@wdio/globals/types"` to tsconfig types |
| `Cannot find name 'describe'` | Add `"@wdio/mocha-framework"` to tsconfig types |
| `Type 'unknown' is not assignable to type 'string'` | Return type from `browser.execute()` is `unknown` — cast or type the callback |
| `Cannot find module './page.js'` | Use `.js` extensions in imports even for `.ts` files (ESM resolution requirement) |
| `Module resolution "node" does not support ...` | Switch `moduleResolution` to `"bundler"` or `"node16"` in tsconfig |

---

## Return Type from browser.execute

`browser.execute()` returns `unknown`. Cast the result explicitly:

```typescript
const value = await browser.execute((sel) => {
  return (document.querySelector(sel) as HTMLInputElement | null)?.value ?? ''
}, '#my-input') as string

// Or use the generic overload:
const count = await browser.execute<number>(() =>
  document.querySelectorAll('.item').length
)
```

The callback runs in the browser context (renderer process) and cannot reference variables from the Node.js test context except via serializable arguments passed as additional parameters to `browser.execute()`.

---

## Import Extensions in ESM

With `"module": "ESNext"` and `"moduleResolution": "bundler"`, TypeScript requires `.js` extensions on relative imports (even for `.ts` source files):

```typescript
// CORRECT — use .js extension
import ConfigurePage from './pages/configure.page.js'
import { waitForAppReady } from './helpers/app.js'

// WRONG — omitting extension causes runtime resolution failure
import ConfigurePage from './pages/configure.page'
```

This is a TypeScript ESM requirement: the `.js` extension in the import resolves to the `.ts` source file during development and to the compiled `.js` file after build.
