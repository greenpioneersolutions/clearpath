# Organizing Test Suites

## Spec File Pattern

Each spec file maps to one feature area. Keep files focused — a spec file that tests everything becomes hard to maintain and slow to run:

```
e2e/
├── smoke.spec.ts                    ← critical path (quick CI check)
├── home.spec.ts                     ← Home / Dashboard page tests
├── navigation.spec.ts               ← Sidebar navigation
├── work-page.spec.ts                ← Work page feature tests
├── insights.spec.ts                 ← Insights page
├── configure.spec.ts                ← Configure page tabs
├── accessibility.spec.ts            ← a11y checks
├── app-lifecycle.spec.ts            ← launch, quit, window events
├── screenshot-crawl.spec.ts         ← visual regression (separate config)
└── extensions-integration.spec.ts   ← packaged extension tests (separate run)
```

---

## Suites Configuration

Group spec files into named suites in `wdio.conf.ts`. Suites let you run a targeted subset without listing individual files:

```typescript
// wdio.conf.ts
export const config: Options.Testrunner = {
  specs: ['./e2e/**/*.spec.ts'],

  suites: {
    smoke: ['./e2e/smoke.spec.ts'],
    navigation: ['./e2e/navigation.spec.ts', './e2e/home.spec.ts'],
    configure: ['./e2e/configure.spec.ts'],
    full: ['./e2e/**/*.spec.ts'],
  },
}
```

Run a suite: `npx wdio run wdio.conf.ts --suite smoke`

---

## CLI Flags for Running Subsets

```bash
# Single spec file
npx wdio run wdio.conf.ts --spec e2e/home.spec.ts

# Multiple spec files (repeat the flag)
npx wdio run wdio.conf.ts --spec e2e/home.spec.ts --spec e2e/work-page.spec.ts

# Named suite
npx wdio run wdio.conf.ts --suite smoke

# Exclude a file
npx wdio run wdio.conf.ts --exclude e2e/app-lifecycle.spec.ts

# Stop after first failure
npx wdio run wdio.conf.ts --bail 1

# Repeat spec N times (flaky test validation)
npx wdio run wdio.conf.ts --spec e2e/home.spec.ts --repeat 5
```

---

## Sequential Groups

By default, WDIO runs each spec file as a separate task and (if `maxInstances > 1`) distributes them across parallel workers. For Electron this is always `maxInstances: 1`, so specs run sequentially anyway. However, you can explicitly group spec files that must share a browser session:

```typescript
// wdio.conf.ts
specs: [
  // These two run sequentially in the same worker (shared browser session)
  ['./e2e/configure.spec.ts', './e2e/accessibility.spec.ts'],
  // These run independently as separate tasks
  './e2e/home.spec.ts',
  './e2e/navigation.spec.ts',
],
```

Use sequential groups when:
- Test B depends on state left by test A (e.g., a session that test A created)
- You want to amortize app startup time across multiple small spec files

Avoid sequential groups when possible — independent specs are easier to debug in isolation.

---

## maxInstances

For Electron: always `maxInstances: 1`. Electron opens one app window — multiple parallel instances would conflict on the same display server and file system state.

```typescript
// wdio.conf.ts
maxInstances: 1,
maxInstancesPerCapability: 1,
```

---

## Retry Configuration

```typescript
// wdio.conf.ts
specFileRetries: 2,               // retry failed spec file up to 2 times
specFileRetriesDelay: 1,          // wait 1 second before retry
specFileRetriesDeferred: false,   // false = retry immediately; true = retry after all others complete

// Mocha per-test retry (use sparingly — fix flaky tests instead)
mochaOpts: {
  retries: 1,  // retry individual failed it() once
}
```

Prefer `specFileRetries` over `mochaOpts.retries`. Retrying at the spec-file level re-launches the Electron app cleanly, which is more reliable than retrying a single `it()` block within an already-running session.

---

## Watch Mode (TDD)

```bash
# Watch spec files — re-run on save
npx wdio run wdio.conf.ts --spec e2e/home.spec.ts --watch

# Watch both spec AND app source files
# Add to wdio.conf.ts:
filesToWatch: ['./src/**/*.ts', './src/**/*.tsx'],
```

Watch mode is useful during local development but should not run in CI.

---

## Sharding for CI

Distribute specs across multiple CI runners using `--shard`. WDIO splits the full spec list and assigns each runner its slice:

```bash
# Runner 1 of 3:
npx wdio run wdio.conf.ts --shard=1/3

# Runner 2 of 3:
npx wdio run wdio.conf.ts --shard=2/3

# Runner 3 of 3:
npx wdio run wdio.conf.ts --shard=3/3
```

GitHub Actions matrix example:

```yaml
strategy:
  matrix:
    shard: [1, 2, 3]
steps:
  - run: npx wdio run wdio.conf.ts --shard=${{ matrix.shard }}/3
```

Note: sharding is only useful when you have many spec files and enough CI runners to parallelize across. For small test suites (under ~10 specs), the overhead of spinning up multiple runners outweighs the time saved.

---

## Separating Screenshot Tests

Screenshot regression tests run on a separate WDIO config and separate npm script. This keeps them out of the default test run and avoids polluting standard test output with pixel-diff failures:

```typescript
// wdio.screenshots.conf.ts — extends base config
import { config as baseConfig } from './wdio.conf.js'

export const config = {
  ...baseConfig,
  specs: ['./e2e/screenshot-crawl.spec.ts'],
  services: [
    ...baseConfig.services,
    ['visual', { baselineFolder: './e2e/screenshots/baseline' }],
  ],
}
```

```json
// package.json scripts
{
  "e2e": "wdio run wdio.conf.ts",
  "e2e:screenshots": "wdio run wdio.screenshots.conf.ts",
  "e2e:screenshots:update": "wdio run wdio.screenshots.conf.ts --updateBaseline"
}
```

---

## Smoke Spec Design

The smoke suite should cover the critical path only — enough to confirm the app launches and core navigation works. Keep it under 30 seconds:

```typescript
// e2e/smoke.spec.ts
import { waitForAppReady, navigateSidebarTo } from './helpers/app.js'

describe('Smoke', () => {
  before(async () => {
    await waitForAppReady()
  })

  it('app launches and renders', async () => {
    const root = await $('[data-testid="app-root"]')
    await expect(root).toBeDisplayed()
  })

  it('sidebar navigation works', async () => {
    await navigateSidebarTo('Work')
    const workArea = await $('[data-testid="work-area"]')
    await expect(workArea).toBeDisplayed()
  })
})
```
