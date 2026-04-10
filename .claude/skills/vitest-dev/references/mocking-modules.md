# Mocking Modules

Complete reference for module mocking with `vi.mock()`, `vi.doMock()`, partial mocking, and the `__mocks__` directory.

---

## vi.mock() — Automatic & Manual Module Mocking

`vi.mock()` calls are **hoisted** to the top of the file. They execute before any imports.

### Auto-Mock (No Factory)

```ts
import { fetchUser } from './api'

vi.mock('./api')  // all exports become vi.fn() returning undefined

test('auto-mocked', () => {
  fetchUser()  // vi.fn() — no real network call
  expect(fetchUser).toHaveBeenCalled()
})
```

Auto-mock behavior:
- Functions become `vi.fn()` returning `undefined`
- Arrays become empty `[]`
- Primitives remain unchanged
- Objects are deeply cloned with functions mocked
- Class instances/prototypes are cloned

### Factory Function

```ts
vi.mock('./api', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
  fetchPosts: vi.fn().mockResolvedValue([]),
}))
```

### Spy Mode (Track Without Replacing)

```ts
vi.mock('./utils', { spy: true })

import { format } from './utils'

test('real impl but tracked', () => {
  const result = format('hello')  // original implementation runs
  expect(format).toHaveBeenCalledWith('hello')
})
```

---

## Partial Mocking with importOriginal

Keep some real implementations while mocking others:

```ts
vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils')>()
  return {
    ...actual,                            // keep everything
    formatDate: vi.fn(() => '2024-01-01'), // override this one
  }
})
```

**Note:** `importOriginal` is async and must be awaited.

---

## vi.hoisted() — Variables for Mock Factories

Since `vi.mock()` is hoisted above imports, you can't reference variables declared after it. Use `vi.hoisted()` to declare variables that are also hoisted:

```ts
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('./api', () => ({
  fetchData: mockFetch,
}))

test('uses hoisted mock', async () => {
  const { fetchData } = await import('./api')
  await fetchData()
  expect(mockFetch).toHaveBeenCalled()
})
```

---

## vi.doMock() — Non-Hoisted Mocking

Not hoisted — affects only the **next** dynamic `import()`. Useful for per-test mock variations:

```ts
test('variation A', async () => {
  vi.doMock('./config', () => ({ theme: 'dark' }))
  const { theme } = await import('./config')
  expect(theme).toBe('dark')
})

test('variation B', async () => {
  vi.doMock('./config', () => ({ theme: 'light' }))
  const { theme } = await import('./config')
  expect(theme).toBe('light')
})
```

Use `vi.doUnmock()` to undo a `vi.doMock()`.

---

## vi.unmock() / vi.doUnmock()

```ts
vi.unmock('./api')    // hoisted — removes module from mock registry
vi.doUnmock('./api')  // not hoisted — unmocks next dynamic import
```

---

## vi.importActual() / vi.importMock()

```ts
// Inside a mock factory — get the real module
vi.mock('./math', async () => {
  const actual = await vi.importActual('./math')
  return { ...actual, add: vi.fn() }
})

// Get the auto-mocked version programmatically
const mocked = await vi.importMock('./math')
```

---

## vi.resetModules()

Clears the module cache so next imports get fresh instances:

```ts
beforeEach(() => {
  vi.resetModules()
})

test('fresh module each time', async () => {
  vi.doMock('./counter', () => ({ count: 0 }))
  const { count } = await import('./counter')
  expect(count).toBe(0)
})
```

---

## __mocks__ Directory

Place manual mock files in a `__mocks__` directory alongside the module:

```
src/
├── api.ts
├── __mocks__/
│   └── api.ts       <- manual mock
└── tests/
    └── api.test.ts
```

```ts
// src/__mocks__/api.ts
export const fetchUser = vi.fn().mockResolvedValue({ id: 1 })

// src/tests/api.test.ts
vi.mock('../api')  // uses __mocks__/api.ts automatically
```

For Node.js built-in modules, place `__mocks__` at the project root:

```
__mocks__/
└── fs.ts           <- mocks 'fs' module
src/
└── ...
```

---

## Mocking Default Exports

```ts
// Named export mock
vi.mock('./api', () => ({
  fetchUser: vi.fn(),
}))

// Default export mock
vi.mock('./logger', () => ({
  default: vi.fn(),
}))

// Or with importOriginal
vi.mock('./logger', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, default: vi.fn() }
})
```

---

## Important Pitfall: Direct Internal References

```ts
// math.ts
export function double(x: number) { return x * 2 }
export function quadruple(x: number) { return double(x) * 2 }  // direct ref
```

Mocking `double` from outside **will not** affect `quadruple`'s internal call to `double`. The internal reference is bound at definition time.

**Workaround:** Refactor to use dependency injection or route calls through the module namespace:

```ts
// math.ts — refactored for testability
export function double(x: number) { return x * 2 }
export function quadruple(x: number, doubleFn = double) {
  return doubleFn(x) * 2
}
```

---

## How vi.mock() Works

1. All `vi.mock()` calls are **hoisted** to the file top (before imports)
2. Static imports are transformed to dynamic imports internally
3. Mock registry is checked before module resolution
4. Factory function runs to produce the mock module
5. Subsequent imports receive the mocked version via ESM live bindings

This is why `vi.mock()` can appear anywhere in the file and still work — Vitest moves it before the imports during transformation.

<!-- References:
- https://vitest.dev/guide/mocking/modules
- https://vitest.dev/guide/mocking/file-system
- https://vitest.dev/api/vi
-->
