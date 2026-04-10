# Pattern: Async Testing

Complete examples for testing promises, async/await, and async error handling.

---

## Source Code Under Test

```ts
// src/api/users.ts
export async function fetchUser(id: number): Promise<{ id: number; name: string }> {
  const res = await fetch(`/api/users/${id}`)
  if (!res.ok) throw new Error(`User ${id} not found`)
  return res.json()
}

export async function createUser(name: string): Promise<{ id: number; name: string }> {
  const res = await fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return res.json()
}

export function fetchWithCallback(
  id: number,
  callback: (err: Error | null, data?: any) => void
) {
  fetch(`/api/users/${id}`)
    .then(res => res.json())
    .then(data => callback(null, data))
    .catch(err => callback(err))
}
```

## Test File

```ts
// src/api/users.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchUser, createUser, fetchWithCallback } from './users'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('async/await pattern', () => {
  it('fetches a user', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 1, name: 'Alice' }))
    )

    const user = await fetchUser(1)
    expect(user).toEqual({ id: 1, name: 'Alice' })
  })

  it('throws on not found', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('', { status: 404, statusText: 'Not Found' })
    )

    // Must await the expect — otherwise test passes before promise settles
    await expect(fetchUser(99)).rejects.toThrow('User 99 not found')
  })
})

describe('.resolves / .rejects pattern', () => {
  it('resolves with user data', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 2, name: 'Bob' }))
    )

    // .resolves unwraps the promise, then chain any matcher
    await expect(createUser('Bob')).resolves.toEqual(
      expect.objectContaining({ name: 'Bob' })
    )
  })

  it('rejects with error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    await expect(fetchUser(1)).rejects.toThrow('Network error')
  })
})

describe('callback pattern (converted to promise)', () => {
  it('resolves callback data', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 3, name: 'Charlie' }))
    )

    // Wrap callback in a promise for clean async testing
    const result = await new Promise((resolve, reject) => {
      fetchWithCallback(3, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    expect(result).toEqual({ id: 3, name: 'Charlie' })
  })
})

describe('ensuring assertions run', () => {
  it('verifies assertion count', async () => {
    // Catches cases where async code skips assertions
    expect.assertions(2)

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 1, name: 'Alice' }))
    )

    const user = await fetchUser(1)
    expect(user.id).toBe(1)
    expect(user.name).toBe('Alice')
  })

  it('verifies at least one assertion ran', async () => {
    expect.hasAssertions()

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 1, name: 'Alice' }))
    )

    const user = await fetchUser(1)
    expect(user).toBeDefined()
  })
})

describe('custom timeout', () => {
  it('handles slow operations', async () => {
    vi.mocked(fetch).mockImplementation(
      () => new Promise(resolve =>
        setTimeout(() => resolve(new Response('{}')), 3000)
      )
    )

    vi.useFakeTimers()
    const promise = fetchUser(1)
    vi.advanceTimersByTime(3000)
    await expect(promise).resolves.toBeDefined()
    vi.useRealTimers()
  }, 10_000) // 10 second timeout for this test
})
```

**Why this works:** Always `await` the `expect` when testing promises — without it, the test passes synchronously before the promise settles. Use `expect.assertions(n)` to guard against silently skipped assertions in complex async flows.

<!-- References:
- https://vitest.dev/guide/learn/async
- https://vitest.dev/api/expect
-->
