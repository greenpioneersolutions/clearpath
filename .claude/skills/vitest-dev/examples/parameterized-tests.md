# Pattern: Parameterized Tests

Complete examples using `test.each`, `test.for`, `describe.each`, and template literals for data-driven testing.

---

## test.each — Array of Arrays

Printf-style formatting: `%s` string, `%i` integer, `%d` number, `%o` object, `%j` JSON.

```ts
import { test, expect } from 'vitest'

test.each([
  [1, 1, 2],
  [1, 2, 3],
  [2, 2, 4],
  [0, 0, 0],
  [-1, 1, 0],
])('add(%i, %i) = %i', (a, b, expected) => {
  expect(a + b).toBe(expected)
})
```

## test.each — Array of Objects

Use `$property` interpolation in the test name:

```ts
test.each([
  { input: '',        expected: false, label: 'empty string' },
  { input: 'a@b.com', expected: true,  label: 'valid email' },
  { input: 'no-at',   expected: false, label: 'missing @' },
  { input: '@no-user', expected: false, label: 'missing user' },
])('validateEmail($label) -> $expected', ({ input, expected }) => {
  expect(isValidEmail(input)).toBe(expected)
})
```

## test.each — Template Literal

```ts
test.each`
  a    | b    | expected
  ${1} | ${1} | ${2}
  ${1} | ${2} | ${3}
  ${2} | ${1} | ${3}
`('add($a, $b) = $expected', ({ a, b, expected }) => {
  expect(a + b).toBe(expected)
})
```

## test.for — With Test Context

Like `test.each` but provides the test context as the second argument. Useful for concurrent parameterized tests:

```ts
test.for([
  { a: 1, b: 1, expected: 2 },
  { a: 2, b: 3, expected: 5 },
  { a: -1, b: 1, expected: 0 },
])('add($a, $b) = $expected', ({ a, b, expected }, { expect }) => {
  // `expect` is scoped to this specific test instance
  expect(a + b).toBe(expected)
})
```

## describe.each — Parameterized Suites

Run an entire describe block for each data set:

```ts
describe.each([
  { role: 'admin', canDelete: true, canEdit: true },
  { role: 'editor', canDelete: false, canEdit: true },
  { role: 'viewer', canDelete: false, canEdit: false },
])('role: $role', ({ role, canDelete, canEdit }) => {
  let user: User

  beforeEach(() => {
    user = createUser({ role })
  })

  test(`canDelete is ${canDelete}`, () => {
    expect(user.canDelete()).toBe(canDelete)
  })

  test(`canEdit is ${canEdit}`, () => {
    expect(user.canEdit()).toBe(canEdit)
  })
})
```

## Real-World Example: Validation Rules

```ts
import { describe, test, expect } from 'vitest'
import { validate } from './validators'

describe('password validation', () => {
  test.each([
    { password: '',           error: 'required' },
    { password: 'short',      error: 'min_length' },
    { password: 'a'.repeat(200), error: 'max_length' },
    { password: 'nouppercase1!', error: 'uppercase' },
    { password: 'NOLOWERCASE1!', error: 'lowercase' },
    { password: 'NoNumbers!',    error: 'number' },
  ])('rejects "$password" with $error', ({ password, error }) => {
    const result = validate(password)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(error)
  })

  test.each([
    'ValidPass1!',
    'Another$ecure2',
    'Str0ng&Pass',
  ])('accepts "%s"', (password) => {
    expect(validate(password).valid).toBe(true)
  })
})
```

**Why this works:** Parameterized tests reduce duplication and make it easy to add new test cases — just add a row to the data array. Use `test.each` for most cases, `test.for` when you need the test context (concurrent tests), and `describe.each` when you need per-case setup/teardown.

<!-- References:
- https://vitest.dev/api/test
- https://vitest.dev/guide/learn/writing-tests
-->
