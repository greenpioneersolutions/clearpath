# Feature Flags

`features.json` is the single source of truth for every base-app flag. This doc explains:
- the data model
- the build-time and runtime pipelines that consume it
- the env vars that change behavior (`CLEARPATH_FLAGS_LOCKED`, `CLEARPATH_E2E_EXPERIMENTAL`)
- the dev / preview workflows for each shape of "what would the user see?"

Extension-contributed flags are out of scope here — only base-app flags live in `features.json`.

---

## The data model

Every entry in `features.json` has two booleans:

| Field | Meaning |
|-------|---------|
| `experimental` | The flag's *code* may be tree-shaken from the bundle when disabled. Use this for surfaces (pages, services) we want shipped only when explicitly turned on. |
| `enabled` | The flag's default value at build time. |

These two dimensions give four behaviors:

| `experimental` | `enabled` | Result |
|---|---|---|
| `false` | `true` | Always-on built-in feature. Shipped, on, user can toggle off in Settings. |
| `false` | `false` | Always-shipped, off-by-default feature. User can flip it on in Settings → Feature Flags. |
| `true` | `true` | Experimental feature, currently rolled out by default. Code is in the bundle. |
| `true` | `false` | Experimental feature, **stripped from the production bundle**. Cannot be toggled on at runtime. To get visibility for screenshots/dev, build with `CLEARPATH_E2E_EXPERIMENTAL=1`. |

