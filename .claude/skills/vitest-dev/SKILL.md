---
name: vitest-dev
description: Comprehensive Vitest testing guide — test API, matchers, mocking, snapshots, configuration, CLI, coverage, and debugging. Activates when writing or reviewing Vitest test files.
user-invocable: false
paths: "**/*.test.ts, **/*.test.tsx, **/*.test.js, **/*.test.jsx, **/*.spec.ts, **/*.spec.tsx, **/*.spec.js, **/*.spec.jsx, **/vitest.config.*, **/vitest.workspace.*, **/vitest.setup.*"
allowed-tools: Read Grep Glob
---

# Vitest Development Guide

Standing guidance for writing and reviewing tests with Vitest. Apply these conventions whenever working with test files, vitest configuration, or test-related code.

---

## Quick Reference

| Need | Import |
|------|--------|
| Test functions | `import { describe, test, it, expect } from 'vitest'` |
| Mocking | `import { vi } from 'vitest'` |
| Hooks | `import { beforeEach, afterEach, beforeAll, afterAll } from 'vitest'` |
| Globals mode | Add `globals: true` to config, then no imports needed |

## Core Testing Pattern

```ts
import { describe, test, expect } from 'vitest'

describe('ModuleName', () => {
  test('does the expected thing', () => {
    const result = functionUnderTest(input)
    expect(result).toBe(expectedValue)
  })
})
```

## Key Conventions

- **File naming:** `*.test.ts` or `*.spec.ts`, co-located with source files
- **Matcher choice:** `toBe` for primitives, `toEqual` for objects/arrays, `toStrictEqual` for type-exact comparison
- **Async tests:** Always `await` the `expect` — `await expect(promise).resolves.toBe(value)`
- **Exception tests:** Wrap in arrow function — `expect(() => fn()).toThrow()`
- **Mock cleanup:** Set `restoreMocks: true` in config or call `vi.restoreAllMocks()` in `afterEach`
- **Timer tests:** Always pair `vi.useFakeTimers()` in `beforeEach` with `vi.useRealTimers()` in `afterEach`
- **Module mocking:** `vi.mock()` is hoisted — use `vi.hoisted()` for variables in mock factories

## Configuration Quick Start

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',             // or 'node', 'happy-dom'
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
```

---

## Reference Materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/test-api.md](references/test-api.md) | `test`, `describe`, hooks, test context, fixtures | Writing tests, using hooks, or setting up test context |
| [references/expect-matchers.md](references/expect-matchers.md) | All matchers, asymmetric matchers, `expect.extend` | Choosing the right assertion or creating custom matchers |
| [references/vi-utility.md](references/vi-utility.md) | `vi` object — fn, spyOn, mock, timers, stubs | Using any `vi.*` method |
| [references/mocking-functions.md](references/mocking-functions.md) | `vi.fn()`, `vi.spyOn()`, mock assertions, classes | Mocking functions, spying on methods, or testing classes |
| [references/mocking-modules.md](references/mocking-modules.md) | `vi.mock()`, partial mocking, `vi.hoisted()`, `__mocks__` | Mocking imports, modules, or third-party packages |
| [references/mocking-timers-dates.md](references/mocking-timers-dates.md) | Fake timers, `setSystemTime`, timer API | Testing setTimeout, setInterval, debounce, or date-dependent code |
| [references/mocking-globals-requests.md](references/mocking-globals-requests.md) | `vi.stubGlobal`, `vi.stubEnv`, MSW, fetch mocking | Mocking globals, env vars, or HTTP requests |
| [references/snapshots.md](references/snapshots.md) | Snapshot types, serializers, updating, best practices | Using snapshot testing or configuring snapshot behavior |
| [references/configuration.md](references/configuration.md) | Config file, environments, workspaces, TypeScript setup | Setting up or modifying vitest configuration |
| [references/cli-filtering.md](references/cli-filtering.md) | CLI commands, flags, test filtering, tags | Running specific tests, filtering, or using CLI options |
| [references/coverage.md](references/coverage.md) | Coverage providers, reporters, thresholds | Setting up or reviewing code coverage |
| [references/performance-parallelism.md](references/performance-parallelism.md) | Worker pools, concurrency, sharding, optimization | Improving test speed or configuring parallel execution |
| [references/common-errors-debugging.md](references/common-errors-debugging.md) | Error solutions, VS Code debugging, Node inspector | Troubleshooting test failures or setting up debugging |

## Example Code

| File | Pattern | Use when... |
|------|---------|-------------|
| [examples/basic-unit-test.md](examples/basic-unit-test.md) | Equality, truthiness, numbers, strings, arrays, exceptions | Writing basic assertions for any value type |
| [examples/async-testing.md](examples/async-testing.md) | async/await, .resolves/.rejects, callbacks, assertion count | Testing async functions, promises, or API calls |
| [examples/parameterized-tests.md](examples/parameterized-tests.md) | `test.each`, `test.for`, `describe.each`, template literals | Running the same test with multiple data sets |
| [examples/setup-organization.md](examples/setup-organization.md) | Hooks, nested describe, setup files, file organization | Structuring test suites or configuring shared setup |
| [examples/mock-functions.md](examples/mock-functions.md) | `vi.fn()`, return values, spying, callback mocking | Mocking functions or verifying call behavior |
| [examples/mock-modules.md](examples/mock-modules.md) | `vi.mock()`, partial mocking, factory functions, `vi.hoisted()` | Mocking module imports or third-party packages |
| [examples/timer-date-mocking.md](examples/timer-date-mocking.md) | Fake timers, debounce testing, `setSystemTime` | Testing time-dependent or date-dependent code |
| [examples/snapshot-testing.md](examples/snapshot-testing.md) | File, inline, and file-based snapshots, dynamic properties | Validating complex output or detecting regressions |

<!--
## References

Sources used to compile this skill:

### API Reference
- https://vitest.dev/api/expect
- https://vitest.dev/api/vi
- https://vitest.dev/api/test
- https://vitest.dev/api/describe
- https://vitest.dev/api/hooks

### Guides
- https://vitest.dev/guide/
- https://vitest.dev/guide/learn/writing-tests
- https://vitest.dev/guide/learn/matchers
- https://vitest.dev/guide/learn/async
- https://vitest.dev/guide/learn/setup-teardown
- https://vitest.dev/guide/learn/mock-functions
- https://vitest.dev/guide/learn/snapshots
- https://vitest.dev/guide/learn/debugging-tests
- https://vitest.dev/guide/cli
- https://vitest.dev/guide/filtering
- https://vitest.dev/guide/test-tags
- https://vitest.dev/guide/test-context
- https://vitest.dev/guide/environment
- https://vitest.dev/guide/lifecycle
- https://vitest.dev/guide/snapshot
- https://vitest.dev/guide/mocking
- https://vitest.dev/guide/mocking/functions
- https://vitest.dev/guide/mocking/modules
- https://vitest.dev/guide/mocking/timers
- https://vitest.dev/guide/mocking/dates
- https://vitest.dev/guide/mocking/globals
- https://vitest.dev/guide/mocking/requests
- https://vitest.dev/guide/mocking/classes
- https://vitest.dev/guide/mocking/file-system
- https://vitest.dev/guide/parallelism
- https://vitest.dev/guide/improving-performance
- https://vitest.dev/guide/profiling-test-performance
- https://vitest.dev/guide/coverage
- https://vitest.dev/guide/reporters
- https://vitest.dev/guide/extending-matchers
- https://vitest.dev/guide/common-errors
- https://vitest.dev/guide/debugging
- https://vitest.dev/guide/projects
- https://vitest.dev/config/
-->
