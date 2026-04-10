# Test API Reference

Complete reference for `test`, `describe`, hooks, and test context.

---

## test() / it()

`test` and `it` are aliases. Define individual test cases.

```ts
import { test, it, expect } from 'vitest'

test('adds numbers', () => {
  expect(1 + 1).toBe(2)
})
```

### test Variants

| Variant | Description |
|---------|-------------|
| `test(name, fn, timeout?)` | Standard test |
| `test.skip(name, fn)` | Skip this test |
| `test.only(name, fn)` | Run only this test (and other `.only` tests) |
| `test.todo(name)` | Placeholder — no implementation yet |
| `test.fails(name, fn)` | Expect this test to fail (inverted assertion) |
| `test.each(cases)(name, fn)` | Run test for each data set |
| `test.for(cases)(name, fn)` | Like `each` but provides test context |
| `test.concurrent(name, fn)` | Run test concurrently with others |
| `test.sequential(name, fn)` | Force sequential execution (opt out of concurrent) |
| `test.skipIf(condition)(name, fn)` | Conditionally skip |
| `test.runIf(condition)(name, fn)` | Conditionally run |
| `test.extend({})` | Extend test context with fixtures |

### test.each — Parameterized Tests

```ts
// Array of arrays
test.each([
  [1, 1, 2],
  [1, 2, 3],
  [2, 1, 3],
])('add(%i, %i) -> %i', (a, b, expected) => {
  expect(a + b).toBe(expected)
})

// Array of objects
test.each([
  { a: 1, b: 1, expected: 2 },
  { a: 1, b: 2, expected: 3 },
])('add($a, $b) -> $expected', ({ a, b, expected }) => {
  expect(a + b).toBe(expected)
})

// Template literal
test.each`
  a    | b    | expected
  ${1} | ${1} | ${2}
  ${1} | ${2} | ${3}
`('add($a, $b) -> $expected', ({ a, b, expected }) => {
  expect(a + b).toBe(expected)
})
```

### test.for — Parameterized with Context

```ts
test.for([
  { a: 1, b: 1, expected: 2 },
  { a: 2, b: 3, expected: 5 },
])('add($a, $b)', ({ a, b, expected }, { expect }) => {
  // `expect` is scoped to this specific test instance
  expect(a + b).toBe(expected)
})
```

### test.concurrent

```ts
test.concurrent('fetches user', async () => {
  const user = await fetchUser(1)
  expect(user.name).toBeDefined()
})

test.concurrent('fetches posts', async () => {
  const posts = await fetchPosts(1)
  expect(posts).toHaveLength(5)
})
```

### test.extend — Fixtures

```ts
import { test as base } from 'vitest'

const test = base.extend({
  db: async ({}, use) => {
    const db = await createTestDB()
    await use(db)
    await db.cleanup()
  },
  user: async ({ db }, use) => {
    const user = await db.createUser({ name: 'Test' })
    await use(user)
  },
})

test('user has name', ({ user }) => {
  expect(user.name).toBe('Test')
})
```

---

## describe()

Group related tests. Can be nested.

```ts
describe('Math', () => {
  describe('addition', () => {
    test('positive numbers', () => {
      expect(1 + 1).toBe(2)
    })
  })
})
```

### describe Variants

| Variant | Description |
|---------|-------------|
| `describe(name, fn)` | Standard grouping |
| `describe.skip(name, fn)` | Skip entire group |
| `describe.only(name, fn)` | Run only this group |
| `describe.todo(name)` | Placeholder group |
| `describe.each(cases)(name, fn)` | Parameterized describe blocks |
| `describe.shuffle(name, fn)` | Randomize test order within group |
| `describe.sequential(name, fn)` | Force sequential within concurrent suite |
| `describe.concurrent(name, fn)` | Run all tests in group concurrently |
| `describe.skipIf(condition)(name, fn)` | Conditionally skip group |
| `describe.runIf(condition)(name, fn)` | Conditionally run group |

---

## Hooks

### beforeEach / afterEach

Run before/after **each test** in the current describe scope.

```ts
let db: Database

beforeEach(async () => {
  db = await createTestDB()
})

afterEach(async () => {
  await db.cleanup()
})

test('inserts records', async () => {
  await db.insert({ name: 'Alice' })
  expect(await db.count()).toBe(1)
})
```

### beforeAll / afterAll

Run once before/after **all tests** in the current describe scope.

```ts
let server: Server

beforeAll(async () => {
  server = await startServer()
})

afterAll(async () => {
  await server.close()
})
```

### Scoping Rules

- Hooks in a `describe` block apply **only** to tests within that block and nested blocks
- Top-level hooks apply to all tests in the file
- **Execution order:** `beforeAll` → (`beforeEach` → test → `afterEach`) × N → `afterAll`
- Nested: outer `beforeEach` runs before inner `beforeEach`

```ts
beforeAll(() => console.log('1 - beforeAll'))        // 1st
beforeEach(() => console.log('2 - beforeEach'))      // 2nd, 5th

test('first', () => console.log('3 - test'))          // 3rd
test('second', () => console.log('6 - test'))         // 6th

afterEach(() => console.log('4 - afterEach'))        // 4th, 7th
afterAll(() => console.log('8 - afterAll'))           // 8th
```

### Hook Return for Cleanup

Hooks can return a cleanup function (alternative to separate afterEach):

```ts
beforeEach(() => {
  const handler = setupEventHandler()
  return () => handler.dispose() // runs as cleanup after each test
})
```

---

## Test Context

Each test receives a context object as its first argument (when using callback form):

```ts
test('example', (context) => {
  // context.expect — scoped expect (for concurrent tests)
  // context.task — task metadata (name, suite, file, etc.)
  // context.skip() — programmatically skip this test
})
```

### Extending Context

Use `beforeEach` to add custom properties:

```ts
interface LocalContext {
  user: User
}

beforeEach<LocalContext>(async (context) => {
  context.user = await createUser()
})

test<LocalContext>('has user', ({ user }) => {
  expect(user).toBeDefined()
})
```

Or use `test.extend()` for fixture-based context (see above).

<!-- References:
- https://vitest.dev/api/test
- https://vitest.dev/api/describe
- https://vitest.dev/api/hooks
- https://vitest.dev/guide/test-context
- https://vitest.dev/guide/learn/writing-tests
- https://vitest.dev/guide/learn/setup-teardown
- https://vitest.dev/guide/lifecycle
-->
