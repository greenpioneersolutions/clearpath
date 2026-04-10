# Vi Utility

Complete reference for the `vi` utility object — mock functions, module mocking, fake timers, environment stubs, and async helpers.

---

## Mock Functions & Objects

| Method | Description |
|--------|-------------|
| `vi.fn(fn?)` | Create a spy/mock function. Optional implementation. |
| `vi.spyOn(obj, key, accessor?)` | Spy on object method or getter/setter. Original impl preserved until overridden. |
| `vi.mockObject(value, opts?)` | Deeply mock all properties and methods of an object. |
| `vi.isMockFunction(fn)` | Type guard — checks if `fn` is a mock and narrows type. |
| `vi.mocked(obj, deep?)` | TypeScript helper — casts object to mocked type. No runtime effect. |
| `vi.clearAllMocks()` | Call `.mockClear()` on all spies (clear call history, keep impl). |
| `vi.resetAllMocks()` | Call `.mockReset()` on all spies (clear history + reset impl). |
| `vi.restoreAllMocks()` | Restore all `vi.spyOn` spies to original implementation. |

### Mock Function Instance Methods

| Method | Description |
|--------|-------------|
| `mock.mockReturnValue(value)` | Set default return value |
| `mock.mockReturnValueOnce(value)` | Set return value for next call only (chainable) |
| `mock.mockResolvedValue(value)` | Shorthand for `mockReturnValue(Promise.resolve(value))` |
| `mock.mockResolvedValueOnce(value)` | Resolve once, then fall back to default |
| `mock.mockRejectedValue(value)` | Return rejected promise |
| `mock.mockRejectedValueOnce(value)` | Reject once |
| `mock.mockImplementation(fn)` | Replace the implementation |
| `mock.mockImplementationOnce(fn)` | Replace implementation for next call only |
| `mock.mockClear()` | Clear call history (`mock.calls`, `mock.results`) |
| `mock.mockReset()` | Clear history + reset implementation to `() => undefined` |
| `mock.mockRestore()` | Restore original implementation (only for `vi.spyOn`) |
| `mock.getMockName()` | Get mock name |
| `mock.mockName(name)` | Set mock name (shown in errors) |

### Mock Properties

| Property | Description |
|----------|-------------|
| `mock.calls` | Array of argument arrays for each call |
| `mock.results` | Array of `{ type, value }` for each call |
| `mock.lastCall` | Arguments of the most recent call |
| `mock.instances` | Array of `this` contexts for each call |

---

## Module Mocking

| Method | Description |
|--------|-------------|
| `vi.mock(path, factory?)` | Mock a module. **Hoisted** to top of file. Factory receives `importOriginal`. |
| `vi.doMock(path, factory?)` | Mock a module. **Not hoisted** — affects next dynamic `import()` only. |
| `vi.unmock(path)` | Remove module from mock registry. Hoisted. |
| `vi.doUnmock(path)` | Remove from mock registry. Not hoisted. |
| `vi.importActual(path)` | Import the real module, bypassing all mocks. |
| `vi.importMock(path)` | Import module with all exports auto-mocked. |
| `vi.resetModules()` | Clear module cache — next imports get fresh instances. |
| `vi.dynamicImportSettled()` | Wait for all pending dynamic imports to resolve. |
| `vi.hoisted(factory)` | Execute factory before imports. Use for variables needed in mock factories. |

### vi.mock Patterns

```ts
// Auto-mock — all exports become vi.fn()
vi.mock('./api')

// Custom factory
vi.mock('./api', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1 }),
}))

// Partial mock — keep some real implementations
vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, format: vi.fn() }
})

// With hoisted variables
const mockFn = vi.hoisted(() => vi.fn())
vi.mock('./service', () => ({ getData: mockFn }))
```

### vi.mock Options

```ts
vi.mock('./module', { spy: true })  // spy on all exports without replacing
```

---

## Fake Timers

| Method | Description |
|--------|-------------|
| `vi.useFakeTimers(config?)` | Enable fake timers (setTimeout, setInterval, Date, etc.) |
| `vi.useRealTimers()` | Restore real timer implementations |
| `vi.isFakeTimers()` | Returns `true` if fake timers are active |
| `vi.advanceTimersByTime(ms)` | Advance time by `ms`, firing due timers |
| `vi.advanceTimersByTimeAsync(ms)` | Same but awaits async timers |
| `vi.advanceTimersToNextTimer()` | Jump to and fire the next scheduled timer |
| `vi.advanceTimersToNextTimerAsync()` | Same but awaits async timers |
| `vi.advanceTimersToNextFrame()` | Advance to next `requestAnimationFrame` |
| `vi.runAllTimers()` | Fire all pending timers until queue is empty |
| `vi.runAllTimersAsync()` | Same but awaits async timers |
| `vi.runOnlyPendingTimers()` | Fire only currently pending timers (not new ones they create) |
| `vi.runOnlyPendingTimersAsync()` | Same but awaits async timers |
| `vi.runAllTicks()` | Flush all `process.nextTick` microtasks |
| `vi.getTimerCount()` | Number of pending timers in queue |
| `vi.clearAllTimers()` | Remove all scheduled timers without firing them |
| `vi.setSystemTime(date)` | Set fake `Date.now()` / `new Date()` value |
| `vi.getMockedSystemTime()` | Get current mocked date, or `null` if not mocked |
| `vi.getRealSystemTime()` | Get real system time (ms) even when faking |

### useFakeTimers Config

```ts
vi.useFakeTimers({
  toFake: ['setTimeout', 'setInterval', 'Date'], // which APIs to fake
  now: new Date('2024-01-01'),                    // initial system time
  shouldAdvanceTime: false,                        // auto-advance real time
  shouldClearNativeTimers: false,                  // clear real timers
})
```

---

## Environment & Globals

| Method | Description |
|--------|-------------|
| `vi.stubEnv(name, value)` | Override `process.env[name]` / `import.meta.env[name]` |
| `vi.unstubAllEnvs()` | Restore all env vars to original values |
| `vi.stubGlobal(name, value)` | Override a global variable (`window`, `fetch`, etc.) |
| `vi.unstubAllGlobals()` | Restore all globals to original values |

```ts
vi.stubEnv('API_URL', 'http://test.local')
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok')))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
```

---

## Async Helpers

| Method | Description |
|--------|-------------|
| `vi.waitFor(callback, opts?)` | Retry callback until it doesn't throw. Options: `timeout`, `interval`. |
| `vi.waitUntil(callback, opts?)` | Retry callback until it returns truthy. Options: `timeout`, `interval`. |

```ts
await vi.waitFor(() => {
  expect(element.textContent).toBe('loaded')
}, { timeout: 3000, interval: 100 })

const result = await vi.waitUntil(() => {
  return fetchStatus() === 'ready' ? true : undefined
}, { timeout: 5000 })
```

---

## Configuration Helpers

| Method | Description |
|--------|-------------|
| `vi.setConfig(config)` | Override runtime config for current test file |
| `vi.resetConfig()` | Reset config to original state |
| `vi.defineHelper(fn)` | Wrap function as assertion helper (clean stack traces) |

<!-- References:
- https://vitest.dev/api/vi
-->
