# Implementation Plan — Per-Tool Permission Broker (policy-driven)

**Status:** IMPLEMENTED in this PR (broker + both CLI clients + app-wide prompt
modal + session activity log are landed and tested). See the Progress checklist
below for what's done vs. the remaining tail. This doc is kept as the design record.
**Goal:** Genuine per-tool approve/deny for headless CLI agents, with the default
behavior derived from the active **Policy** (Slice 16). No blanket auto-approve.
Fixes the reported bugs: (a) attached files unreadable ("Path does not exist"),
(b) "agent can't ask for permissions" — because each turn is spawned headless
(`copilot --prompt` / `claude --print`, stdin closed) so the CLI can neither
pause for an interactive prompt nor receive a `y/n` over the closed stdin.

> Already shipped separately (not part of this plan): the red "token summary"
> false-error fix (`isUsageSummary` in `src/main/cli/outputClassification.ts`).

---

## 1. Why the current permission path is broken

`PermissionRequestHandler.tsx` listens for `cli:permission-request` and replies
with `cli:send-input` → `'y'`/`'n'`. But:
- ClearPath spawns a **fresh `--prompt`/`--print` process per turn** and calls
  `proc.stdin.end()` (CopilotAdapter L218-220). There is no open stdin to write
  `y` to; a `cli:send-input` becomes a brand-new headless turn with the literal
  text "y".
- Headless Copilot/Claude **don't emit interactive `[y/n]` prompts** at all, so
  `cli:permission-request` rarely even fires; tools are silently refused instead.

The fix is an **out-of-band broker**: the CLI calls a ClearPath-controlled
hook/MCP tool for each permission decision; that hook reaches back into the main
process (over loopback HTTP), which consults policy and (when needed) shows a GUI
modal, then returns allow/deny. This is fully compatible with the per-turn
headless model — no stdin needed.

---

## 2. Mechanisms (verified via research)

