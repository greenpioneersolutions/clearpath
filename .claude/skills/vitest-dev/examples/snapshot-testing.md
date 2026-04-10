# Pattern: Snapshot Testing

Complete examples for file snapshots, inline snapshots, file-based snapshots, and dynamic content handling.

---

## Basic toMatchSnapshot

```ts
import { test, expect } from 'vitest'

function renderCard(user: { name: string; role: string }) {
  return {
    tag: 'div',
    className: 'card',
    children: [
      { tag: 'h2', text: user.name },
      { tag: 'span', className: 'badge', text: user.role },
    ],
  }
}

test('renders user card', () => {
  const card = renderCard({ name: 'Alice', role: 'Admin' })
  expect(card).toMatchSnapshot()
})
```

First run creates `__snapshots__/example.test.ts.snap`. Subsequent runs compare against it.

## Inline Snapshots

Snapshot stored directly in the test file — Vitest auto-inserts the value:

```ts
test('string transformation', () => {
  expect('hello world'.toUpperCase()).toMatchInlineSnapshot('"HELLO WORLD"')
})

test('object shape', () => {
  const result = { status: 'ok', count: 3 }
  expect(result).toMatchInlineSnapshot(`
    {
      "count": 3,
      "status": "ok",
    }
  `)
})
```

On first run with no argument, Vitest writes the snapshot into your source code.

## File Snapshots

Match against an explicit file — great for large HTML/SVG output:

```ts
test('renders HTML page', async () => {
  const html = renderPage({ title: 'Hello', body: '<p>World</p>' })
  await expect(html).toMatchFileSnapshot('./fixtures/hello-page.html')
})
```

**Note:** `toMatchFileSnapshot` is async and must be `await`ed.

## Handling Dynamic Properties

Use asymmetric matchers for values that change between runs:

```ts
test('user creation snapshot', () => {
  const user = createUser('Alice')

  // Snapshot captures structure, matchers handle dynamic values
  expect(user).toMatchSnapshot({
    id: expect.any(String),
    createdAt: expect.any(Date),
    updatedAt: expect.any(Date),
  })
})
```

## Error Message Snapshots

```ts
test('throws descriptive error', () => {
  expect(() => parseConfig('')).toThrowErrorMatchingSnapshot()
})

test('error with inline snapshot', () => {
  expect(() => parseConfig(null as any))
    .toThrowErrorMatchingInlineSnapshot('"Config must be a string"')
})
```

## Updating Snapshots

```bash
# Update all failing snapshots
vitest -u

# In watch mode, press 'u' when a snapshot fails
```

## When to Use (and Not Use) Snapshots

**Good uses:**
- Validating complex object structures
- Rendered output (HTML, JSX, component trees)
- Error message formatting
- API response shapes
- Quick regression detection

**Avoid snapshots for:**
- Specific boolean/numeric assertions (use `toBe`)
- Business logic correctness (use specific matchers)
- Frequently changing output (creates noisy diffs)
- Very large snapshots (hard to review in PRs)

## Concurrent Test Caveat

In concurrent tests, use the scoped `expect` from test context:

```ts
test.concurrent('snapshot in concurrent test', ({ expect }) => {
  expect({ key: 'value' }).toMatchInlineSnapshot(`
    {
      "key": "value",
    }
  `)
})
```

**Why this works:** Snapshots capture the serialized output once and verify it doesn't change. Inline snapshots keep expected values visible in the test file. File snapshots give syntax highlighting for large outputs. Always review snapshot diffs in PRs — don't blindly accept updates.

<!-- References:
- https://vitest.dev/guide/snapshot
- https://vitest.dev/guide/learn/snapshots
-->
