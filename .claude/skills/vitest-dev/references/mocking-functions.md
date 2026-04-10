# Mocking Functions

Complete reference for creating mock functions and spies with `vi.fn()` and `vi.spyOn()`.

---

## vi.fn() — Mock Functions

Create a standalone mock function, optionally with an implementation:

```ts
import { vi, expect, test } from 'vitest'

const getPrice = vi.fn()                       // returns undefined
const getPrice = vi.fn((item: string) => 9.99) // with implementation
```

### Return Values

```ts
const fn = vi.fn()

fn.mockReturnValue(42)           // all calls return 42
fn.mockReturnValueOnce(1)        // first call returns 1, then falls back
  .mockReturnValueOnce(2)        // second call returns 2 (chainable)

fn.mockResolvedValue({ id: 1 })  // returns Promise.resolve({ id: 1 })
fn.mockResolvedValueOnce(data)   // resolves once

fn.mockRejectedValue(new Error('fail'))  // returns rejected promise
fn.mockRejectedValueOnce(error)          // rejects once
```

### Implementations

```ts
const fn = vi.fn()

fn.mockImplementation((x: number) => x * 2)
fn.mockImplementationOnce((x: number) => x * 10) // override for next call only
```

### Call Tracking Properties

| Property | Type | Description |
|----------|------|-------------|
| `fn.mock.calls` | `any[][]` | Array of argument arrays for each call |
| `fn.mock.results` | `{ type: string, value: any }[]` | Return values and types for each call |
| `fn.mock.lastCall` | `any[]` | Arguments of the most recent call |
| `fn.mock.instances` | `any[]` | `this` contexts for each call |

```ts
fn('a', 'b')
fn('c')

fn.mock.calls     // [['a', 'b'], ['c']]
fn.mock.lastCall  // ['c']
fn.mock.results   // [{ type: 'return', value: undefined }, ...]
```

---

## vi.spyOn() — Spying on Methods

Spy on existing object methods while preserving the original implementation:

```ts
const cart = {
  getTotal: () => 100,
}

const spy = vi.spyOn(cart, 'getTotal')  // original still called
spy.mockReturnValue(0)                   // now override return

expect(cart.getTotal()).toBe(0)
expect(spy).toHaveBeenCalled()
```

### Spy on Getters / Setters

```ts
const user = {
  _name: 'Alice',
  get name() { return this._name },
  set name(v) { this._name = v },
}

const getSpy = vi.spyOn(user, 'name', 'get').mockReturnValue('Bob')
const setSpy = vi.spyOn(user, 'name', 'set')

user.name         // 'Bob' (mocked getter)
user.name = 'Eve' // triggers setSpy
expect(setSpy).toHaveBeenCalledWith('Eve')
```

---

## Mock Assertions

| Matcher | Description |
|---------|-------------|
| `toHaveBeenCalled()` | Called at least once |
| `toHaveBeenCalledTimes(n)` | Called exactly `n` times |
| `toHaveBeenCalledWith(...args)` | At least one call matched these args |
| `toHaveBeenCalledExactlyOnceWith(...args)` | Called once with exactly these args |
| `toHaveBeenLastCalledWith(...args)` | Most recent call had these args |
| `toHaveBeenNthCalledWith(n, ...args)` | Nth call (1-indexed) had these args |
| `toHaveReturned()` | Returned at least once (didn't throw) |
| `toHaveReturnedWith(value)` | At least one return matched value |

```ts
const handler = vi.fn()
handler('click', { x: 10 })
handler('hover', { x: 20 })

expect(handler).toHaveBeenCalledTimes(2)
expect(handler).toHaveBeenCalledWith('click', expect.objectContaining({ x: 10 }))
expect(handler).toHaveBeenLastCalledWith('hover', expect.any(Object))
```

---

## Clearing, Resetting, Restoring

| Method | Clears History | Resets Impl | Restores Original |
|--------|:-:|:-:|:-:|
| `mock.mockClear()` / `vi.clearAllMocks()` | Yes | No | No |
| `mock.mockReset()` / `vi.resetAllMocks()` | Yes | Yes | No |
| `mock.mockRestore()` / `vi.restoreAllMocks()` | Yes | Yes | Yes (spyOn only) |

- **`mockClear`** — Resets `mock.calls`, `mock.results`, `mock.instances`. Implementation unchanged.
- **`mockReset`** — Clears + resets implementation to `() => undefined`.
- **`mockRestore`** — Clears + restores original implementation. Only works on `vi.spyOn` spies.

### Auto-Restore in Config

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    mockReset: true,      // auto mockReset before each test
    // or:
    restoreMocks: true,   // auto mockRestore before each test
    // or:
    clearMocks: true,     // auto mockClear before each test
  },
})
```

---

## Mocking Classes

Wrap a class with `vi.fn()` to mock constructors and instance methods:

```ts
const Dog = vi.fn(class {
  static getType = vi.fn(() => 'animal')

  constructor(public name: string) {}

  greet = vi.fn(() => `Hi! I'm ${this.name}!`)
  speak = vi.fn(() => 'Woof!')
  feed = vi.fn()
})

const cooper = new Dog('Cooper')
expect(cooper.greet()).toBe("Hi! I'm Cooper!")
expect(Dog).toHaveBeenCalledWith('Cooper')
expect(cooper.speak).toHaveBeenCalled()

// Each instance has separate mock tracking
const max = new Dog('Max')
expect(max.speak).not.toHaveBeenCalled()

// Static methods
expect(Dog.getType()).toBe('animal')
expect(Dog.getType).toHaveBeenCalled()
```

### Spy on Instance Properties

```ts
const spy = vi.spyOn(dog, 'name', 'get').mockReturnValue('Override')
expect(dog.name).toBe('Override')
```

---

## Common Patterns

### Mock a Callback Parameter

```ts
function processItems(items: string[], callback: (item: string) => void) {
  items.forEach(callback)
}

test('calls callback for each item', () => {
  const callback = vi.fn()
  processItems(['a', 'b', 'c'], callback)

  expect(callback).toHaveBeenCalledTimes(3)
  expect(callback).toHaveBeenNthCalledWith(1, 'a')
  expect(callback).toHaveBeenNthCalledWith(2, 'b')
  expect(callback).toHaveBeenNthCalledWith(3, 'c')
})
```

### Mock with Conditional Return

```ts
const fetchUser = vi.fn().mockImplementation((id: number) => {
  if (id === 1) return { name: 'Alice' }
  throw new Error('Not found')
})
```

<!-- References:
- https://vitest.dev/guide/mocking/functions
- https://vitest.dev/guide/mocking/classes
- https://vitest.dev/api/vi
-->
