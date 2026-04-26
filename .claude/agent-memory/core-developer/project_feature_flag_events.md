---
name: Feature flag event bus
description: featureFlagEvents EventEmitter in featureFlagHandlers.ts lets main-process subsystems react to flag flips without polling
type: project
---

`src/main/ipc/featureFlagHandlers.ts` exports a `featureFlagEvents` EventEmitter and a `readCurrentFlags()` helper. When the `feature-flags:set`, `:apply-preset`, or `:reset` IPC handlers run, they diff previous vs next and emit `change` plus `change:<key>` events with `{ key, value, flags }` payloads.

**Why:** The ClearMemory lifecycle (and potentially other subsystems) needs to start/stop a daemon when its flag flips, without requiring an app restart or polling from the main process. Previously there was no signal; adding an EventEmitter keeps the feature-flag handler as the single source of truth and lets subscribers wire side-effects cleanly.

**How to apply:** When you need main-process behavior to react to a feature flag, import `featureFlagEvents` and subscribe to `change:<flagName>`. Do NOT read from the electron-store directly on a timer — use the event. One gotcha: the extension-host `feature-flags:set` handler in `src/main/index.ts` writes to the store directly and does NOT emit these events (Slice B did not touch that path; extensions toggling flags won't trigger lifecycle). If that becomes important, route extension flag writes through the IPC handler instead.
