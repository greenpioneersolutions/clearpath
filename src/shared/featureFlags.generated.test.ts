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

  it('disabled experimental flags resolve to false in BUILD_FLAGS at default build time', () => {
    // CLEARPATH_E2E_EXPERIMENTAL was not set during this test run, so any
    // experimental flag with enabled:false in features.json must surface as
    // false here. If the generator regresses and inlines the wrong value,
    // experimental code paths will leak into the production bundle.
    for (const key of EXPERIMENTAL_FLAG_KEYS) {
      const meta = FEATURE_FLAG_META[key]
      if (!meta.enabled) {
        expect(BUILD_FLAGS[key]).toBe(false)
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
