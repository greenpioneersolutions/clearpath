# Pattern: Timer & Date Mocking

Complete examples for fake timers, setTimeout/setInterval testing, debounce, and date mocking.

---

## Basic Timer Testing

```ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('setTimeout fires after delay', () => {
  const callback = vi.fn()
  setTimeout(callback, 5000)

  expect(callback).not.toHaveBeenCalled()
  vi.advanceTimersByTime(5000)
  expect(callback).toHaveBeenCalledTimes(1)
})

test('setInterval fires repeatedly', () => {
  const callback = vi.fn()
  setInterval(callback, 1000)

  vi.advanceTimersByTime(3500)
  expect(callback).toHaveBeenCalledTimes(3)
})
```

## Testing a Debounce Function

```ts
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: any[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('fires once after rapid calls', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('a')
    debounced('b')
    debounced('c')

    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')  // last call wins
  })

  test('resets timer on each call', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced()
    vi.advanceTimersByTime(200)    // 200ms passed
    debounced()                      // resets timer
    vi.advanceTimersByTime(200)    // 200ms more — only 200ms since reset
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)    // 300ms total since reset
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
```

## Date Mocking

```ts
describe('date-dependent code', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('formats relative time', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))

    // Date.now() and new Date() return the mocked time
    expect(new Date().toISOString()).toBe('2024-06-15T12:00:00.000Z')
    expect(Date.now()).toBe(new Date('2024-06-15T12:00:00Z').getTime())
  })

  test('business hours check', () => {
    function isBusinessHours(): boolean {
      const hour = new Date().getHours()
      return hour >= 9 && hour < 17
    }

    vi.setSystemTime(new Date(2024, 0, 1, 13))  // 1:00 PM
    expect(isBusinessHours()).toBe(true)

    vi.setSystemTime(new Date(2024, 0, 1, 20))  // 8:00 PM
    expect(isBusinessHours()).toBe(false)
  })

  test('age calculation', () => {
    vi.setSystemTime(new Date('2024-06-15'))

    function getAge(birthDate: Date): number {
      const now = new Date()
      let age = now.getFullYear() - birthDate.getFullYear()
      const m = now.getMonth() - birthDate.getMonth()
      if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--
      return age
    }

    expect(getAge(new Date('1990-01-15'))).toBe(34)
    expect(getAge(new Date('2000-12-25'))).toBe(23)
  })
})
```

## Async Timer Callbacks

Use `*Async` variants when timer callbacks are async:

```ts
test('async timer callback', async () => {
  vi.useFakeTimers()

  const results: string[] = []

  setTimeout(async () => {
    const data = await Promise.resolve('done')
    results.push(data)
  }, 1000)

  await vi.advanceTimersByTimeAsync(1000)
  expect(results).toEqual(['done'])

  vi.useRealTimers()
})
```

## Cleanup Pattern

```ts
describe('with fake timers', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())  // ALWAYS restore

  // tests here...
})
```

**Why this works:** `vi.useFakeTimers()` replaces `setTimeout`, `setInterval`, and `Date` with controllable fakes. `vi.advanceTimersByTime(ms)` fires all timers due within that window. Always call `vi.useRealTimers()` in `afterEach` to prevent leaking fake timers into other tests.

<!-- References:
- https://vitest.dev/guide/mocking/timers
- https://vitest.dev/guide/mocking/dates
-->
