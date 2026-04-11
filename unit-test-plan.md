# Unit Test Plan — CoPilot Commander

**Date started:** April 9, 2026  
**Goal:** Reach ~80–90% coverage on complex modules, 100% on pure utilities.  
**Coverage tool:** Vitest + `@vitest/coverage-v8`  
**Test runner:** `npm run test` / `npm run test:coverage`  
**Related files:**
- `vitest.config.ts` — configuration, environment routing (node vs. jsdom), coverage include/exclude rules
- `src/test/electron-mock.ts` — lightweight Electron mock for the test environment
- `src/test/setup-coverage.ts` — global setup file
- `BUGS.md` — all bugs discovered during test writing (do NOT fix them, only document)

---

## Current State (as of April 12, 2026)

### Test Run Summary

```
Test Files:  5 failed | 27 passed  (32 total)
Tests:       10 failed | 965 passing
```

All 10 failures are **pre-existing** (not introduced by this test effort):
- 5 in `ClaudeCodeAdapter.test.ts` — ESM mock hoisting issue (isInstalled/isAuthenticated)
- 5 in `__diagtest*.test.ts` — diagnostic/scratch files with known mock issues

### Wallaby Coverage Summary (per-file)

| File | Coverage | Tests |
|------|----------|-------|
| `AgentManager.ts` | 100% | 56 |
| `rateLimiter.ts` | 100% | 5 |
| `LocalModelAdapter.ts` | **100%** | 78 |
| `FeatureFlagContext.tsx` | 100% | 9 |
| `starter-pack/agents.ts` | 100% | 15 |
| `starter-pack/skills.ts` | 100% | 8 |
| `starter-pack/memories.ts` | 100% | 10 |
| `starter-pack/prompts.ts` | 100% | 9 |
| `SchedulerService.ts` | 98.31% | 56 |
| `CopilotAdapter.ts` | **97.63%** | 74 |
| `shellEnv.ts` | 96.77% | — |
| `BrandingContext.tsx` | 95.28% | 9 |
| `CLIManager.ts` | **95.28%** | 103 |
| `logger.ts` | 95.24% | 10 |
| `pathSecurity.ts` | 94.64% | 12 |
| `AuthManager.ts` | 94.54% | 49 |
| `storeEncryption.ts` | 93.48% | 9 |
| `credentialStore.ts` | 97.37% | 22 |
| `AccessibilityContext.tsx` | 90.91% | 10 |
| `ClaudeCodeAdapter.ts` | 90.87% | — |
| `NotificationManager.ts` | 90.96% | 69 |
| `starter-pack/handoff.ts` | 82.93% | 20 |

### Previously Failing Tests (still pre-existing)

| File | Test | Root Cause |
|------|------|-----------|
| `src/main/utils/logger.test.ts` | `log.error() calls console.error` | Module-level constants in `logger.ts` are frozen at import time; spy on `console` must be set up before the dynamic `import()` resolves, OR the module needs `vi.resetModules()` between tests. The `warn` level check in the test env filters out calls because `CLEARPATH_LOG_LEVEL` may be resolving differently in CI vs. the spy setup order. |
| `src/main/utils/logger.test.ts` | `log.warn() calls console.warn` | Same root cause as above. |
| `src/main/utils/logger.test.ts` | `log.error() passes through multiple arguments` | Same root cause as above. |
| `src/main/utils/logger.test.ts` | `log.warn() passes through multiple arguments` | Same root cause as above. |
| `src/main/utils/storeEncryption.test.ts` | `reports first run when no fingerprint file exists` | `vi.mock('fs')` is hoisted by Vitest but mock variable declarations are not — see BUG-001 in `BUGS.md`. |
| `src/main/utils/storeEncryption.test.ts` | `reports changed when stored fingerprint differs` | Same as above (BUG-001). |
| `src/main/utils/storeEncryption.test.ts` | `always attempts to create the key directory` | Same as above (BUG-001). |
| `src/main/utils/storeEncryption.test.ts` | `handles writeFileSync failure on first run gracefully` | Same as above (BUG-001). |

