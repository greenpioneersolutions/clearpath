# Mocking Globals & Requests

Complete reference for mocking global variables, environment variables, and HTTP requests in Vitest.

---

## Mocking Global Variables

### vi.stubGlobal()

Replace any global variable (`window`, `document`, `navigator`, custom globals):

```ts
import { vi, afterEach } from 'vitest'

// Mock IntersectionObserver
const IntersectionObserverMock = vi.fn(class {
  disconnect = vi.fn()
  observe = vi.fn()
  takeRecords = vi.fn()
  unobserve = vi.fn()
})
vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)

// Mock fetch
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ ok: true }))
))

// Mock window.matchMedia
vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
  matches: false,
  addListener: vi.fn(),
  removeListener: vi.fn(),
}))
```

### Cleanup

```ts
afterEach(() => {
  vi.unstubAllGlobals()  // restore all stubs
})
```

Or configure automatic cleanup:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    unstubGlobals: true,  // auto-restore after each test
  },
})
```

**Important:** Vitest does NOT reset stubbed globals by default. Always clean up manually or via config.

---

## Mocking Environment Variables

### vi.stubEnv()

Override `process.env` and `import.meta.env` values:

```ts
import { vi, afterEach } from 'vitest'

test('uses API URL from env', () => {
  vi.stubEnv('API_URL', 'http://test.local')
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('DEBUG', undefined)  // remove a variable

  expect(process.env.API_URL).toBe('http://test.local')
  expect(import.meta.env.API_URL).toBe('http://test.local')
})

afterEach(() => {
  vi.unstubAllEnvs()  // restore original values
})
```

Or configure automatic cleanup:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    unstubEnvs: true,  // auto-restore after each test
  },
})
```

### Common Env Patterns

```ts
// Test environment-dependent behavior
describe('feature flags', () => {
  afterEach(() => vi.unstubAllEnvs())

  test('enables feature in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('FEATURE_FLAG', 'true')
    expect(isFeatureEnabled()).toBe(true)
  })

  test('disables feature in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('FEATURE_FLAG', 'false')
    expect(isFeatureEnabled()).toBe(false)
  })
})
```

---

## Mocking HTTP Requests

### Strategy: Mock Service Worker (MSW)

MSW is the recommended approach for mocking network requests. It intercepts requests at the network level without modifying application code.

```bash
npm install -D msw
```

### Setup File Pattern

```ts
// src/test/mocks/server.ts
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('https://api.example.com/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])
  }),

  http.post('https://api.example.com/users', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({ id: 3, ...body }, { status: 201 })
  }),

  http.get('https://api.example.com/users/:id', ({ params }) => {
    return HttpResponse.json({ id: Number(params.id), name: 'User' })
  }),
]

export const server = setupServer(...handlers)
```

### Test Setup (vitest.config.ts setupFiles)

```ts
// src/test/setup.ts
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

### Per-Test Handler Overrides

```ts
import { server } from './mocks/server'
import { http, HttpResponse } from 'msw'

test('handles API error', async () => {
  server.use(
    http.get('https://api.example.com/users', () => {
      return HttpResponse.json({ error: 'Server Error' }, { status: 500 })
    })
  )

  const result = await fetchUsers()
  expect(result.error).toBe('Server Error')
})
```

### GraphQL Mocking

```ts
import { graphql, HttpResponse } from 'msw'

const graphqlHandlers = [
  graphql.query('GetUser', ({ variables }) => {
    return HttpResponse.json({
      data: { user: { id: variables.id, name: 'Alice' } },
    })
  }),

  graphql.mutation('CreateUser', ({ variables }) => {
    return HttpResponse.json({
      data: { createUser: { id: 1, ...variables } },
    })
  }),
]
```

### WebSocket Mocking

```ts
import { ws } from 'msw'

const chat = ws.link('wss://chat.example.com')

const wsHandlers = [
  chat.addEventListener('connection', ({ client }) => {
    client.addEventListener('message', (event) => {
      client.send(`Echo: ${event.data}`)
    })
  }),
]
```

---

## Simple Fetch Mocking (Without MSW)

For simpler cases, mock `fetch` directly with `vi.stubGlobal`:

```ts
test('fetches data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ id: 1, name: 'Alice' }),
  }))

  const result = await fetchUser(1)
  expect(result.name).toBe('Alice')
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/users/1'))
})
```

**Note:** `vi.stubGlobal('fetch', ...)` is simpler but less realistic than MSW. MSW intercepts at the network layer and works with any HTTP client library.

---

## Quick Reference

| Task | Method |
|------|--------|
| Mock a global variable | `vi.stubGlobal(name, value)` |
| Restore all globals | `vi.unstubAllGlobals()` |
| Auto-restore globals | `unstubGlobals: true` in config |
| Mock an env variable | `vi.stubEnv(name, value)` |
| Restore all env vars | `vi.unstubAllEnvs()` |
| Auto-restore env vars | `unstubEnvs: true` in config |
| Mock HTTP requests | MSW `setupServer()` + handlers |
| Override handler per-test | `server.use(http.get(...))` |

<!-- References:
- https://vitest.dev/guide/mocking/globals
- https://vitest.dev/guide/mocking/requests
- https://mswjs.io/docs
-->
