import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
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
      ],
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Use workspace-style environment selection via file-level comments
    // Default to node for main process tests
    environment: 'node',
    // Allow per-file environment override via @vitest-environment comment
    environmentMatchGlobs: [
      ['src/renderer/**/*.{test,spec}.{ts,tsx}', 'jsdom'],
    ],
    globals: true,
  },
})
