# Pattern: Mock Modules

Complete examples for `vi.mock()`, partial mocking, `vi.hoisted()`, and restoring modules.

---

## Auto-Mock an Entire Module

```ts
import { test, expect, vi } from 'vitest'
import { fetchUser, fetchPosts } from './api'

vi.mock('./api')  // all exports become vi.fn()

test('auto-mocked module', () => {
  fetchUser(1)
  expect(fetchUser).toHaveBeenCalledWith(1)
  expect(fetchUser()).toBeUndefined()  // auto-mocked returns undefined
})
```

## Mock with Factory Function

```ts
import { test, expect, vi } from 'vitest'
import { fetchUser } from './api'

vi.mock('./api', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
  fetchPosts: vi.fn().mockResolvedValue([]),
}))

test('uses custom mock', async () => {
  const user = await fetchUser(1)
  expect(user.name).toBe('Alice')
})
```

## Partial Mock with importOriginal

Keep some real exports, mock others:

```ts
import { test, expect, vi } from 'vitest'
import { format, parse, validate } from './utils'

vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils')>()
  return {
    ...actual,                             // keep format and parse
    validate: vi.fn().mockReturnValue(true), // mock validate
  }
})

test('format still works (real)', () => {
  expect(format('hello')).toBe('HELLO')  // real implementation
})

test('validate is mocked', () => {
  expect(validate('anything')).toBe(true)
  expect(validate).toHaveBeenCalled()
})
```

## vi.hoisted() for Mock Factory Variables

Since `vi.mock` is hoisted above imports, variables must also be hoisted:

```ts
import { test, expect, vi } from 'vitest'

// This variable is hoisted alongside vi.mock
const { mockFetch, mockCache } = vi.hoisted(() => ({
  mockFetch: vi.fn().mockResolvedValue({ data: [] }),
  mockCache: vi.fn().mockReturnValue(null),
}))

vi.mock('./api', () => ({
  fetchData: mockFetch,
  getCached: mockCache,
}))

test('uses hoisted mocks', async () => {
  const { fetchData, getCached } = await import('./api')

  await fetchData()
  expect(mockFetch).toHaveBeenCalled()

  getCached('key')
  expect(mockCache).toHaveBeenCalledWith('key')
})
```

## Mock Default Export

```ts
vi.mock('./logger', () => ({
  default: vi.fn(),  // mock the default export
}))

import logger from './logger'

test('default export is mocked', () => {
  logger('test message')
  expect(logger).toHaveBeenCalledWith('test message')
})
```

## Real-World: Mocking an API Client

```ts
// src/services/api.ts
import axios from 'axios'

export async function getUser(id: number) {
  const { data } = await axios.get(`/api/users/${id}`)
  return data
}

// src/services/api.test.ts
import { test, expect, vi, beforeEach } from 'vitest'
import { getUser } from './api'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import axios from 'axios'

beforeEach(() => {
  vi.mocked(axios.get).mockReset()
})

test('fetches user by ID', async () => {
  vi.mocked(axios.get).mockResolvedValue({
    data: { id: 1, name: 'Alice' },
  })

  const user = await getUser(1)

  expect(user).toEqual({ id: 1, name: 'Alice' })
  expect(axios.get).toHaveBeenCalledWith('/api/users/1')
})

test('handles error', async () => {
  vi.mocked(axios.get).mockRejectedValue(new Error('Network error'))

  await expect(getUser(1)).rejects.toThrow('Network error')
})
```

## Restoring Original Module

```ts
import { test, vi, beforeEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()  // clear module cache
})

test('uses fresh module', async () => {
  vi.doMock('./config', () => ({ debug: true }))
  const config = await import('./config')
  expect(config.debug).toBe(true)
})
```

**Why this works:** `vi.mock` is hoisted to run before imports, so the mock is registered before any code imports the module. `importOriginal` provides access to the real module for partial mocking. `vi.hoisted` solves the variable scoping problem when mocks need shared state.

<!-- References:
- https://vitest.dev/guide/mocking/modules
- https://vitest.dev/api/vi
-->
