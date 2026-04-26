import { describe, it, expect } from 'vitest'
import {
  BUILD_FLAGS,
  EXPERIMENTAL_FLAG_KEYS,
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_META,
  isExperimentalFlag,
} from './featureFlags.generated'

describe('featureFlags.generated', () => {
  it('exposes a complete metadata entry for every key', () => {
    for (const key of FEATURE_FLAG_KEYS) {
      const meta = FEATURE_FLAG_META[key]
      expect(meta).toBeDefined()
      expect(typeof meta.experimental).toBe('boolean')
      expect(typeof meta.enabled).toBe('boolean')
    }
  })

  it('experimental keys are a subset of all keys and reflect metadata', () => {
    for (const key of EXPERIMENTAL_FLAG_KEYS) {
      expect(FEATURE_FLAG_KEYS).toContain(key)
      expect(FEATURE_FLAG_META[key].experimental).toBe(true)
      expect(isExperimentalFlag(key)).toBe(true)
    }
  })

  it('disabled experimental flags resolve in BUILD_FLAGS according to the build environment', () => {
    // `pretest` regenerates featureFlags.generated using the current process
    // environment, so this assertion has to mirror what the generator
    // observed: when CLEARPATH_E2E_EXPERIMENTAL is set the generator
    // intentionally forces every experimental flag on regardless of
    // features.json; otherwise disabled experimental flags must remain false.
    const expected =
      process.env.CLEARPATH_E2E_EXPERIMENTAL === '1' ||
      process.env.CLEARPATH_E2E_EXPERIMENTAL === 'true'
    for (const key of EXPERIMENTAL_FLAG_KEYS) {
      const meta = FEATURE_FLAG_META[key]
      if (!meta.enabled) {
        expect(BUILD_FLAGS[key]).toBe(expected)
      }
    }
  })

  it('non-experimental flags use their metadata enabled value', () => {
    for (const key of FEATURE_FLAG_KEYS) {
      const meta = FEATURE_FLAG_META[key]
      if (!meta.experimental) {
        expect(BUILD_FLAGS[key]).toBe(meta.enabled)
      }
    }
  })
})