The "stripped from the production bundle" claim is verifiable — see [How tree-shaking works](#how-tree-shaking-works) below.

---

## How it flows through the build

Two pipelines read `features.json`. They have to stay in sync.

### 1. Build-time substitution (Vite `define`)

[electron.vite.config.ts](electron.vite.config.ts) reads `features.json` at config-load time and emits a `__FEATURES__` Vite `define` constant — a single JSON literal with one boolean per flag. That literal is inlined into the bundle, so an expression like:

```ts
declare const __FEATURES__: Readonly<FeatureFlags>
const PrScores = __FEATURES__.showPrScores ? lazy(() => import('./pages/PrScores')) : null
```

becomes, after Rollup constant-folding:

```ts
const PrScores = false ? lazy(() => import('./pages/PrScores')) : null
// → const PrScores = null
```

Rollup then drops the dynamic `import()` and the `./pages/PrScores` chunk never lands in `out/`. This is the mechanism that lets us merge experimental code while keeping it out of normal builds.

### 2. Generation-time TypeScript module

[scripts/generate-feature-flags.mjs](scripts/generate-feature-flags.mjs) reads the same `features.json` and writes [src/shared/featureFlags.generated.ts](src/shared/featureFlags.generated.ts), which exports:

| Export | Purpose |
|--------|---------|
| `FeatureFlagKey` | Union type of every flag name. |
| `FeatureFlags` | Object type — one boolean per flag. |
| `BUILD_FLAGS` | Frozen literal of effective per-build defaults. Same data as `__FEATURES__`. |
| `BUILD_FLAGS_LOCKED` | `true` when the build was produced with `CLEARPATH_FLAGS_LOCKED=1`. |
| `FEATURE_FLAG_META` | Per-flag `{ experimental, enabled, addedIn }` for the UI / tests. |
| `FEATURE_FLAG_KEYS` / `EXPERIMENTAL_FLAG_KEYS` | Iterable key lists. |
| `isExperimentalFlag(key)` / `isExperimentalFlagEnabledAtBuild(key)` | Helpers — note that the latter does a *computed* lookup and is **not** tree-shakeable. |

The script runs automatically via `predev` / `prebuild` / `pretest` hooks, and again at `electron.vite.config.ts` load time as a belt-and-suspenders. Manual: `npm run generate:flags`.

### 3. Runtime layer

[src/main/ipc/featureFlagHandlers.ts](src/main/ipc/featureFlagHandlers.ts) starts from `BUILD_FLAGS` and merges per-user overrides from `electron-store`. [FeatureFlagContext.tsx](src/renderer/src/contexts/FeatureFlagContext.tsx) exposes the merged values to React.

Two safety rails:

- `clampToCompiledIn` — experimental flags whose code is tree-shaken can never be turned on at runtime, even if a stored override says `true`.
- `feature-flags:set` deletes (rather than persists `false` for) compiled-out experimental keys, so a stale override doesn't override a future default-on if the flag later becomes compiled-in.

---

## Env vars

Two env vars change generated/build output. They compose freely.

### `CLEARPATH_E2E_EXPERIMENTAL=1`

Forces every `experimental: true` flag to `true` regardless of its `enabled` value, at generation time. Use to:
- Capture visual baselines for the experimental screenshot crawl.
- Click through experimental features in a dev session without flipping individual flags in `features.json`.

Both `BUILD_FLAGS` and `__FEATURES__` see the forced-on values, so experimental code chunks **are** included in the bundle.

### `CLEARPATH_FLAGS_LOCKED=1`

Locks the runtime to `BUILD_FLAGS`. In a locked build:
- The IPC handlers (`feature-flags:set`, `apply-preset`, `reset`) become no-ops.
- `FeatureFlagContext` skips the IPC fetch entirely and uses `BUILD_FLAGS` directly.
- Settings → Feature Flags shows a 🔒 banner, hides off-by-default flags, and renders on-by-default flags read-only.

Use to preview "what an end user with no overrides would see," frozen exactly to `features.json`.

`enabled` is unchanged by this flag — `CLEARPATH_FLAGS_LOCKED=1` doesn't *change* values, it just stops the runtime from layering on top of them.

### Composed

`CLEARPATH_FLAGS_LOCKED=1 CLEARPATH_E2E_EXPERIMENTAL=1 …` produces a build where every experimental flag is forced on **and** the runtime is locked. That's the "kitchen-sink preview" for QA.

---

## Dev / preview workflows

| Command | What it does | Use when |
|---------|--------------|----------|
| `npm run dev` | Standard dev. `BUILD_FLAGS` from `features.json`; UI lets you toggle anything. | Day-to-day development. |
| `npm run dev:preview` | Dev with `CLEARPATH_FLAGS_LOCKED=1`. UI is read-only; off-by-default flags are hidden. | Verify a feature isn't accidentally reachable when its flag is off. Replicate an end-user-with-defaults experience without packaging. |
| `npm run dev:experimental` | Dev with `CLEARPATH_E2E_EXPERIMENTAL=1`. Every experimental flag forced on. | Click through experimental surfaces without manually flipping flags. |
| `npm run build` | Normal production build. | Default packaging path. |
| `npm run build:locked` / `build:experimental` | Same env vars baked into a `electron-vite build`. | When you want to inspect the bundle (or hand it off) with one of those modes. |
| `npm run preview:locked` | `build:locked` then `electron-vite preview` — runs the just-built locked bundle. | Final pre-merge sanity check: does my feature look right with the flags exactly as `features.json` says? |
| `npm run preview:experimental` | Same, with experimental flags forced on. | Demo / QA for an experimental feature. |

You can compose by exporting both env vars manually:

```sh
CLEARPATH_FLAGS_LOCKED=1 CLEARPATH_E2E_EXPERIMENTAL=1 npm run build && npm run preview
```

---

## How tree-shaking works

To verify that an experimental feature with `enabled: false` really is stripped:

```sh
npm run build
# Search the bundle for a string only the experimental page would emit
# (e.g. an IPC channel name from a context provider).
grep -oE "score-pr|backstage-explorer:get-relationships|RelationshipViewer" out/renderer/assets/index-*.js
```

If the grep returns nothing, the page chunk is gone. If you flip the flag to `enabled: true` (or run with `CLEARPATH_E2E_EXPERIMENTAL=1`) and re-build, those strings appear.

---

## Adding a flag

1. Add an entry to `features.json` with `description`, `experimental`, `enabled`, and `addedIn` (the version it was introduced in).
2. Run `npm run generate:flags` (or just `npm run dev` — `predev` does it).
3. Reference it from product code via `BUILD_FLAGS.<key>` for tree-shaking-sensitive gates, or via `useFlag('<key>')` / `useFeatureFlags()` in the renderer.
4. Add it to the appropriate group in [FeatureFlagSettings.tsx](src/renderer/src/components/settings/FeatureFlagSettings.tsx) so it appears in the UI.

For an **experimental** flag whose page chunk should be tree-shakeable when off:

```tsx
declare const __FEATURES__: import('../../shared/featureFlags.generated').FeatureFlags
const MyPage = __FEATURES__.showMyPage ? lazy(() => import('./pages/MyPage')) : null

// In <Routes>:
<Route
  path="my-page"
  element={MyPage ? <Suspense fallback={null}><MyPage /></Suspense> : <Navigate to="/work" replace />}
/>
```

Always register the route — the redirect arm matters because extension-pinned sidebar links may target the experimental path directly. (Without it, navigating there has no matching child route, the parent Layout unmounts, and the sidebar disappears mid-test.)

---

## Removing a flag

1. Decide whether to keep the feature (delete the flag, keep the code) or rip it out (delete the flag, delete the code).
2. Remove the entry from `features.json` and the entry in [FeatureFlagSettings.tsx](src/renderer/src/components/settings/FeatureFlagSettings.tsx).
3. Re-run the generator. Stale overrides for the deleted key are harmless — `electron-store` just ignores unknown keys.
4. Drop the `__FEATURES__.<key>` references from product code.

---

## Tests

[src/shared/featureFlags.generated.test.ts](src/shared/featureFlags.generated.test.ts) verifies the generator output: every key has metadata, experimental keys are a subset of all keys, build-time disabled experimentals match the expected env-aware behavior. The test is env-aware (`CLEARPATH_E2E_EXPERIMENTAL`), so `CLEARPATH_E2E_EXPERIMENTAL=1 npm test` is a passing combination.