### What Needs to be Fixed in logger.test.ts

The `logger.ts` module computes `configuredLevel` and `currentPriority` **at module load time** as top-level constants. This means:

1. The very first `import('./logger')` in a test file freezes the level for the rest of the file's lifetime.
2. Spying on `console.error` / `console.warn` **before** the dynamic import is the right approach but the `consoleSpy` setup in `beforeAll` may race with module caching.

**Recommended fix:** Use `vi.resetModules()` before each dynamic `import('./logger')` in the `'default level = warn'` suite so the spy is registered on a fresh module. Alternatively, restructure the `beforeEach`/`afterEach` lifecycle to guarantee spy setup before module evaluation.

### What Needs to be Fixed in storeEncryption.test.ts

See `BUGS.md` BUG-001. The fix is to use `vi.hoisted()` to declare mock variables so they are available when the hoisted `vi.mock('fs')` factory runs. Example pattern:

```ts
const { mkdirSyncMock, existsSyncMock, readFileSyncMock, writeFileSyncMock } = vi.hoisted(() => ({
  mkdirSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, mkdirSync: mkdirSyncMock, existsSync: existsSyncMock, readFileSync: readFileSyncMock, writeFileSync: writeFileSyncMock }
})
```

---

## Files With Existing Tests ✅

### Main Process — CLI

| File | Test File | Status | Coverage | Notes |
|------|-----------|--------|----------|-------|
| `src/main/cli/CopilotAdapter.ts` | `CopilotAdapter.test.ts` | ✅ 74 passing | 97.63% | buildArgs (all branches), parseOutput, parseJsonEvent, isInstalled, isAuthenticated, startSession, sendInput, sendSlashCommand |
| `src/main/cli/CLIManager.ts` | `CLIManager.test.ts` | ✅ 103 passing | 95.28% | Session CRUD, search, cost estimation, audit, startSession/stopSession, sendInput, attachListeners (stdout/stderr/error/exit), spawnSubAgent, sub-agent lifecycle |
| `src/main/cli/LocalModelAdapter.ts` | `LocalModelAdapter.test.ts` | ✅ 78 passing | 100% | All methods including HTTP internals (ping, httpGet, httpPost) |
| `src/main/cli/ClaudeCodeAdapter.ts` | `ClaudeCodeAdapter.test.ts` | ❌ 5 failing | 90.87% | ESM mock hoisting issue for isInstalled/isAuthenticated |

### Main Process — Services

| File | Test File | Status | Coverage | Notes |
|------|-----------|--------|----------|-------|
| `src/main/agents/AgentManager.ts` | `AgentManager.test.ts` | ✅ 56 passing | 100% | Full coverage |
| `src/main/auth/AuthManager.ts` | `AuthManager.test.ts` | ✅ 49 passing | 94.54% | Auth checks, cache logic, login/cancel |
| `src/main/notifications/NotificationManager.ts` | `NotificationManager.test.ts` | ✅ 69 passing | 90.96% | emit, quiet hours, SSRF, redactSecrets, CRUD |
| `src/main/scheduler/SchedulerService.ts` | `SchedulerService.test.ts` | ✅ 56 passing | 98.31% | Job CRUD, templates, interval estimation, missed runs |

### Main Process — Utilities

| File | Test File | Status | Coverage | Notes |
|------|-----------|--------|----------|-------|
| `src/main/utils/pathSecurity.ts` | `pathSecurity.test.ts` | ✅ 12 passing | 94.64% | Good coverage |
| `src/main/utils/rateLimiter.ts` | `rateLimiter.test.ts` | ✅ 5 passing | 100% | All passing |
| `src/main/utils/credentialStore.ts` | `credentialStore.test.ts` | ✅ 22 passing | 97.37% | safeStorage mock, CRUD |
| `src/main/utils/storeEncryption.ts` | `storeEncryption.test.ts` | ❌ 4 failing | 93.48% | BUG-001 — vi.mock hoisting |
| `src/main/utils/logger.ts` | `logger.test.ts` | ❌ 4 failing | 95.24% | Spy setup timing vs. module caching |
| `src/main/utils/shellEnv.ts` | `shellEnv.test.ts` | ✅ passing | 96.77% | — |
| `src/renderer/src/types/cost.ts` | `cost.test.ts` | ✅ 10 passing | — | estimateCost, MODEL_PRICING, DEFAULT_BUDGET |

