---
name: BackendId migration (CLI + SDK support)
description: 4-backend support landed — 'copilot-cli' | 'copilot-sdk' | 'claude-cli' | 'claude-sdk'. Session-store migration is idempotent in CLIManager constructor; scheduler does the same for its store. SDK adapters are feature-gated (enableClaudeSdk, enableCopilotSdk).
type: project
---

CoPilot Commander now supports 4 backends, not 2. Terminology:
- `BackendId` = `'copilot-cli' | 'copilot-sdk' | 'claude-cli' | 'claude-sdk'`
- provider = `'copilot' | 'claude'` — use `providerOf(id)` to narrow
- transport = `'cli' | 'sdk'` — use `transportOf(id)`

Shared helper lives at `src/shared/backends.ts` (imported by both main and renderer via the rootDirs merge).

**Why:** Enterprises that don't want a CLI binary installed can drive sessions through API keys via SDK paths. Copilot SDK path is `copilot --acp` (ACP over JSON-RPC stdio); Claude SDK path is `@anthropic-ai/claude-agent-sdk`'s `query()`.

**How to apply:**
- When you see `cli === 'copilot'` on a `BackendId` field, use `providerOf(cli) === 'copilot'`.
- Plugin/agent/skill directories are provider-scoped (not backend-scoped). Use `providerOf(backend)` at the call site to pick.
- AuthState shape is now nested: `state.copilot.cli`, `state.copilot.sdk`, plus a legacy top-level projection from the CLI status for back-compat. Phase 5 cleanup removes the top-level projection.
- SDK adapters register themselves into `CLIManager.adapters` Map at boot in `src/main/index.ts`, gated by feature flags `enableClaudeSdk` / `enableCopilotSdk`. Flag flips re-register at runtime without restart.
- Session-store migration (`clear-path-sessions.json`) and scheduler-store migration (`clear-path-scheduler.json`) both run once in their constructors and are idempotent.
- Default Claude SDK model is `claude-sonnet-4-6` (product decision — latest family is 4.X).

Known test debt from this migration: ~50 unit tests assert the pre-migration shape (`{ copilot: {installed,...} }` flat AuthState, `cli: 'claude'` on scheduled templates, `cliName === 'copilot'` on adapters). Source code is correct; tests need updating — treat as a cleanup task.
