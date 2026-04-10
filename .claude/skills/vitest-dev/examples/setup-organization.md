# Pattern: Setup & Organization

Complete examples for test hooks, file organization, setup files, and nested describe scoping.

---

## Per-Test Setup with beforeEach / afterEach

```ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest'

describe('ShoppingCart', () => {
  let cart: ShoppingCart

  beforeEach(() => {
    cart = new ShoppingCart()
    cart.addItem({ id: 1, name: 'Widget', price: 9.99 })
  })

  afterEach(() => {
    cart.clear()
  })

  test('has one item after setup', () => {
    expect(cart.items).toHaveLength(1)
  })

  test('calculates total', () => {
    cart.addItem({ id: 2, name: 'Gadget', price: 19.99 })
    expect(cart.total).toBeCloseTo(29.98)
  })
})
```

## Suite-Level Setup with beforeAll / afterAll

```ts
let server: TestServer
let db: TestDatabase

beforeAll(async () => {
  db = await createTestDatabase()
  server = await startTestServer({ db })
})

afterAll(async () => {
  await server.close()
  await db.destroy()
})

test('creates a user', async () => {
  const res = await server.post('/users', { name: 'Alice' })
  expect(res.status).toBe(201)
})
```

## Hook Return for Cleanup

Hooks can return a cleanup function — alternative to a separate `afterEach`:

```ts
beforeEach(() => {
  const handler = document.addEventListener('click', vi.fn())
  return () => document.removeEventListener('click', handler) // cleanup
})
```

## Nested Describe with Scoped Setup

Hooks apply only to tests in their scope and nested scopes:

```ts
describe('UserService', () => {
  let service: UserService

  beforeAll(() => {
    service = new UserService()
  })

  describe('when authenticated', () => {
    beforeEach(() => {
      service.login({ username: 'admin', password: 'pass' })
    })

    afterEach(() => {
      service.logout()
    })

    test('can fetch profile', async () => {
      const profile = await service.getProfile()
      expect(profile).toBeDefined()
    })

    test('can update settings', async () => {
      await expect(service.updateSettings({ theme: 'dark' })).resolves.toBeTruthy()
    })
  })

  describe('when unauthenticated', () => {
    test('cannot fetch profile', async () => {
      await expect(service.getProfile()).rejects.toThrow('Unauthorized')
    })
  })
})
```

**Execution order:** outer `beforeEach` runs before inner `beforeEach`, inner `afterEach` before outer `afterEach`.

## Setup Files (vitest.config.ts)

Setup files run before each test file. Use for global setup:

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Auto-cleanup after each React test
afterEach(() => {
  cleanup()
})
```

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

## Global Setup / Teardown

Runs once before all test files start (not per-file):

```ts
// global-setup.ts
export async function setup() {
  await startDockerDatabase()
}

export async function teardown() {
  await stopDockerDatabase()
}
```

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    globalSetup: ['./global-setup.ts'],
  },
})
```

## File Organization Conventions

```
src/
├── utils/
│   ├── math.ts
│   └── math.test.ts          # co-located with source
├── api/
│   ├── users.ts
│   └── users.test.ts
├── components/
│   ├── Button.tsx
│   └── Button.spec.tsx        # .spec also works
└── test/
    ├── setup.ts               # setupFiles
    ├── helpers.ts             # shared test utilities
    └── fixtures/              # test data
        └── users.json
```

**Convention:** Place test files next to the code they test (`*.test.ts` or `*.spec.ts`). Shared test utilities go in a `test/` directory.

**Why this works:** Hooks scope to their `describe` block, preventing state leaks. Setup files handle cross-cutting concerns (DOM cleanup, global mocks). `beforeAll`/`afterAll` minimize expensive operations (DB connections, server starts).

<!-- References:
- https://vitest.dev/guide/learn/setup-teardown
- https://vitest.dev/guide/lifecycle
- https://vitest.dev/config/
-->
