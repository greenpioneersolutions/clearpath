// ── ClearMemory types — re-export shim ─────────────────────────────────────
// Canonical definitions live in `src/shared/clearmemory/types.ts` so both
// main-process handlers and renderer components can share a single source of
// truth. This file exists solely for back-compat with earlier imports that
// reached into `../clearmemory/types` from within `src/main`.
//
// New code should import directly from the shared module:
//   main:     import type { … } from '../../shared/clearmemory/types'
//   renderer: import type { … } from '../../../shared/clearmemory/types'

export * from '../../shared/clearmemory/types'