### Main Process — Starter Pack

| File | Test File | Status | Coverage | Notes |
|------|-----------|--------|----------|-------|
| `src/main/starter-pack/agents.ts` | `agents.test.ts` | ✅ 15 passing | 100% | Array integrity, required fields |
| `src/main/starter-pack/skills.ts` | `skills.test.ts` | ✅ 8 passing | 100% | — |
| `src/main/starter-pack/memories.ts` | `memories.test.ts` | ✅ 10 passing | 100% | — |
| `src/main/starter-pack/prompts.ts` | `prompts.test.ts` | ✅ 9 passing | 100% | — |
| `src/main/starter-pack/handoff.ts` | `handoff.test.ts` | ✅ 20 passing | 82.93% | — |

### Renderer — Types & Settings

| File | Test File | Status | Notes |
|------|-----------|--------|-------|
| `src/renderer/src/types/notification.ts` | `notification.test.ts` | ✅ 7 passing | — |
| `src/renderer/src/types/settings.ts` | `settings.test.ts` | ✅ 14 passing | — |
| `src/renderer/src/types/template.ts` | `template.test.ts` | ✅ 4 passing | — |
| `src/renderer/src/types/accessibility.ts` | `accessibility.test.ts` | ✅ 3 passing | — |
| `src/renderer/src/types/prScores.ts` | `prScores.test.ts` | ✅ 9 passing | — |
| `src/renderer/src/types/tools.ts` | `tools.test.ts` | ✅ 3 passing | — |
| `src/renderer/src/components/settings/flagDefs.ts` | `flagDefs.test.ts` | ✅ 14 passing | — |

### Renderer — Hooks & Contexts

| File | Test File | Status | Coverage | Notes |
|------|-----------|--------|----------|-------|
| `src/renderer/src/hooks/useFocusTrap.ts` | `useFocusTrap.test.ts` | ✅ 9 passing | — | — |
| `src/renderer/src/hooks/useKeyboardShortcuts.ts` | `useKeyboardShortcuts.test.tsx` | ✅ 14 passing | — | — |
| `src/renderer/src/contexts/AccessibilityContext.tsx` | `AccessibilityContext.test.tsx` | ✅ 10 passing | 90.91% | — |
| `src/renderer/src/contexts/FeatureFlagContext.tsx` | `FeatureFlagContext.test.tsx` | ✅ 9 passing | 100% | — |
| `src/renderer/src/contexts/BrandingContext.tsx` | `BrandingContext.test.tsx` | ✅ 9 passing | 95.28% | — |

---

## Remaining Coverage Opportunities 🔲

All P1 and P2 modules now have tests. The following areas could benefit from additional coverage:

### Renderer — Components & Pages (P3 — complex, defer)

IPC-heavy React components (pages, most UI components) require heavy `window.electronAPI` mocking and full React render trees. Start with the simplest/most-pure components:

- `src/renderer/src/components/shared/EmptyState.tsx` — pure presentational
- `src/renderer/src/components/ModeIndicator.tsx` — pure presentational
- `src/renderer/src/components/shared/SessionSummary.tsx` — mostly presentational

### IPC Handlers (P3 — skip for now)

IPC handler files (`src/main/ipc/`) are thin wrappers that delegate to services. They require full Electron mocking. Cover them via integration tests when available; unit tests provide low value here vs. cost of setup.

### Pre-existing Failing Tests to Fix

