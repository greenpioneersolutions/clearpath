# Pattern: Mock Functions

Complete examples for `vi.fn()`, `vi.spyOn()`, return values, implementations, and assertions.

---

## Creating Mock Functions

```ts
import { describe, test, expect, vi } from 'vitest'

test('basic mock function', () => {
  const fn = vi.fn()

  fn('hello')
  fn('world')

  expect(fn).toHaveBeenCalledTimes(2)
  expect(fn).toHaveBeenCalledWith('hello')
  expect(fn).toHaveBeenLastCalledWith('world')
})
```

## Mock Return Values

```ts
test('mock return values', () => {
  const getPrice = vi.fn()
    .mockReturnValue(9.99)             // default
    .mockReturnValueOnce(0)            // first call
    .mockReturnValueOnce(4.99)         // second call

  expect(getPrice()).toBe(0)           // first: once value
  expect(getPrice()).toBe(4.99)        // second: once value
  expect(getPrice()).toBe(9.99)        // third+: default
})

test('mock async return values', async () => {
  const fetchUser = vi.fn()
    .mockResolvedValue({ id: 1, name: 'Default' })
    .mockResolvedValueOnce({ id: 1, name: 'First' })

  expect(await fetchUser()).toEqual({ id: 1, name: 'First' })
  expect(await fetchUser()).toEqual({ id: 1, name: 'Default' })
})

test('mock rejection', async () => {
  const fetchUser = vi.fn().mockRejectedValue(new Error('Not found'))
  await expect(fetchUser()).rejects.toThrow('Not found')
})
```

## Mock Implementations

```ts
test('custom implementation', () => {
  const calculate = vi.fn().mockImplementation((a: number, b: number) => a * b)

  expect(calculate(3, 4)).toBe(12)
  expect(calculate).toHaveBeenCalledWith(3, 4)
})

test('one-time implementation override', () => {
  const fn = vi.fn()
    .mockImplementation(() => 'default')
    .mockImplementationOnce(() => 'first')

  expect(fn()).toBe('first')
  expect(fn()).toBe('default')
})
```

## Spying on Object Methods

```ts
test('spy preserves original implementation', () => {
  const calculator = {
    add: (a: number, b: number) => a + b,
  }

  const spy = vi.spyOn(calculator, 'add')

  expect(calculator.add(1, 2)).toBe(3)  // original still works
  expect(spy).toHaveBeenCalledWith(1, 2)

  // Override the return
  spy.mockReturnValue(0)
  expect(calculator.add(1, 2)).toBe(0)

  // Restore original
  spy.mockRestore()
  expect(calculator.add(1, 2)).toBe(3)
})
```

## Real-World: Mocking a Callback

```ts
function processItems(items: string[], onItem: (item: string, index: number) => void) {
  items.forEach((item, i) => onItem(item, i))
}

test('calls callback for each item', () => {
  const onItem = vi.fn()

  processItems(['a', 'b', 'c'], onItem)

  expect(onItem).toHaveBeenCalledTimes(3)
  expect(onItem).toHaveBeenNthCalledWith(1, 'a', 0)
  expect(onItem).toHaveBeenNthCalledWith(2, 'b', 1)
  expect(onItem).toHaveBeenNthCalledWith(3, 'c', 2)
})
```

## Clearing Mocks Between Tests

```ts
describe('with auto-clear', () => {
  const handler = vi.fn()

  afterEach(() => {
    handler.mockClear()  // clear call history, keep implementation
  })

  test('first test', () => {
    handler('a')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('second test starts fresh', () => {
    handler('b')
    expect(handler).toHaveBeenCalledTimes(1)  // not 2
  })
})
```

Or use config-level auto-clear:

```ts
// vitest.config.ts
export default defineConfig({
  test: { clearMocks: true },  // or restoreMocks: true
})
```

**Why this works:** `vi.fn()` creates a tracked function you control. `vi.spyOn()` wraps an existing method for observation without breaking it. Use `mockClear` between tests to prevent assertion pollution.

<!-- References:
- https://vitest.dev/guide/mocking/functions
- https://vitest.dev/guide/learn/mock-functions
- https://vitest.dev/api/vi
-->
