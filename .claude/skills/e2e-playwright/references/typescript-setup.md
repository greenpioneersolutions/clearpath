# TypeScript Setup

Playwright transpiles TS internally — no `tsx`/`ts-node` wrapper needed. But Playwright **doesn't type-check** before running, so wire `tsc --noEmit` separately.

## Installed types

`@playwright/test` ships its own types — no triple-slash refs, no `@wdio/globals/types` array gymnastics.

```ts
import { test, expect, type Page, type Locator } from '@playwright/test';
```

## Project tsconfig structure

The repo already has `tsconfig.e2e.json` set up for the WDIO suite. Update or duplicate it for Playwright:

```jsonc
// tsconfig.playwright.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ESNext", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "out/e2e",
    "rootDir": ".",
    "types": ["@playwright/test", "node"]   // remove wdio/mocha
  },
  "include": [
    "e2e/**/*.ts",
    "playwright.config.ts",
    "playwright.screenshots.config.ts"
  ]
}
```

Then in `package.json`:
```json
"scripts": {
  "typecheck:e2e": "tsc -p tsconfig.playwright.json --noEmit"
}
```

## Why a separate tsconfig

The app's main `tsconfig.json` may use `"module": "commonjs"` (or different rootDir/outDir). Mixing test files in there can cause "duplicate identifier" or "module conflict" errors. A scoped tsconfig keeps Playwright code isolated.

## `--tsconfig` flag

Playwright auto-picks up the closest `tsconfig.json`. To force a specific one for loading tests:

```bash
npx playwright test --tsconfig=tsconfig.playwright.json
```

Or in config:
```ts
// playwright.config.ts
export default defineConfig({
  tsconfig: './tsconfig.playwright.json',
});
```

⚠️ The `tsconfig:` field applies to **loading test files**, not to loading `playwright.config.ts` itself. If you need a tsconfig for the config file, use the CLI flag.

## What Playwright actually honors

Even with a tsconfig, Playwright internally uses esbuild and only respects:
- `allowJs`
- `baseUrl`
- `paths`
- `references`

Other options (`strict`, `noUnusedLocals`, `target`, etc.) are ignored at runtime. **Playwright will run a test even if `tsc --noEmit` fails.** Run typecheck as a separate CI step:

```yaml
- run: npx tsc -p tsconfig.playwright.json --noEmit
- run: npx playwright test
```

## ESM vs CommonJS

Playwright supports both. The recommended setup is ESM:
- `package.json` has `"type": "module"` (the project does — main is `out/main/index.js` which is ESM)
- `module: NodeNext` in tsconfig
- `.js` extensions on relative imports inside `.ts` files:
  ```ts
  import { setInputValue } from './helpers/app.js';   // note .js
  ```

If `tsconfig.json` uses `"module": "NodeNext"`, the `.js` extension on imports is **required** (TS resolves it the same way Node does at runtime).

## Path aliases

```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@e2e/*": ["e2e/*"]
    }
  }
}
```

Then:
```ts
import { test, expect } from '@e2e/fixtures';
```

Playwright respects `paths` because esbuild does.

## Typed fixtures

Use generic type parameters on `test.extend()` so tests get proper IntelliSense:

```ts
import { test as base, type Page, type ElectronApplication } from '@playwright/test';

type WorkerFixtures = { electronApp: ElectronApplication };
type TestFixtures = { page: Page; sessionsPage: SessionsPage };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  electronApp: [/* ... */, { scope: 'worker' }],
  page: /* ... */,
  sessionsPage: async ({ page }, use) => use(new SessionsPage(page)),
});
```

Tests then get autocomplete on `{ electronApp, page, sessionsPage }`.

## Typing `page.evaluate` / `electronApp.evaluate`

Both methods are generic — explicitly parameterize for clean return types:

```ts
const userDataPath = await electronApp.evaluate<string>(({ app }) => app.getPath('userData'));

const sessions = await page.evaluate<{ id: string; name: string }[]>(([ch, a]) =>
  (window as any).electronAPI.invoke(ch, a),
  ['cli:list-sessions', null] as const,
);
```

Without the generic, the return type defaults to `Serializable` (basically `unknown`).

## `(window as any).electronAPI` — typing the bridge

If you have a `electronAPI.d.ts` in the renderer source:
```ts
// src/renderer/types/electronAPI.d.ts
declare global {
  interface Window {
    electronAPI: {
      invoke<T = unknown>(channel: string, args?: unknown): Promise<T>;
    };
  }
}
export {};
```

Reference it from the e2e tsconfig:
```jsonc
{
  "compilerOptions": {
    "types": ["@playwright/test", "node"]
  },
  "include": [
    "e2e/**/*.ts",
    "src/renderer/types/electronAPI.d.ts"
  ]
}
```

Then:
```ts
const sessions = await page.evaluate(() => window.electronAPI.invoke<{id:string;name:string}[]>('cli:list-sessions'));
```

(No `as any` cast.)

## Common TS errors and fixes

| Error | Fix |
|-------|-----|
| `Cannot find module 'X' or its corresponding type declarations.` | Add `.js` extension to the import (NodeNext requirement) |
| `Module '"playwright"' has no exported member '_electron'.` | Import from `@playwright/test`: `import { _electron as electron } from '@playwright/test'` |
| `Property 'evaluate' does not exist on type 'unknown'` | Generic missing: `page.evaluate<MyType>(...)` |
| `expect(...).toBeVisible is not a function` | Wrong `expect` import — use `from '@playwright/test'` |
| `Argument of type '...' is not assignable to parameter of type 'Locator'` | Pass a `Locator`, not an `ElementHandle` or string |
| `'this' implicitly has type 'any'` in `expect.extend` matcher | Type the matcher's first param: `function (this: ExpectMatcherState, locator: Locator) {...}` |

## Troubleshooting `tsx` vs Playwright loader

Don't run Playwright through `tsx` (the Node TS loader the WDIO setup used) — it's redundant and can cause double-loading. Use `npx playwright test` directly; Playwright handles TS internally.

## Linting tip

ESLint with `@typescript-eslint` works fine. Add a rule to ban `await page.waitForTimeout()` so tests stay deterministic:

```jsonc
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.property.name='waitForTimeout']",
        "message": "Use expect() web-first assertions instead of waitForTimeout."
      }
    ]
  }
}
```