- **ClaudeCodeAdapter.test.ts** (5 failures) — ESM mock hoisting issue for isInstalled/isAuthenticated. Needs `vi.hoisted()` + proper mock factory pattern.
- **logger.test.ts** (4 failures) — Spy setup timing vs. module caching. Needs `vi.resetModules()` restructuring.
- **storeEncryption.test.ts** (4 failures) — BUG-001, `vi.mock` hoisting issue. Needs `vi.hoisted()` pattern.
- **__diagtest*.test.ts** (5 failures) — Diagnostic scratch files, can be deleted.

---

## Key Mocking Patterns to Follow

### Electron modules
`electron` is already aliased to `src/test/electron-mock.ts` in `vitest.config.ts`. Add any missing mock exports there rather than per-test mocking.

### electron-store
```ts
vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
    })),
  }
})
```

### child_process (execFile / spawn)
```ts
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, execFile: vi.fn(), spawn: vi.fn() }
})
```

### vi.hoisted() for variables used in vi.mock() factories
```ts
const { myMock } = vi.hoisted(() => ({ myMock: vi.fn() }))
vi.mock('some-module', () => ({ myFn: myMock }))
```

### fs mocking
Use `vi.hoisted()` pattern (see storeEncryption fix above). Never `const mockFn = vi.fn()` before a `vi.mock()` of the same module in the same file.

---

## Completed Work Order

1. ✅ Write starter-pack tests (agents, skills, memories, prompts, handoff) — 62 tests
2. ✅ Write renderer type tests (notification, settings, template, accessibility, prScores, tools, flagDefs) — 54 tests
3. ✅ Write `NotificationManager.test.ts` — 69 tests
4. ✅ Write `AgentManager.test.ts` — 56 tests
5. ✅ Write `credentialStore.test.ts` — 22 tests
6. ✅ Write `SchedulerService.test.ts` — 56 tests
7. ✅ Write `AuthManager.test.ts` — 49 tests
8. ✅ Write `LocalModelAdapter.test.ts` — 78 tests (100% coverage)
9. ✅ Write renderer hook tests (useFocusTrap, useKeyboardShortcuts) — 23 tests
10. ✅ Write renderer context tests (Accessibility, FeatureFlag, Branding) — 28 tests
11. ✅ Write `CLIManager.test.ts` — 103 tests (95.28% coverage)
12. ✅ Boost `CopilotAdapter.test.ts` — 74 tests (97.63% coverage)
13. ✅ Boost `CLIManager.test.ts` additional coverage — attachListeners, sendInput, spawnSubAgent, sub-agent lifecycle
14. ✅ Boost `LocalModelAdapter.test.ts` HTTP internals — ping, httpGet, httpPost

### Bugs Discovered During Testing
- BUG-001: storeEncryption vi.mock hoisting
- BUG-002: NotificationManager quiet hours midnight boundary
- BUG-003: AgentManager frontmatter inline list override
- BUG-004: SchedulerService estimate interval stepped hours
- BUG-005: ClaudeCodeAdapter.test.ts afterEach assigned instead of called
- BUG-006: skills.ts Document Builder/Concept Explainer empty primaryAgents
- BUG-007: handoff.ts matchesTriggerCondition keyword overlap
- BUG-008: NotificationManager isWebhookUrlSafe IPv6 SSRF bypass (HIGH)
- BUG-009: SchedulerService weekly cron misclassified as daily
- BUG-010: CLIManager headless sessions skip cost persistence

---

## Coverage Exclusions (from vitest.config.ts)

The following are excluded from coverage reports and do NOT need tests:
- `src/**/index.ts` / `src/**/index.tsx`
- `src/main/index.ts`
- `src/renderer/src/main.tsx`
- `src/**/*.d.ts`
- `src/**/types.ts` and `src/**/types/**`
- All `*.test.ts` / `*.spec.ts` files
- `src/test/**`

---

## How to Run

```bash
# Run all tests once
npm run test

# Run all tests with coverage report
npm run test:coverage

# Run a specific test file
npx vitest run src/main/utils/logger.test.ts

# Run tests in watch mode
npm run test:watch
```

Coverage report (HTML) is written to `./coverage/lcov-report/index.html`.
