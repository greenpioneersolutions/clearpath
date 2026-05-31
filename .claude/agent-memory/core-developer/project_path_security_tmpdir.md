---
name: path-security-tmpdir-var-gotcha
description: isSensitiveSystemPath exempts the OS temp dir; macOS tmpdir lives under /var so tests that stage from tmpdir() can fail env-dependently
metadata:
  type: project
---

`isSensitiveSystemPath` ([src/main/utils/pathSecurity.ts]) blocks paths under `/var` (among `/etc`, `/usr`, etc.) but **explicitly exempts the OS temp dir** (both `tmpdir()` and its `realpathSync` form) up front.

**Why:** On a default macOS box `os.tmpdir()` returns `/var/folders/...` (symlink to `/private/var/folders/...`). Without the exemption, any file a user picks from their temp dir — and any test that stages source files created via `mkdtempSync(join(tmpdir(), ...))` — gets rejected as a "sensitive system path". This is environment-dependent: it passes when `TMPDIR=/tmp/...` (e.g. the sandbox) and fails when `TMPDIR` is unset / under `/var` (default macOS, many CI runners). Confirmed root cause of a 7-test failure in `fileAttachmentHandlers.test.ts`.

**How to apply:** When tests touch path-security and stage real files from `tmpdir()`, run them under a `/var`-rooted TMPDIR to catch this class of bug, e.g. `TMPDIR=/var/tmp/cp-test-$$ npx vitest run <file>`. The exemption keeps real `/var` system paths (`/var/log`, `/var/db`) blocked — don't widen it to all of `/var`. `getImportAllowedRoots` already treats `tmpdir()` as an allowed root, so the exemption is consistent with that.
