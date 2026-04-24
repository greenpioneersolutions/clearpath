---
name: Sharing types between main and renderer
description: How to share dependency-free type modules between Electron main and renderer without duplicating them — via src/shared + rootDirs
type: project
---

Types that need to be visible in both Electron main (`src/main`) and the React renderer (`src/renderer`) should live in `src/shared/**`. Both tsconfig.main.json and tsconfig.renderer.json declare a `"rootDirs": ["src/<area>", "src/shared"]` so TypeScript virtually merges the shared directory into each project's root without complaining about files being outside rootDir.

**Why:** Before this, `src/main/clearmemory/types.ts` couldn't be imported from the renderer — the renderer's rootDir excluded `src/main`. The Slice A workaround was a hand-rolled mirror in `src/renderer/src/components/clearmemory/ImportWizard.tsx`. Slice C promoted the canonical types to `src/shared/clearmemory/types.ts` and both sides import from there.

**How to apply:**
- Put only dependency-free type/interface/const modules in `src/shared/` — NO Node, Electron, React, or DOM imports at module scope, because the same file is compiled by both main and renderer tsconfigs.
- Import with relative paths: from main `../../shared/<foo>/types`, from renderer `../../../shared/<foo>/types` (depth depends on file location).
- The old per-project types file (e.g. `src/main/clearmemory/types.ts`) should become a one-line re-export shim so existing imports keep working.
- vite/rollup don't care about rootDirs at bundle time — this is a TypeScript-only concern.
