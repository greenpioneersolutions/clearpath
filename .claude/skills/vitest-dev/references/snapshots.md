# Snapshot Testing

Complete reference for snapshot testing — file snapshots, inline snapshots, file-based snapshots, serializers, and updating.

---

## Core Snapshot Methods

### toMatchSnapshot()

Compares value against a stored `.snap` file. On first run, creates the snapshot. On subsequent runs, compares.

```ts
import { expect, test } from 'vitest'

test('renders correctly', () => {
  const result = renderComponent({ name: 'Alice' })
  expect(result).toMatchSnapshot()
})
```

Generated snapshot file (`__snapshots__/example.test.ts.snap`):

```js
// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html
exports['renders correctly 1'] = `
{
  "name": "Alice",
  "greeting": "Hello, Alice!"
}
`
```

### toMatchInlineSnapshot()

Stores snapshot directly in the test file. Vitest auto-inserts the value on first run.

```ts
test('to uppercase', () => {
  expect(toUpperCase('foobar')).toMatchInlineSnapshot('"FOOBAR"')
})
```

On first run with no argument, Vitest writes the snapshot string into the source code.

### toMatchFileSnapshot()

Matches against an explicit file. Useful for large outputs (HTML, SVG, etc.) where syntax highlighting matters.

```ts
test('renders HTML', async () => {
  const html = renderPage({ title: 'Hello' })
  await expect(html).toMatchFileSnapshot('./fixtures/hello.html')
})
```

**Note:** `toMatchFileSnapshot` is async — must be `await`ed.

---

## Snapshot with Dynamic Properties

Use asymmetric matchers for values that change between runs:

```ts
test('user creation', () => {
  const user = createUser('Alice')

  expect(user).toMatchSnapshot({
    id: expect.any(String),
    createdAt: expect.any(Date),
  })
})
```

The snapshot stores the matcher placeholder, not the actual value.

---

## Error Snapshots

```ts
test('throws descriptive error', () => {
  expect(() => parseConfig('')).toThrowErrorMatchingSnapshot()
})

test('throws with inline snapshot', () => {
  expect(() => parseConfig('')).toThrowErrorMatchingInlineSnapshot(
    '"Config cannot be empty"'
  )
})
```

---

## Updating Snapshots

### In Watch Mode

Press the **`u`** key when a snapshot test fails to update it interactively.

### Via CLI

```bash
vitest -u                    # update all failing snapshots
vitest --update              # same
vitest -u src/utils.test.ts  # update specific file
```

### CI Behavior

When `process.env.CI` is truthy, Vitest **does not write** snapshots. Mismatches, missing snapshots, and obsolete snapshots will fail the test run. Commit snapshot files alongside your code.

---

## Obsolete Snapshots

An obsolete snapshot is one that no longer matches any collected test (e.g., the test was renamed or removed). Vitest flags these during runs. Use `--update` to clean them up.

---

## Custom Serializers

Control how values are rendered in snapshots:

### Inline Registration

```ts
// setup.ts
expect.addSnapshotSerializer({
  test(val) {
    return val && typeof val === 'object' && 'foo' in val
  },
  serialize(val, config, indentation, depth, refs, printer) {
    return `Pretty foo: ${printer(val.foo, config, indentation, depth, refs)}`
  },
})
```

### Via Config

```ts
// custom-serializer.ts
import type { SnapshotSerializer } from 'vitest'

export default {
  test(val) { return val instanceof Date },
  serialize(val) { return `Date<${val.toISOString()}>` },
} satisfies SnapshotSerializer

// vitest.config.ts
export default defineConfig({
  test: {
    snapshotSerializers: ['./custom-serializer.ts'],
  },
})
```

---

## Snapshot Format Configuration

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    snapshotFormat: {
      printBasicPrototype: false,  // default (cleaner than Jest)
    },
  },
})
```

### Custom Snapshot Path

```ts
export default defineConfig({
  test: {
    resolveSnapshotPath: (testPath, snapExtension) => {
      return testPath.replace('__tests__', '__snapshots__') + snapExtension
    },
  },
})
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Commit `.snap` files with code | Ignore snapshots in `.gitignore` |
| Review snapshot diffs in PRs | Accept snapshot updates without reviewing |
| Use inline snapshots for small values | Use inline for large multi-line outputs |
| Use file snapshots for HTML/SVG | Store large outputs in `.snap` files |
| Use asymmetric matchers for dynamic data | Snapshot timestamps, UUIDs, etc. directly |
| Keep snapshots focused and small | Snapshot entire page/component trees |
| Name tests descriptively | Use generic test names (they become snap keys) |

---

## When to Use Snapshots vs Specific Assertions

| Use Snapshots | Use Specific Assertions |
|---------------|------------------------|
| Complex object structure validation | Specific property value checks |
| Rendered output (HTML, JSX) | Boolean/numeric results |
| Error message format | Business logic correctness |
| API response shape | Edge case behavior |
| Quick regression detection | Critical path validation |

---

## Concurrent Test Caveat

In concurrent tests, use `expect` from the test context to ensure correct snapshot detection:

```ts
test.concurrent('snapshot in concurrent', ({ expect }) => {
  expect(result).toMatchInlineSnapshot('"expected"')
})
```

<!-- References:
- https://vitest.dev/guide/snapshot
- https://vitest.dev/guide/learn/snapshots
-->