| | Copilot CLI | Claude Code |
|---|---|---|
| Out-of-band hook | `permissionRequest` **hook** (docs: *"useful in CLI pipe mode (`-p`) … where no interactive prompt is available"*) | `--permission-prompt-tool mcp__server__tool` (MCP tool, works in `--print`) |
| Hook input | `{ sessionId, timestamp, cwd, toolName }` on stdin | `{ tool_name, input }` |
| Hook output | `{ "behavior": "allow"\|"deny", "message": "…" }` (exit 2 = deny) | tool result text = `{ "behavior":"allow", "updatedInput" }` or `{ "behavior":"deny", "message" }` |
| Static allowlist (complement) | `--allow-tool 'shell(git:*)'` / `--deny-tool` (deny wins) | `--allowedTools "Read,Bash(npm run *)"` / `--disallowedTools` |
| Richer (future) | `--acp` → `session/request_permission` (public preview Jan 2026; verify version, issue #845) | stream-json control protocol (undocumented — skip) |

Both already have field support in ClearPath:
- `SessionOptions.permissionPromptTool` → `ClaudeCodeAdapter` emits `--permission-prompt-tool` (L78-80).
- `SessionOptions.mcpConfig` → `--mcp-config` (L103). MCP infra (`McpSyncService`) can render a bundled server.
- Copilot hooks are NOT written today (only `.github/copilot/settings.json` is *read* for branch protection).

---

## 3. Architecture

```
                         ┌──────────────────────────────────────────┐
                         │  Electron main process                    │
   ┌──────────────┐      │  ┌────────────────────────────────────┐  │
   │ copilot -p   │      │  │ PermissionBroker (HTTP @127.0.0.1) │  │
   │  └ hook ─────┼─POST─┼─▶│  1. validate token+sessionId       │  │
   └──────────────┘      │  │  2. policy pre-check (auto a/d)    │  │
   ┌──────────────┐      │  │  3. else → emit cli:permission-…  │──┼──▶ renderer modal
   │ claude -p    │      │  │  4. await permission:respond       │◀─┼─── Allow/Deny/Always
   │  └ MCP tool ─┼─POST─┼─▶│  5. audit 'tool-approval'          │  │
   └──────────────┘      │  └────────────────────────────────────┘  │
                         └──────────────────────────────────────────┘
```

- **Loopback HTTP** (pinned `127.0.0.1`, ephemeral port) mirrors the existing
  ClearMemory pattern. Each session gets a random **bearer token** passed to the
  hook/MCP via env; the broker validates `token + sessionId`. Requests block
  (long-poll/hold-open) until a decision or timeout.
- The hook/MCP clients are **tiny bundled Node scripts** (Node is already
  required for both CLIs, so it's always on PATH). They do one HTTP POST and
  echo the JSON decision.

---

## 4. Policy integration (the chosen default-policy source)

The broker derives the **default** decision from the active policy preset
(`policy:get-active` → `{ activePresetId, rules, presetName }`,
`policyHandlers.ts`). New pure helper `permissionProfileForPolicy(rules)`:

| Active policy | Read-only tools (Read/Glob/Grep, read attached file) | Edits/Write | Shell | MCP tools | `blockedTools` / file patterns |
|---|---|---|---|---|---|
| **Cautious** (`policy-cautious`) | prompt | prompt | prompt | prompt | auto-DENY |
| **Standard** (`policy-standard`, default) | **auto-allow** | prompt | prompt | prompt | auto-DENY |
| **Unrestricted** (`policy-unrestricted`) | auto-allow | auto-allow | auto-allow | auto-allow | (none) |

Hard rules always enforced first (independent of the prompt/allow matrix):
- `rules.blockedTools` match (e.g. `shell(rm -rf:*)`) → **auto-DENY** + log violation (`policy:check-action` already encapsulates this — reuse it).
- File-touching tool whose path matches `rules.blockedFilePatterns` **or** `compliance:check-file` defaults (`.env*`, `*.pem`, `*credentials*`, …) → **auto-DENY**.
- `requiredPermissionMode` still applied as today via `sessionDefaultFlags`.

Every decision (auto or user) is written to the audit log as
`actionType: 'tool-approval'` (the type already exists, currently unused) via
`compliance:log-event`.

"Always allow / Always deny" user choices are persisted per scope (session →
workspace) in a new `clear-path-tool-grants.json` store and consulted in step 2
before prompting.

---

## 5. Component inventory

### Main process (new)
1. `src/main/permissions/PermissionBroker.ts` — loopback HTTP server, token mint
   + validate, pending-decision registry (`Map<reqId, {resolve, timer}>`),
   `requestDecision()`, policy pre-check, audit, timeout→deny default.
2. `src/main/permissions/permissionProfile.ts` — pure `permissionProfileForPolicy(rules)`
   + `classifyTool(cli, toolName, input)` → `'read' | 'edit' | 'shell' | 'mcp' | 'other'`. **Unit-tested.**
3. `src/main/permissions/grantsStore.ts` — persisted "always" allow/deny lists (session/workspace scope).
4. `resources/permission/claude-mcp-server.mjs` — bundled MCP stdio server exposing
   `permission_prompt` (`{tool_name,input}` → POST broker → `{behavior,…}`).
5. `resources/permission/copilot-hook.mjs` — bundled hook (`stdin JSON` → POST broker → `stdout {behavior}`).
6. `src/main/ipc/permissionHandlers.ts` — `permission:respond`, `permission:list-pending`,
   `permission:get-profile`, `permission:set-grant`.

### Main process (changes)
7. `CLIManager.startSession`/`runTurn` — when a session starts:
   - mint a broker token; set `BROKER_URL`+`BROKER_TOKEN`+`sessionId` in spawn env.
   - **Claude**: inject `mcpConfig` (inline JSON adding the bundled server) + set
     `permissionPromptTool = 'mcp__clearpath_permission__permission_prompt'`
     (respect a caller-supplied one). Add safe-tool `--allowedTools` from the
     policy profile to skip the broker for trivially-allowed tools.
   - **Copilot**: ensure a `permissionRequest` hook is registered (see §6) and
     pass `--config-dir`/settings so it loads.
   - Wire `setAuditCallback` to emit `tool-approval`.
8. `ClaudeCodeAdapter` / `CopilotAdapter` — no API change; reuse existing
   `permissionPromptTool` / `mcpConfig` / hook-config plumbing. (Copilot may need
   a new `configDir` pass-through if we choose the `--config-dir` approach.)

### Renderer (changes)
9. `PermissionRequestHandler.tsx` — **replace** the `cli:send-input` `y/n` reply
   with `permission:respond({ requestId, decision })`. Enrich the request shape
   to carry `{ requestId, toolName, inputPreview, classification, policyName,
   autoReason? }`. Add **Allow / Deny / Always-allow / Always-deny** actions.
10. `PermissionCard.tsx` — show tool name + redacted input preview + which policy
    is in effect; the modal is the single source of truth (drop the old inline
    `y/n` chat affordance for headless).
11. (Optional, Phase 4) Settings → Tools: a per-policy permission-profile editor
    layered on the existing `ToolToggles` / `PermissionModeSelector`.

### Shared
12. `src/shared/permissions/types.ts` — `PermissionRequest`, `PermissionDecision`,
    `PermissionProfile`, `ToolClassification` (reachable from main + renderer via `rootDirs`).

### Packaging
13. `package.json` `build.extraResources` — bundle `resources/permission/*.mjs`;
    resolve their path via `app.getAppPath()`/`process.resourcesPath` (dev vs packaged).

---

## 6. Copilot hook registration — the one real design fork

Copilot reads hooks from `~/.copilot/settings.json` (+ `.github/copilot/settings.json`,
`~/.copilot/hooks/*.json`, plugin hooks). Two options:

- **A. `--config-dir <app-managed>`** — point Copilot at a ClearPath-owned config
  dir containing our `settings.json` with the hook. Clean isolation, **but**
  `--config-dir` also relocates session state/plugins/history, which could change
  resume/plugin behavior. Would need to seed that dir (and merge the user's MCP).
- **B. Merge-write the hook into `~/.copilot/settings.json`** — same atomic
  merge-don't-clobber pattern used by ClearMemory's MCP integration; add only our
  `hooks.permissionRequest` entry, remove on teardown. Lower isolation risk to
  the user's real config, but we mutate a user file.

**Recommendation: B** (merge into the real settings.json, scoped + reversible),
matching the established ClearMemory `mcpIntegration.ts` precedent. Flag for your
call during review.

---

## 7. Phasing & tests

- **Phase 1 — Claude end-to-end** (fully documented mechanism, lowest risk):
  broker + bundled MCP server + `permission:respond` IPC + modal rewrite +
  `permissionProfile` helper. Default policy = Standard (auto-allow reads → fixes
  attached-file read; prompt writes/shell).
  - Tests: `permissionProfile.test.ts` (policy→profile + tool classification + blocked/file-pattern), `PermissionBroker.test.ts` (token/sessionId validation, pending-decision resolve, timeout→deny, policy auto-allow/deny short-circuit), MCP server unit (request→POST→response shaping), `PermissionRequestHandler.test.tsx` (renders modal, respond via `permission:respond`, Always-grant persists). e2e: drive `permission:respond` through real IPC like `file-attachments.pw.spec.ts`.
- **Phase 2 — Copilot hook**: bundled hook + settings.json merge (§6B) + teardown. Tests mirror Phase 1 for the hook shape; merge-don't-clobber test like `mcpIntegration.test.ts`.
- **Phase 3 — Policy profile editor + "Always" grants UI + audit surfacing** in Insights/Compliance.
- **Phase 4 (optional)** — `--acp` upgrade for Copilot once the installed `@github/copilot` is verified to emit `session/request_permission` (issue #845).

---

## 8. Risks / open questions for review

1. **Copilot hook location** — §6 A vs B (recommend B). Your call.
2. **Default-deny timeout** — if the user ignores the modal, deny after N s
   (proposed 120s, configurable). Acceptable?
3. **Bundled Node scripts** rely on `node` on PATH (always true since the CLIs
   need it). OK, or prefer a compiled helper?
4. **Per-turn re-prompting** — without "Always", the same tool re-prompts every
   turn (fresh process). The session/workspace grant store mitigates this; is
   session-scope "Always" the right default grant longevity?
5. **Copilot `read()`/shell bypass** (issue #2722) means file-pattern denials
   aren't a hard security boundary on Copilot; the broker enforces them in our
   own code, but a `shell(cat .env)` can still slip unless we also classify shell
   commands touching protected paths. Depth of shell-arg inspection = scope call.
6. **`requiredPermissionMode` interaction** — Standard policy sets `acceptEdits`
   today; with the broker handling edits, do we drop that to `default` so edits
   route through the broker, or keep it (edits auto-approved, broker handles the
   rest)? Recommend dropping to `default` so the broker is authoritative.

---

## 8b. Refinement discovered during implementation — Copilot hook safety

The plan's §6 recommended merging the `permissionRequest` hook into the user's
global `~/.copilot/settings.json`. That hook then runs for the user's **own**
terminal `copilot` sessions too — and if it pointed at a dead broker it would
break/deny normal usage. Fix baked into `copilot-hook.mjs`: the hook is a
**no-op pass-through (allow)** whenever the broker env (`BROKER_URL/TOKEN/SESSION`)
is absent. Only ClearPath-spawned sessions carry that env, so the global hook
gates ClearPath sessions and is inert everywhere else. Teardown still removes the
hook entry on disable/quit (merge-don't-clobber, ClearMemory precedent).

## Progress (branch `feat/tool-permission-broker`)

- [x] Plan doc
- [x] Shared types (`src/shared/permissions/types.ts`)
- [x] `permissionProfile.ts` — policy→profile + tool classification + matchers (27 tests)
- [x] `grantsStore.ts` — persisted always-allow/deny (8 tests)
- [x] `PermissionBroker.ts` — loopback HTTP, decideStatic, prompt/respond/timeout, audit (13 tests)
- [x] Bundled clients: `resources/permission/claude-mcp-server.mjs`, `copilot-hook.mjs`
- [x] `cliIntegration.ts` — resource resolve (dev/packaged via app.asar.unpacked) + Claude mcpConfig merge + Copilot settings.json merge/teardown (11 tests)
- [x] CLIManager lifecycle: `setPermissionBroker`; `runTurn` adds Claude `mcpConfig`(merged)+`permissionPromptTool` or Copilot `brokerEnv`; `releaseSession` on stop/delete; `getSessionMeta`
- [x] `permissionHandlers.ts` IPC: `permission:respond`, `permission:list-pending`
- [x] index.ts wiring: broker built with exported `getActivePolicy`, `getWebContents`, shared audit sink, grants (`clear-path-tool-grants`), `getSessionMeta`; started + Copilot hook registered at boot; torn down on quit
- [x] Renderer response surface: `PermissionRequestHandler.tsx` (Tools panel) → `permission:respond` (Allow once / Always this session / Deny / Always deny); recovers via `permission:list-pending`; legacy `y/n` path removed (8 tests)
- [x] Packaging: covered by electron-builder `files: resources/**` + `asarUnpack`
- [x] **App-wide prompt modal** (`PermissionPromptOverlay`, mounted in Layout) — pops wherever the user is (fixes the reported "write denied because the prompt was only in the Tools panel and timed out"). Queues requests; recovers in-flight via `permission:list-pending`; Allow once / Always this session / Deny / Always deny. Broker timeout now reports "no response — timed out" (was "user decision").
- [ ] **Remaining (Phase 1b tail):** e2e for the `permission:respond` round-trip; verify the Standard `acceptEdits` interaction doesn't bypass the broker (plan §8 #6)

## 9. Out of scope (this plan)
- Full ACP session mode for Copilot (Phase 4 candidate only).
- Stream-json control protocol for Claude (undocumented).
- Changing the per-turn headless spawn model.
