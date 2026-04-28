/**
 * Coverage setup for Vitest and Wallaby.
 *
 * Wallaby's instrumentation engine only instruments files that are actually
 * imported during a test run. Files that no test imports get `null` coverage
 * and are excluded from the overall percentage — making coverage appear much
 * higher than it really is.
 *
 * This setup file force-loads every source file via import.meta.glob so that
 * Wallaby (and Vitest's V8 provider) can see them all. Individual load failures
 * are silently swallowed so a broken file never fails the whole test suite.
 */

// Polyfill window.localStorage / sessionStorage when running under jsdom.
// jsdom's opaque-origin default leaves them as bare `{}`, so any test that
// calls `localStorage.clear()` blows up before its first assertion. We install
// a minimal in-memory Storage shim once, only when the host environment hasn't
// already provided a working one.
if (typeof window !== 'undefined') {
  const installStorage = (key: 'localStorage' | 'sessionStorage') => {
    const existing = (window as unknown as Record<string, unknown>)[key]
    const hasWorking = existing && typeof (existing as { clear?: unknown }).clear === 'function'
    if (hasWorking) return
    const store = new Map<string, string>()
    const shim: Storage = {
      get length() { return store.size },
      clear: () => { store.clear() },
      getItem: (k) => (store.has(k) ? store.get(k)! : null),
      setItem: (k, v) => { store.set(k, String(v)) },
      removeItem: (k) => { store.delete(k) },
      key: (i) => Array.from(store.keys())[i] ?? null,
    }
    Object.defineProperty(window, key, { value: shim, writable: true, configurable: true })
  }
  installStorage('localStorage')
  installStorage('sessionStorage')
}

const modules = import.meta.glob<Record<string, unknown>>(
  [
    '../main/**/*.ts',
    '../renderer/src/**/*.{ts,tsx}',
    '../preload/**/*.ts',
    '!../**/*.{test,spec}.{ts,tsx}',
    '!../**/index.ts',
    '!../**/index.tsx',
    '!../**/*.d.ts',
    '!../**/types.ts',
    '!../**/types/**',
    '!../test/**',
  ],
  { eager: false }
)

// Load every matched file, silently ignoring failures so a single broken
// import (e.g. a file with unexpected side-effects) never fails unrelated tests.
await Promise.allSettled(Object.values(modules).map((load) => load()))
