# Common Errors & Debugging

Complete reference for troubleshooting common Vitest errors and debugging techniques.

---

## Common Errors

### Cannot find module './relative-path'

| Cause | Solution |
|-------|----------|
| Misspelled file path | Verify the path spelling |
| Missing tsconfig path resolution | Install `vite-tsconfig-paths` plugin |
| Incorrect alias config | Check `resolve.alias` in vite config |
| Relative path from wrong base | Use `new URL()` for absolute paths |

```ts
// vitest.config.ts — fix tsconfig paths
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
})
```

### Failed to Terminate Worker

| Cause | Solution |
|-------|----------|
| `fetch` used with `pool: 'threads'` | Switch to `pool: 'forks'` (default) |
| Native module in thread pool | Use `pool: 'forks'` or `pool: 'vmForks'` |

### Segfaults and Native Code Errors

Native Node.js modules aren't designed for multi-threaded execution.

**Solution:** Switch to `pool: 'forks'` which uses child processes instead of worker threads.

### Custom Package Conditions Not Resolved

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    server: {
      deps: {
        // custom conditions for package.json exports
      },
    },
  },
  ssr: {
    resolve: {
      conditions: ['custom', 'import', 'default'],
    },
  },
})
```

### Unhandled Promise Rejection

| Cause | Solution |
|-------|----------|
| Missing `await` on async call | Add `await` keyword |
| Unhandled promise in test | Use `expect().rejects` for expected rejections |

```ts
// BAD — missing await
test('fetches data', () => {
  expect(fetchData()).resolves.toBeDefined()  // no await!
})

// GOOD
test('fetches data', async () => {
  await expect(fetchData()).resolves.toBeDefined()
})
```

### Timeout Errors

```ts
// Per-test timeout
test('slow operation', async () => {
  // ...
}, 30_000)  // 30 seconds

// Global timeout in config
export default defineConfig({
  test: {
    testTimeout: 10_000,
    hookTimeout: 30_000,
  },
})
```

### Mock-Related Errors

| Error | Cause | Solution |
|-------|-------|---------|
| Mock not applied | `vi.mock` not hoisted properly | Move to top of file or use `vi.hoisted()` |
| Mock leaking between tests | Missing cleanup | Set `restoreMocks: true` in config |
| `vi.spyOn` not tracking | Called after the function was used | Spy before the code under test runs |
| Module not mocked | Wrong import path | Ensure mock path matches exact import path |

```ts
// Auto-restore mocks between tests
export default defineConfig({
  test: {
    restoreMocks: true,
  },
})
```

---

## Debugging in VS Code

### Method 1: JavaScript Debug Terminal

Fastest approach — open a **JavaScript Debug Terminal** in VS Code and run:

```bash
npx vitest --no-file-parallelism
```

Breakpoints in test files and source code will be hit automatically.

### Method 2: Launch Configuration

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Current Test File",
      "autoAttachChildProcesses": true,
      "skipFiles": ["<node_internals>/**", "**/node_modules/**"],
      "program": "${workspaceRoot}/node_modules/vitest/vitest.mjs",
      "args": ["run", "${relativeFile}"],
      "smartStep": true,
      "console": "integratedTerminal"
    }
  ]
}
```

Open a test file, select "Debug Current Test File", and press F5.

### Method 3: VS Code Vitest Extension

Install the official **Vitest VS Code extension** for inline test running and debugging with click-to-debug support.

---

## Debugging with Node.js Inspector

```bash
# Break before tests start
vitest --inspectBrk --no-file-parallelism

# Attach to running process
vitest --inspect --no-file-parallelism
```

Then open `chrome://inspect` in Chrome to connect to the debugger.

**Important flags when debugging:**
- `--no-file-parallelism` — prevents parallel execution so debugger attaches correctly
- `--testTimeout=0` — prevents timeouts while stopped at breakpoints

---

## Debugging in IntelliJ / WebStorm

Create a **Vitest** run configuration in IntelliJ IDEA or WebStorm. The IDE will pause at JavaScript/TypeScript breakpoints when running in debug mode.

---

## Debugging Strategies

| Strategy | When to Use |
|----------|-------------|
| Add `console.log` | Quick checks, narrowing down failures |
| Use `.only` to isolate | Narrow which test is failing |
| Run single file | `vitest run src/specific.test.ts` |
| Verbose reporter | `--reporter=verbose` for detailed output |
| Vitest UI | `vitest --ui` for visual test browser |
| Check test isolation | Run test alone vs. in suite to find state leaks |
| Snapshot update | `vitest -u` when snapshots intentionally changed |

---

## Quick Diagnostic Checklist

| Symptom | Check |
|---------|-------|
| Tests pass locally, fail in CI | Check `process.env.CI`, timeouts, env vars |
| Random test failures | State leaking between tests — enable `isolate: true` |
| Tests hang | Missing `await`, unresolved promises, infinite timers |
| Module not found | Check aliases, `tsconfig.json` paths, file extensions |
| Mocks not working | Check `vi.mock` path matches import path exactly |
| Slow tests | Check pool type, isolation setting, barrel imports |
| Segfault / crash | Switch to `pool: 'forks'`, check native modules |
| Coverage missing files | Set `coverage.all: true`, check `coverage.include` |

<!-- References:
- https://vitest.dev/guide/common-errors
- https://vitest.dev/guide/debugging
- https://vitest.dev/guide/learn/debugging-tests
-->
