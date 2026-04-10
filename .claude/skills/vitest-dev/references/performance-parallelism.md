# Performance & Parallelism

Complete reference for worker pools, parallel execution, sharding, and performance optimization.

---

## Worker Pool Types

| Pool | Mechanism | Isolation | Best For |
|------|-----------|-----------|----------|
| `forks` (default) | Child processes | Full process isolation | Compatibility, native modules |
| `threads` | Worker threads | Thread isolation | Speed on large projects |
| `vmForks` | Child processes + VM | VM context isolation | Compatibility + fast startup |
| `vmThreads` | Worker threads + VM | VM context isolation | Speed + isolation (cannot disable isolate) |

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    pool: 'forks',    // default — safest
    // pool: 'threads', // faster for many projects
  },
})
```

**Tip:** If you hit segfaults with `threads` (native modules), switch to `forks`.

---

## File-Level Parallelism

By default, test files run in parallel across workers.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fileParallelism` | `boolean` | `true` | Run test files in parallel |
| `maxWorkers` | `number` | CPU count | Maximum number of workers |
| `minWorkers` | `number` | `1` | Minimum workers to keep alive |
| `isolate` | `boolean` | `true` | Isolate each test file's environment |

```ts
export default defineConfig({
  test: {
    fileParallelism: true,
    maxWorkers: 4,
    isolate: true,
  },
})
```

**Disable parallelism** when debugging or when tests share state:

```bash
vitest --no-file-parallelism
```

---

## Test-Level Parallelism

Tests within a file run sequentially by default. Use `concurrent` for parallel:

```ts
test.concurrent('fetch user', async () => {
  const user = await fetchUser(1)
  expect(user).toBeDefined()
})

test.concurrent('fetch posts', async () => {
  const posts = await fetchPosts(1)
  expect(posts).toHaveLength(5)
})
```

### describe.concurrent

Make all tests in a suite concurrent:

```ts
describe.concurrent('API tests', () => {
  test('users endpoint', async () => { ... })
  test('posts endpoint', async () => { ... })
  test('comments endpoint', async () => { ... })
})
```

### Global Concurrency

```ts
export default defineConfig({
  test: {
    sequence: { concurrent: true },  // all tests concurrent
    maxConcurrency: 10,              // limit simultaneous tests
  },
})
```

**Important:** `test.concurrent` only helps with async tests. Synchronous concurrent tests still run sequentially within the same worker — no additional workers are created.

---

## Isolation Modes

| Mode | Config | Behavior |
|------|--------|----------|
| Full isolation (default) | `isolate: true` | Each test file gets a clean module state |
| No isolation | `isolate: false` | Files share module state within same worker |

```ts
export default defineConfig({
  test: {
    isolate: false,  // faster, but tests can leak state
  },
})
```

**Selective isolation** using projects:

```ts
// vitest.workspace.ts
export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts'],
      isolate: false,  // fast, no side effects
    },
  },
  {
    test: {
      name: 'integration',
      include: ['tests/**/*.test.ts'],
      isolate: true,  // safe, may have side effects
    },
  },
])
```

---

## Sharding (CI)

Split test files across multiple CI machines:

```bash
# Machine 1
vitest run --shard=1/3 --reporter=blob

# Machine 2
vitest run --shard=2/3 --reporter=blob

# Machine 3
vitest run --shard=3/3 --reporter=blob

# Merge step
vitest --merge-reports
```

### GitHub Actions Example

```yaml
jobs:
  test:
    strategy:
      matrix:
        shard: [1/3, 2/3, 3/3]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx vitest run --shard=${{ matrix.shard }} --reporter=blob
      - uses: actions/upload-artifact@v4
        with:
          name: blob-${{ strategy.job-index }}
          path: .vitest-reports/

  merge:
    needs: test
    steps:
      - uses: actions/download-artifact@v4
      - run: npx vitest --merge-reports
```

---

## Performance Optimization Tips

### 1. Choose the Right Pool

```ts
pool: 'threads'  // try this first — often faster than 'forks'
```

### 2. Disable Isolation (When Safe)

```ts
test: {
  isolate: false,  // significant speedup if tests don't leak state
}
```

### 3. Limit Search Directory

```ts
test: {
  dir: 'src',  // don't scan unrelated directories
}
```

### 4. Enable Filesystem Module Cache

```ts
test: {
  experimental: {
    fsModuleCache: true,  // persist transformed file cache across reruns
  },
}
```

### 5. Avoid Barrel Imports

```ts
// SLOW — imports entire module tree
import { Button } from './components'

// FAST — imports only what's needed
import { Button } from './components/Button'
```

### 6. Disable File Parallelism (Sometimes)

For projects with few test files but heavy startup costs:

```ts
test: {
  fileParallelism: false,  // reduces Vite server overhead
}
```

### 7. Shard on High-CPU Machines

On machines with many cores, sharding balances load across multiple Vite servers:

```bash
VITEST_MAX_WORKERS=4 vitest --shard=1/2 &
VITEST_MAX_WORKERS=4 vitest --shard=2/2 &
```

---

## Profiling Test Performance

```bash
# Time metrics
vitest run --reporter=verbose

# Identify slow tests
vitest run --slowTestThreshold=100

# Heap usage per test
vitest run --logHeapUsage

# CPU profiling
vitest run --no-file-parallelism --inspect
# Then open chrome://inspect
```

---

## Quick Decision Matrix

| Scenario | Recommendation |
|----------|---------------|
| Default / safe starting point | `pool: 'forks'`, `isolate: true` |
| Need speed, no native modules | `pool: 'threads'`, `isolate: false` |
| CI with many machines | Add `--shard=X/Y` |
| Tests share global state | Keep `isolate: true` |
| Debugging | `--no-file-parallelism --inspect-brk` |
| Heavy async tests | Use `test.concurrent` |

<!-- References:
- https://vitest.dev/guide/parallelism
- https://vitest.dev/guide/improving-performance
- https://vitest.dev/guide/profiling-test-performance
-->
