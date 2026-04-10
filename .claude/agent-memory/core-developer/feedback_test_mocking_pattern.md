---
name: Module-level singleton mocking pattern
description: How to mock electron-store and other module-level singletons in Vitest tests — vi.resetModules + dynamic import is required
type: feedback
---

Module-level singletons (like `sessionStore` in CLIManager.ts) require `vi.resetModules()` + dynamic import in beforeEach. Static imports do NOT work because the singleton is created once at module load and persists across tests.

**Why:** The singleton captures mock references at import time. Without resetModules, `vi.clearAllMocks()` clears the mock functions but the singleton retains the old instance, accumulating state across tests (e.g., 50 sessions from persistent calls to `set()`).

**How to apply:** For any test file where the SUT has a module-level `new Store(...)` or similar singleton:

1. Use `vi.hoisted()` for mock state (mockGet, mockSet, adapter mocks)
2. Use `vi.mock(...)` with classes (not arrow functions) for constructors — arrow functions can't be used with `new`
3. In beforeEach: `vi.resetModules()` → `vi.clearAllMocks()` → re-set defaults → `const mod = await import('./Module')`
4. For adapter constructors, use class syntax in vi.mock factories (not `vi.fn().mockImplementation(() => obj)`) because `vi.clearAllMocks()` removes the implementation and arrow functions aren't constructable

Pattern from AuthManager.test.ts is the canonical reference.

Also: `getWebContents() => null` causes early returns in event handlers (exit, stdout etc). Use `{ send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }` as mock WebContents.
