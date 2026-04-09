# Pattern: Skill with Folder-Based References

**Use when:** The skill covers a domain with extensive reference material that should be organized by topic rather than crammed into a single file.

**Key pattern:** Navigation table in SKILL.md pointing to `references/` and `examples/` folders.

---

## Complete SKILL.md

```yaml
---
name: electron-dev
description: Comprehensive Electron development guide -- architecture, security, IPC patterns, window management, and API reference. Activates when working with Electron main process, preload scripts, or renderer code.
user-invocable: false
paths: "**/main/**/*.ts, **/preload/**/*.ts, **/electron/**/*.ts, **/electron.vite.config.*"
allowed-tools: Read Grep Glob
---

# Electron Development Guide

Standing guidance for all Electron development in this codebase.

## Architecture
- **Main process**: Node.js, full system access, one instance
- **Renderer process**: Chromium, sandboxed, one per window
- **Preload scripts**: Bridge between main and renderer via contextBridge
- **Utility processes**: Heavy computation offloaded from main

## Core security rules
1. Always set `contextIsolation: true`
2. Always set `nodeIntegration: false`
3. Always set `sandbox: true`
4. Never expose Node.js APIs directly to renderer
5. Validate all IPC messages

## Reference materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/security-rules.md](references/security-rules.md) | Full security checklist (15 rules) | Reviewing security or configuring BrowserWindow |
| [references/ipc-patterns.md](references/ipc-patterns.md) | All 4 IPC communication patterns | Writing main<->renderer communication |
| [references/window-management.md](references/window-management.md) | Window lifecycle, tray, macOS | Managing windows or tray icons |
| [references/api-reference.md](references/api-reference.md) | Module/process lookup table | Looking up specific Electron APIs |
| [references/build-distribution.md](references/build-distribution.md) | Build toolchain, signing, updates | Packaging or distributing the app |

## Example code

| File | Pattern | Use when... |
|------|---------|-------------|
| [examples/secure-boilerplate.md](examples/secure-boilerplate.md) | Secure app setup | Starting a new Electron app or window |
| [examples/ipc-all-patterns.md](examples/ipc-all-patterns.md) | All 4 IPC patterns with code | Implementing any IPC communication |
| [examples/preload-bridge.md](examples/preload-bridge.md) | Comprehensive preload bridge | Setting up contextBridge API |
| [examples/auto-update.md](examples/auto-update.md) | Auto-update with electron-updater | Adding auto-update functionality |
```

---

## Why this pattern works

- SKILL.md stays under 500 lines with just the essential guidance
- **Navigation tables** describe each reference file's topic and when to read it
- Claude selectively loads only the reference it needs (e.g., just IPC patterns, not the full security checklist)
- Folder structure mirrors the domain's natural organization
- New reference topics can be added without touching SKILL.md (just add a row to the table)

---

## Navigation table format

```markdown
## Reference materials

| File | Topic | Read when... |
|------|-------|-------------|
| [references/topic-a.md](references/topic-a.md) | Short topic description | Trigger condition for loading |
| [references/topic-b.md](references/topic-b.md) | Short topic description | Trigger condition for loading |

## Examples

| File | Pattern | Use when... |
|------|---------|-------------|
| [examples/pattern-a.md](examples/pattern-a.md) | Short pattern description | When you need this pattern |
```

---

## Directory structure for this pattern

```
electron-dev/
├── SKILL.md                      # Core guidance + navigation tables
├── references/
│   ├── security-rules.md         # Full 15-rule security checklist
│   ├── ipc-patterns.md           # 4 IPC patterns with pros/cons
│   ├── window-management.md      # Window lifecycle, tray, macOS
│   ├── api-reference.md          # Module/process lookup table
│   └── build-distribution.md     # Build, signing, updates
└── examples/
    ├── secure-boilerplate.md     # Copy-paste secure app setup
    ├── ipc-all-patterns.md       # All 4 IPC patterns
    ├── preload-bridge.md         # contextBridge setup
    └── auto-update.md            # electron-updater integration
```
