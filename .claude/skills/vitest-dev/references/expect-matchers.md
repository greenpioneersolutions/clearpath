# Expect & Matchers

Complete reference for all Vitest assertion matchers, asymmetric matchers, and custom matcher extensions.

---

## Equality & Identity

| Matcher | Description | Example |
|---------|-------------|---------|
| `toBe(value)` | Strict equality via `Object.is()` — use for primitives | `expect(2).toBe(2)` |
| `toEqual(value)` | Deep equality for objects/arrays (ignores `undefined` props) | `expect({a:1}).toEqual({a:1})` |
| `toStrictEqual(value)` | Deep equality + type checking + sparse array detection | `expect(new Cls()).not.toStrictEqual({})` |

## Truthiness

| Matcher | Description |
|---------|-------------|
| `toBeTruthy()` | Value is truthy when coerced to boolean |
| `toBeFalsy()` | Value is falsy when coerced to boolean |
| `toBeDefined()` | Value is not `undefined` |
| `toBeUndefined()` | Value is `undefined` |
| `toBeNull()` | Value is `null` |
| `toBeNullable()` | Value is `null` or `undefined` |
| `toBeNaN()` | Value is `NaN` |

## Numbers

| Matcher | Description |
|---------|-------------|
| `toBeGreaterThan(n)` | `value > n` |
| `toBeGreaterThanOrEqual(n)` | `value >= n` |
| `toBeLessThan(n)` | `value < n` |
| `toBeLessThanOrEqual(n)` | `value <= n` |
| `toBeCloseTo(n, digits?)` | Float comparison within precision (default 5 digits) |

```ts
expect(0.1 + 0.2).toBeCloseTo(0.3, 5) // avoids float precision issues
```

## Type & Instance

| Matcher | Description | Example |
|---------|-------------|---------|
| `toBeTypeOf(type)` | Native `typeof` check | `expect('hi').toBeTypeOf('string')` |
| `toBeInstanceOf(Class)` | `instanceof` check | `expect(err).toBeInstanceOf(Error)` |
| `toBeOneOf(array\|set)` | Matches any value in collection | `expect(fruit).toBeOneOf(['apple','banana'])` |

## Strings, Arrays & Objects

| Matcher | Description |
|---------|-------------|
| `toContain(value)` | Array includes item, or string includes substring |
| `toContainEqual(value)` | Array contains element matching structure (deep equal) |
| `toHaveLength(n)` | `.length` property equals `n` |
| `toHaveProperty(key, value?)` | Object has property (supports dot path `'a.b.c'`) |
| `toMatch(regexp\|string)` | String matches regex or includes substring |
| `toMatchObject(shape)` | Object/array partially matches structure |

```ts
expect(invoice).toHaveProperty('customer.name', 'Alice')
expect(list).toContainEqual({ id: 1, active: true })
```

## Error / Exception

| Matcher | Description |
|---------|-------------|
| `toThrow(expected?)` | Function throws — match by message, regex, or Error class |
| `toThrowErrorMatchingSnapshot()` | Thrown error matches stored snapshot |
| `toThrowErrorMatchingInlineSnapshot()` | Thrown error matches inline snapshot |

```ts
expect(() => divide(1, 0)).toThrow('Division by zero')
expect(() => divide(1, 0)).toThrow(/division/i)
expect(() => divide(1, 0)).toThrow(RangeError)
```

## Async (Promises)

```ts
await expect(fetchUser(1)).resolves.toEqual({ id: 1, name: 'Alice' })
await expect(fetchUser(-1)).rejects.toThrow('not found')
```

- `.resolves` — unwraps resolved value, then chain any matcher
- `.rejects` — unwraps rejection reason, then chain any matcher
- **Always `await`** the expect — otherwise the test passes before the promise settles

## Snapshot

| Matcher | Description |
|---------|-------------|
| `toMatchSnapshot(hint?)` | Compare against `.snap` file |
| `toMatchInlineSnapshot(snapshot?)` | Inline snapshot in test source |
| `toMatchFileSnapshot(path)` | Snapshot against explicit file (async) |

