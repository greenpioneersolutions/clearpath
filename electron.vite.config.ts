import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

// Build-time feature-flag substitution. We read features.json once at config
// load and emit a `__FEATURES__` global that gets inlined as a literal in both
// the renderer and the main bundle. That makes `if (__FEATURES__.showFoo)`
// statically known at compile time so Rollup can drop disabled experimental
// branches from the production bundle.
//
// The matching TS module (src/shared/featureFlags.generated.ts) gives the
// renderer/main code a typed view of the same flag data via BUILD_FLAGS.
// BUILD_FLAGS is a generation-time literal written by
// scripts/generate-feature-flags.mjs from features.json (+ the same
// CLEARPATH_E2E_EXPERIMENTAL env var), while `__FEATURES__` is the Vite
// `define` literal that survives bundling and lets Rollup constant-fold +
// tree-shake disabled experimental code paths.

interface FeatureDef {
  experimental: boolean
  enabled: boolean
}

interface FeaturesFile {
  flags: Record<string, FeatureDef>
}

function loadFeatures(): Record<string, boolean> {
  const featuresPath = resolve(__dirname, 'features.json')
  const raw = readFileSync(featuresPath, 'utf-8')
  const parsed = JSON.parse(raw) as FeaturesFile
  // Set CLEARPATH_E2E_EXPERIMENTAL=1 to force every experimental flag on for
  // the build. Used by the experimental-features e2e crawl.
  const forceExperimentalOn =
    process.env.CLEARPATH_E2E_EXPERIMENTAL === '1' ||
    process.env.CLEARPATH_E2E_EXPERIMENTAL === 'true'
  const out: Record<string, boolean> = {}
  for (const [key, def] of Object.entries(parsed.flags)) {
    out[key] = def.experimental && forceExperimentalOn ? true : def.enabled
  }
  return out
}

function regenerateFeatureFlagsModule(): void {
  // Keep the generated TS module in sync with features.json on every build.
  // We always rethrow on failure — silently using the existing module would
  // let the build proceed with `__FEATURES__` (computed below from the
  // current features.json) and BUILD_FLAGS (frozen at the previous
  // generation) drifting apart. That divergence shows up as runtime UI
  // state disagreeing with the tree-shaken bundle.
  execFileSync(
    process.execPath,
    [resolve(__dirname, 'scripts/generate-feature-flags.mjs')],
    { stdio: 'inherit' },
  )
}

regenerateFeatureFlagsModule()
const featureFlags = loadFeatures()
// JSON.stringify the whole object so Vite injects a single literal — keeps
// the bundle small and lets Rollup constant-fold property reads.
const featureFlagsLiteral = JSON.stringify(featureFlags)

// CLEARPATH_FLAGS_LOCKED=1 lock state is consumed at runtime via
// BUILD_FLAGS_LOCKED in src/shared/featureFlags.generated.ts (the generator
// reads the same env var). Locked-mode logic does not need a Vite define.
const sharedDefine = {
  __FEATURES__: featureFlagsLiteral,
}

export default defineConfig({
  main: {
    define: sharedDefine,
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: 'src/main/index.ts'
        }
      }
    }
  },
  preload: {
    define: sharedDefine,
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: 'src/preload/index.ts'
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    define: sharedDefine,
    build: {
      rollupOptions: {
        input: {
          index: 'src/renderer/index.html'
        }
      }
    },
    plugins: [react()]
  }
})
