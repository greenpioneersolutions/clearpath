---
name: middleware-pipeline-architecture
description: Pre-send middleware pipeline in CLIManager.runTurn — extension point for Token Coach phases 3-5
metadata:
  type: project
---

The pre-send middleware pipeline at `src/main/cli/middleware/` is the extension point for everything that needs to inspect or rewrite a prompt before it hits the adapter.

**Contract:**
- Each middleware is `(ctx: MiddlewareContext) => MiddlewareContext | Promise<MiddlewareContext>` — pure function, no shared state.
- `runPipeline(ctx, middlewares[])` awaits each in order. If any throws, the LAST GOOD ctx is returned — turns never break over a middleware bug.
- Default order (Phase 3): `[normalizeMiddleware, lintMiddleware, prefixOrderMiddleware, measureMiddleware]`. `prefixOrderMiddleware` runs AFTER lint (so it sees lint-cleaned slice text) and BEFORE measure (so measure tokenizes the canonical reassembled prompt). `measureMiddleware` MUST always run last.
- Canonical slice order produced by prefixOrder: `fleet → agent → notes → contextSources → userText` — most-stable to least-stable. `cacheBreakpoint` field on the ctx points at the byte offset where the volatile userText slice starts.

**Why:** Centralizes prompt rewriting so phases 3-5 plug in without re-touching `CLIManager.runTurn`. The `cli:prompt-shaped` IPC event ships the post-pipeline ctx.tokens + ctx.notes to the renderer so the meter chip + future preflight warnings get accurate numbers.

**How to apply:** When adding a new middleware (e.g. Phase 3's `prefixOrderMiddleware`):
1. Add the middleware file in `src/main/cli/middleware/`.
2. Insert into `defaultPipeline` in `src/main/cli/middleware/index.ts` — preserve the rule that measure runs last.
3. If the middleware needs config (e.g. routing rules from a Store), inject it via factory function so the middleware itself stays pure for tests.

**Note on async:** `CLIManager.runTurn` is now async because the pipeline can be async. `startSession` and `sendInput` were updated to `await this.runTurn(...)` so tests that emit `_emit('exit')` immediately after a startSession/sendInput call still work — the adapter is guaranteed to have been invoked by return time.
