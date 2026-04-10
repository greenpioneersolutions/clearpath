# Mocking Timers & Dates

Complete reference for controlling time in tests — fake timers for `setTimeout`/`setInterval` and date mocking with `vi.setSystemTime()`.

---

## Setup & Teardown

```ts
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})
```

**Always restore real timers** in `afterEach` to prevent leaking fake timers into other tests.

---

## Fake Timer API

| Method | Description |
|--------|-------------|
| `vi.useFakeTimers(config?)` | Replace `setTimeout`, `setInterval`, `Date`, etc. with fakes |
| `vi.useRealTimers()` | Restore all original timer/date implementations |
| `vi.isFakeTimers()` | Returns `true` if fake timers are active |
| `vi.advanceTimersByTime(ms)` | Advance clock by `ms`, firing all due timers |
| `vi.advanceTimersByTimeAsync(ms)` | Same but awaits async callbacks |
| `vi.advanceTimersToNextTimer()` | Jump to and fire the next scheduled timer |
| `vi.advanceTimersToNextTimerAsync()` | Same but awaits async callbacks |
| `vi.advanceTimersToNextFrame()` | Advance to next `requestAnimationFrame` |
| `vi.runAllTimers()` | Fire all pending timers until queue is empty |
| `vi.runAllTimersAsync()` | Same but awaits async callbacks |
| `vi.runOnlyPendingTimers()` | Fire only currently pending timers (not new ones they create) |
| `vi.runOnlyPendingTimersAsync()` | Same but awaits async callbacks |
| `vi.runAllTicks()` | Flush all `process.nextTick` microtasks |
| `vi.getTimerCount()` | Number of pending timers in queue |
| `vi.clearAllTimers()` | Remove all scheduled timers without firing them |

### useFakeTimers Configuration

```ts
vi.useFakeTimers({
  toFake: ['setTimeout', 'setInterval', 'Date'],  // which APIs to fake
  now: new Date('2024-01-01'),                      // initial system time
  shouldAdvanceTime: false,                          // auto-advance with real time
  shouldClearNativeTimers: false,                    // clear real timers on fake
})
```

---

## Testing setTimeout

```ts
function executeAfterDelay(callback: () => void, ms: number) {
  setTimeout(callback, ms)
}

test('executes callback after delay', () => {
  const callback = vi.fn()
  executeAfterDelay(callback, 5000)

  expect(callback).not.toHaveBeenCalled()

  vi.advanceTimersByTime(5000)

  expect(callback).toHaveBeenCalledTimes(1)
})
```

## Testing setInterval

```ts
function startPolling(callback: () => void, interval: number) {
  return setInterval(callback, interval)
}

test('polls at regular intervals', () => {
  const callback = vi.fn()
  startPolling(callback, 1000)

  vi.advanceTimersByTime(3000)
  expect(callback).toHaveBeenCalledTimes(3)

  vi.advanceTimersByTime(2000)
  expect(callback).toHaveBeenCalledTimes(5)
})
```

## Testing Debounce / Throttle

```ts
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>
  return ((...args: any[]) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}

test('debounce fires once after rapid calls', () => {
  const fn = vi.fn()
  const debounced = debounce(fn, 300)

  debounced('a')
  debounced('b')
  debounced('c')

  expect(fn).not.toHaveBeenCalled()

  vi.advanceTimersByTime(300)

  expect(fn).toHaveBeenCalledTimes(1)
  expect(fn).toHaveBeenCalledWith('c')  // only last call
})
```

## runAllTimers vs runOnlyPendingTimers

- **`runAllTimers()`** — Fires all timers recursively. Dangerous if timers create new timers indefinitely (infinite loop).
- **`runOnlyPendingTimers()`** — Fires only timers that exist now. New timers created during execution are not fired. Safer for recursive patterns like `setInterval`.

```ts
test('run only pending avoids infinite loops', () => {
  const fn = vi.fn()

  // This creates a new timer each time it fires
  function tick() {
    fn()
    setTimeout(tick, 100)
  }
  setTimeout(tick, 100)

  // vi.runAllTimers()  // DANGER: infinite loop!
  vi.runOnlyPendingTimers()  // Safe: fires once
  expect(fn).toHaveBeenCalledTimes(1)
})
```

---

## Date Mocking

| Method | Description |
|--------|-------------|
| `vi.setSystemTime(date)` | Set `Date.now()` and `new Date()` to return this time |
| `vi.getMockedSystemTime()` | Get the currently mocked date, or `null` if not mocked |
| `vi.getRealSystemTime()` | Get real system time (ms) even when faking |

**Requires `vi.useFakeTimers()` to be active.**

### Testing Date-Dependent Code

```ts
const businessHours = [9, 17]

function purchase() {
  const hour = new Date().getHours()
  if (hour >= businessHours[0] && hour < businessHours[1]) {
    return { message: 'Success' }
  }
  return { message: 'Error' }
}

describe('purchasing flow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('allows purchases within business hours', () => {
    vi.setSystemTime(new Date(2024, 0, 1, 13)) // 1:00 PM
    expect(purchase()).toEqual({ message: 'Success' })
  })

  test('rejects purchases outside hours', () => {
    vi.setSystemTime(new Date(2024, 0, 1, 19)) // 7:00 PM
    expect(purchase()).toEqual({ message: 'Error' })
  })
})
```

### Testing Formatted Dates

```ts
function formatRelative(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

test('formats relative time', () => {
  vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))

  expect(formatRelative(new Date('2024-06-15T11:58:00Z'))).toBe('2m ago')
  expect(formatRelative(new Date('2024-06-15T10:00:00Z'))).toBe('2h ago')
  expect(formatRelative(new Date('2024-06-15T11:59:30Z'))).toBe('just now')
})
```

---

## Async Timer Patterns

When timer callbacks are async, use the `*Async` variants:

```ts
test('async timer callback', async () => {
  const fn = vi.fn()

  setTimeout(async () => {
    await someAsyncWork()
    fn()
  }, 1000)

  await vi.advanceTimersByTimeAsync(1000)
  expect(fn).toHaveBeenCalled()
})
```

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Timers leaking between tests | Always call `vi.useRealTimers()` in `afterEach` |
| `runAllTimers()` hangs | Use `runOnlyPendingTimers()` for recursive timer patterns |
| Async callbacks not awaited | Use `*Async` variants (`advanceTimersByTimeAsync`, etc.) |
| Date not mocked | Must call `vi.useFakeTimers()` first — `setSystemTime` alone won't work |
| Third-party timers not faked | Check if library uses `Date` or timers — may need `shouldAdvanceTime: true` |

<!-- References:
- https://vitest.dev/guide/mocking/timers
- https://vitest.dev/guide/mocking/dates
- https://vitest.dev/api/vi
-->
