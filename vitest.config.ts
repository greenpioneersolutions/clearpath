import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'path'

// Build-time feature-flag substitution must also apply when Vitest evaluates
// renderer files. Without this, any module that reads `__FEATURES__` (e.g.
// Connect.tsx, App.tsx) throws `__FEATURES__ is not defined` at import time
// and any test that transitively pulls them in fails before its first
// assertion. We mirror the same env-aware logic used by
// electron.vite.config.ts so the values stay identical across build pipelines.
interface FeaturesFile {
  flags: Record<string, { experimental: boolean; enabled: boolean }>
}
const featuresPath = resolve(__dirname, 'features.json')
const features = JSON.parse(readFileSync(featuresPath, 'utf-8')) as FeaturesFile
const expEnv =
  process.env.CLEARPATH_E2E_EXPERIMENTAL === '1' ||
  process.env.CLEARPATH_E2E_EXPERIMENTAL === 'true'
const featureFlags: Record<string, boolean> = {}
for (const [key, def] of Object.entries(features.flags)) {
  featureFlags[key] = def.experimental && expEnv ? true : def.enabled
}

export default defineConfig({
  define: {
    __FEATURES__: JSON.stringify(featureFlags),
  },
  resolve: {
    alias: {
      // Redirect all 'electron' imports to a lightweight mock so that
      // main-process and renderer files can be loaded (and coverage-
      // instrumented) in the Node.js/jsdom test environment used by
      // Vitest and Wallaby.
      electron: resolve(__dirname, 'src/test/electron-mock.ts'),
    },
  },
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      all: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/index.ts',
        'src/**/index.tsx',
        'src/main/index.ts',
        'src/renderer/src/main.tsx',
        'src/**/*.d.ts',
        'src/**/types.ts',
        'src/**/types/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/test/**',
      ],
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['src/test/setup-coverage.ts'],
    // Use workspace-style environment selection via file-level comments
    // Default to node for main process tests
    environment: 'node',
    // Allow per-file environment override via @vitest-environment comment
    environmentMatchGlobs: [
      ['src/renderer/**/*.{test,spec}.{ts,tsx}', 'jsdom'],
    ],
    // jsdom defaults to an opaque origin (about:blank) which disables
    // localStorage / sessionStorage. Providing a real URL gives us a
    // working Storage instance with .clear() / .setItem() / etc., so tests
    // that exercise persistence (QuickStartCard, ActiveSessionsBanner, etc.)
    // don't trip on `localStorage.clear is not a function`.
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    globals: true,
  },
})