```ts
expect(render(<Button />)).toMatchSnapshot()
expect(data).toMatchInlineSnapshot(`{ "id": 1 }`)
await expect(html).toMatchFileSnapshot('./fixtures/output.html')
```

## Mock / Spy Assertions

### Call Tracking

| Matcher | Description |
|---------|-------------|
| `toHaveBeenCalled()` | Spy called at least once |
| `toHaveBeenCalledTimes(n)` | Spy called exactly `n` times |
| `toHaveBeenCalledWith(...args)` | At least one call matched these args |
| `toHaveBeenCalledExactlyOnceWith(...args)` | Called exactly once with these args |
| `toHaveBeenLastCalledWith(...args)` | Last call had these args |
| `toHaveBeenNthCalledWith(n, ...args)` | Nth call (1-indexed) had these args |
| `toHaveBeenCalledBefore(otherMock)` | Called before another mock |
| `toHaveBeenCalledAfter(otherMock)` | Called after another mock |

### Return Value Tracking

| Matcher | Description |
|---------|-------------|
| `toHaveReturned()` | Returned at least once (didn't throw) |
| `toHaveReturnedTimes(n)` | Returned successfully `n` times |
| `toHaveReturnedWith(value)` | At least one return matched value |
| `toHaveLastReturnedWith(value)` | Last return matched value |
| `toHaveNthReturnedWith(n, value)` | Nth return matched value |

### Promise Resolution Tracking

| Matcher | Description |
|---------|-------------|
| `toHaveResolved()` | Resolved at least once |
| `toHaveResolvedTimes(n)` | Resolved `n` times |
| `toHaveResolvedWith(value)` | Resolved with specific value |
| `toHaveLastResolvedWith(value)` | Last resolution matched value |
| `toHaveNthResolvedWith(n, value)` | Nth resolution matched value |

---

## Asymmetric Matchers

Use inside `toEqual`, `toContainEqual`, `toMatchObject`, or `toHaveBeenCalledWith` for flexible matching:

| Matcher | Description |
|---------|-------------|
| `expect.anything()` | Matches anything except `null`/`undefined` |
| `expect.any(Constructor)` | Matches any instance of constructor |
| `expect.closeTo(n, digits?)` | Float comparison within objects |
| `expect.stringContaining(str)` | String includes substring |
| `expect.stringMatching(regex)` | String matches pattern |
| `expect.arrayContaining(arr)` | Array includes all items |
| `expect.objectContaining(obj)` | Object has matching subset |
| `expect.not.*` | Negate any asymmetric matcher |

```ts
expect(user).toEqual({
  id: expect.any(Number),
  name: expect.stringContaining('Alice'),
  roles: expect.arrayContaining(['admin']),
  metadata: expect.objectContaining({ active: true }),
  createdAt: expect.any(Date),
})
```

---

## Control Flow

| Method | Description |
|--------|-------------|
| `expect.soft(value)` | Continues test on failure — reports all failures at end |
| `expect.poll(callback, opts?)` | Retries assertion until it passes (for async UI) |
| `expect.assertions(n)` | Verifies exactly `n` assertions ran (catches missed async) |
| `expect.hasAssertions()` | Verifies at least one assertion ran |
| `expect.unreachable(msg?)` | Marks line that should never execute |

```ts
test('all fields validated', () => {
  expect.soft(user.name).toBeTruthy()    // doesn't stop on failure
  expect.soft(user.email).toContain('@') // continues checking
  expect.soft(user.age).toBeGreaterThan(0)
})
```

---

## Extending Matchers

```ts
// setup.ts or test file
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling
    return {
      pass,
      message: () => `expected ${received} to be within [${floor}, ${ceiling}]`,
    }
  },
})

// TypeScript declaration
interface CustomMatchers<R = unknown> {
  toBeWithinRange(floor: number, ceiling: number): R
}
declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

// Usage
expect(100).toBeWithinRange(90, 110)
```

---

## Negation

Prefix any matcher with `.not`:

```ts
expect(value).not.toBe(0)
expect(list).not.toContain('banned')
expect(spy).not.toHaveBeenCalled()
```

<!-- References:
- https://vitest.dev/api/expect
- https://vitest.dev/guide/learn/matchers
- https://vitest.dev/guide/extending-matchers
-->
