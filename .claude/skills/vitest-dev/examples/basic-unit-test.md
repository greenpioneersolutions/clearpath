# Pattern: Basic Unit Test

Complete example of fundamental Vitest test patterns — equality, truthiness, numbers, strings, arrays, objects, and exceptions.

---

## Source Code Under Test

```ts
// src/utils/math.ts
export function add(a: number, b: number): number {
  return a + b
}

export function divide(a: number, b: number): number {
  if (b === 0) throw new RangeError('Division by zero')
  return a / b
}

export function findUser(users: { name: string }[], name: string) {
  return users.find(u => u.name === name) ?? null
}
```

## Test File

```ts
// src/utils/math.test.ts
import { describe, it, expect } from 'vitest'
import { add, divide, findUser } from './math'

describe('add', () => {
  // Equality — use toBe for primitives
  it('adds two positive numbers', () => {
    expect(add(1, 2)).toBe(3)
  })

  it('handles negative numbers', () => {
    expect(add(-1, -2)).toBe(-3)
  })
})

describe('divide', () => {
  // Number comparisons
  it('divides evenly', () => {
    expect(divide(10, 2)).toBe(5)
  })

  it('handles floating point', () => {
    expect(divide(1, 3)).toBeCloseTo(0.333, 2)
  })

  it('result is greater than zero for positive inputs', () => {
    expect(divide(10, 3)).toBeGreaterThan(0)
    expect(divide(10, 3)).toBeLessThan(10)
  })

  // Exception testing — wrap in arrow function
  it('throws on division by zero', () => {
    expect(() => divide(1, 0)).toThrow('Division by zero')
    expect(() => divide(1, 0)).toThrow(RangeError)
    expect(() => divide(1, 0)).toThrow(/zero/)
  })
})

describe('findUser', () => {
  const users = [
    { name: 'Alice', role: 'admin' },
    { name: 'Bob', role: 'user' },
  ]

  // Truthiness
  it('returns truthy for existing user', () => {
    expect(findUser(users, 'Alice')).toBeTruthy()
  })

  it('returns null for missing user', () => {
    expect(findUser(users, 'Charlie')).toBeNull()
  })

  // Object equality — use toEqual for deep comparison
  it('returns the matching user object', () => {
    expect(findUser(users, 'Alice')).toEqual({ name: 'Alice', role: 'admin' })
  })

  // String matching
  it('user name contains expected substring', () => {
    const user = findUser(users, 'Alice')!
    expect(user.name).toContain('Ali')
    expect(user.name).toMatch(/^A/)
  })

  // Array content
  it('users array contains Bob', () => {
    expect(users).toContainEqual({ name: 'Bob', role: 'user' })
    expect(users).toHaveLength(2)
  })

  // Object properties
  it('user has expected properties', () => {
    const user = findUser(users, 'Alice')!
    expect(user).toHaveProperty('name')
    expect(user).toHaveProperty('role', 'admin')
  })

  // Type checking
  it('returns correct types', () => {
    expect(findUser(users, 'Alice')).toBeTypeOf('object')
    expect(findUser(users, 'missing')).toBeNull()
  })

  // Negation
  it('does not return undefined', () => {
    expect(findUser(users, 'Alice')).not.toBeUndefined()
  })
})
```

**Why this works:** Each matcher is chosen for its purpose — `toBe` for primitives (strict ===), `toEqual` for deep object comparison, `toThrow` wraps the call in a function so Vitest can catch the exception.

<!-- References:
- https://vitest.dev/guide/learn/writing-tests
- https://vitest.dev/guide/learn/matchers
- https://vitest.dev/api/expect
-->
