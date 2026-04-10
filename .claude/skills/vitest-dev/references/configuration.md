# Vitest Configuration

Complete reference for configuring Vitest projects.

---

## Installation

```bash
npm install -D vitest        # npm
yarn add -D vitest           # yarn
pnpm add -D vitest           # pnpm
bun add -D vitest            # bun
```

**Requirements:** Vite >= v6.0.0, Node >= v20.0.0

Add a test script to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

---

## Configuration File

Vitest reads `vite.config.ts` by default. For test-specific config, create `vitest.config.ts` (takes priority).

### Using vite.config.ts

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
```

### Using vitest.config.ts (dedicated)

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

### Merging with Vite Config

```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
  },
}))
```

---

## Key Configuration Options

### File Discovery

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `include` | `string[]` | `['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']` | Glob patterns for test files |
| `exclude` | `string[]` | `['**/node_modules/**', '**/dist/**']` | Glob patterns to exclude |
| `root` | `string` | `process.cwd()` | Project root directory |
| `dir` | `string` | same as `root` | Base directory for scanning test files |

### Execution

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `globals` | `boolean` | `false` | Enable global APIs (`describe`, `it`, `expect`) without imports |
| `environment` | `string` | `'node'` | Test environment: `'node'`, `'jsdom'`, `'happy-dom'`, `'edge-runtime'` |
| `setupFiles` | `string \| string[]` | `[]` | Files to run before each test suite |
| `globalSetup` | `string \| string[]` | `[]` | Files to run once before all test suites |
| `testTimeout` | `number` | `5000` | Default timeout per test (ms) |
| `hookTimeout` | `number` | `10000` | Default timeout per hook (ms) |
| `bail` | `number` | `0` | Stop after N failures (0 = don't bail) |
| `retry` | `number` | `0` | Retry failed tests N times |
| `sequence.concurrent` | `boolean` | `false` | Run all tests concurrently by default |
| `passWithNoTests` | `boolean` | `false` | Pass when no tests found |

### Worker Pools

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pool` | `string` | `'forks'` | Pool type: `'threads'`, `'forks'`, `'vmThreads'`, `'vmForks'` |
| `maxWorkers` | `number` | `nCPUs` | Maximum number of worker threads/processes |
| `minWorkers` | `number` | `1` | Minimum workers to keep alive |
| `fileParallelism` | `boolean` | `true` | Run test files in parallel |
| `isolate` | `boolean` | `true` | Isolate test file environments |

### Output

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `reporters` | `string[]` | `['default']` | Reporter(s): `'default'`, `'verbose'`, `'json'`, `'junit'`, `'html'`, `'dot'` |
| `outputFile` | `string \| Record` | — | Write reporter output to file |
| `silent` | `boolean` | `false` | Suppress console output from tests |

### Coverage

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `coverage.provider` | `string` | `'v8'` | Coverage provider: `'v8'` or `'istanbul'` |
| `coverage.enabled` | `boolean` | `false` | Enable coverage collection |
| `coverage.include` | `string[]` | `['**']` | Files to include in coverage |
| `coverage.exclude` | `string[]` | — | Files to exclude from coverage |
| `coverage.reporter` | `string[]` | `['text', 'html', 'clover', 'json']` | Coverage reporters |
| `coverage.thresholds` | `object` | — | Minimum coverage thresholds |
| `coverage.all` | `boolean` | `true` | Include files with no tests in coverage |

### Watch Mode

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `watch` | `boolean` | `true` (in dev) | Enable file watching |
| `forceRerunTriggers` | `string[]` | `['**/vitest.config.*']` | Files that trigger full rerun |
| `watchExclude` | `string[]` | `['**/node_modules/**']` | Exclude from file watching |

---

## Test Environments

Set globally in config or per-file with a docblock comment:

### Per-file Environment

```ts
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'

describe('DOM tests', () => {
  it('creates an element', () => {
    const el = document.createElement('div')
    expect(el).toBeDefined()
  })
})
```

### Available Environments

| Environment | Package | Use For |
|-------------|---------|---------|
| `node` | built-in | Server-side code, Node.js APIs |
| `jsdom` | `jsdom` | Browser DOM simulation (React, Vue, etc.) |
| `happy-dom` | `happy-dom` | Faster DOM simulation (fewer edge cases) |
| `edge-runtime` | `@edge-runtime/vm` | Edge/serverless runtime testing |

Install the environment package separately:

```bash
npm install -D jsdom          # for jsdom
npm install -D happy-dom      # for happy-dom
```

---

## Workspace / Projects Configuration

For monorepos, use `vitest.workspace.ts`:

```ts
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  {
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'browser',
      include: ['src/**/*.browser.test.ts'],
      environment: 'jsdom',
    },
  },
])
```

---

## TypeScript Setup

When using `globals: true`, add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

Without globals, import in each test file:

```ts
import { describe, it, expect, vi } from 'vitest'
```

---

## Setup Files

`setupFiles` run before each test file. Use for global setup:

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
```

`globalSetup` runs once before all tests start (useful for starting servers):

```ts
// global-setup.ts
export function setup() {
  // Start test server
}

export function teardown() {
  // Stop test server
}
```

<!-- References:
- https://vitest.dev/guide/
- https://vitest.dev/config/
- https://vitest.dev/guide/environment
- https://vitest.dev/guide/projects
-->
