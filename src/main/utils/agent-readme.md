# Utils — Shared utilities for security, logging, env management, and rate limiting

## Purpose
Provides cross-cutting utility functions for credential storage, logging, path validation, shell environment setup, rate limiting, and encryption key management. Used throughout the app to enforce security policies and maintain consistent behavior.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| credentialStore.ts | Secure credential storage via OS keychain | `isSecureStorageAvailable()`, `storeSecret()`, `retrieveSecret()`, `deleteSecret()`, `hasSecret()`, `getSecretPreview()` |
| logger.ts | Centralized logging with configurable levels | `log` object: `debug()`, `info()`, `warn()`, `error()`; configurable via `CLEARPATH_LOG_LEVEL` env var |
| pathSecurity.ts | Path validation and SSRF prevention | `assertPathWithinRoots()`, `getMemoryAllowedRoots()`, `getWorkspaceAllowedRoots()`, `isSensitiveSystemPath()` |
| rateLimiter.ts | Sliding-window rate limiting for operations | `defineRateLimit()`, `checkRateLimit()` |
| shellEnv.ts | Login-shell PATH resolution and env scoping | `initShellEnv()`, `setCustomEnvVars()`, `getSpawnEnv()`, `getScopedSpawnEnv()`, `resolveInShell()` |
| storeEncryption.ts | Stable encryption key generation for electron-store | `getStoreEncryptionKey()`, `checkEncryptionKeyIntegrity()` |

## Architecture Notes

### Credential Storage (`credentialStore.ts`)
- Uses Electron's `safeStorage` API for OS keychain integration:
  - macOS: Keychain
  - Windows: DPAPI
  - Linux: libsecret (if available)
- Store name: `clear-path-credentials`
- Secrets stored as encrypted base64 in electron-store
- Throws if safeStorage unavailable (users must use env vars instead)
- `getSecretPreview()` returns masked version (e.g., "ghp_****AB3F") for UI display

### Logging (`logger.ts`)
- Configurable level: `'debug' | 'info' | 'warn' | 'error' | 'none'`
- Dev default: `'debug'`
- Prod default: `'warn'`
- Override via `CLEARPATH_LOG_LEVEL` env var
- Guidance: Never log prompt content, secrets, or AI output at debug level

### Path Security (`pathSecurity.ts`)
- **Memory allowed roots**: `~/.claude/`, `~/.copilot/`, `~/.github/`, cwd, `~/.config/clear-path/`
- **Workspace allowed roots**: Home directory only
- **Sensitive system paths** (never write): `~/.ssh/`, `~/.aws/`, `~/.gnupg/`, `/etc/`, `/usr/`, `/bin/`, `/sbin/`, `/var/`, `/System/`, `/Library/`
- `assertPathWithinRoots()` resolves symlinks and validates containment, throws if escape attempted

### Rate Limiting (`rateLimiter.ts`)
- Sliding-window implementation (timestamps in window, pruned on each check)
- Pre-configured limits:
  - `cli:start-session`: 5 per minute
  - `subagent:spawn`: 10 per minute
  - `files:watch`: 20 per minute
  - `notifications:test-webhook`: 5 per minute
  - `git:log`, `git:diff`: 30 per minute
  - `workspace:clone-repo`: 3 per minute
  - `data:clear-store`, `data:clear-all`: 2, 1 per minute
  - `scheduler:run-now`: 3 per minute
  - `kb:generate`: 2 per minute
- `checkRateLimit()` returns `{ allowed, retryAfterMs? }`

### Shell Environment (`shellEnv.ts`)
- **Problem**: Electron GUI apps don't run through login shell, so PATH misses ~/.local/bin, nvm, homebrew, etc.
- **Solution**: `initShellEnv()` spawns login shell once to read full PATH, caches it
- **Custom env vars**: `setCustomEnvVars()` merges app-configured vars (e.g., from settings)
- **Scoped env**: `getScopedSpawnEnv(cli)` restricts secrets per adapter (principle of least privilege)
  - Copilot: `GH_TOKEN`, `GITHUB_TOKEN`, `GITHUB_ASKPASS`, `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`
  - Claude: `ANTHROPIC_API_KEY`, `CLAUDE_CODE_MODEL`, `ENABLE_TOOL_SEARCH`
  - Local: No secrets
- `resolveInShell()` runs `command -v` through login shell to find binaries safely

### Store Encryption (`storeEncryption.ts`)
- Derives stable encryption key from machine-specific values:
  - Home directory + hostname + username hashed with SHA256
- Allows electron-store to encrypt data at rest via `encryptionKey` option
- NOT equivalent to OS keychain (use `credentialStore.ts` for true secrets)
- Prevents casual inspection, makes data non-portable
- `checkEncryptionKeyIntegrity()` detects if key changed (hostname/username changes), warns user
- Key fingerprint persisted in `~/.config/clear-path/.key-fingerprint` (macOS) or `~/.config/clear-path/` (Linux)

## Business Context
These utilities enforce:
- **Security**: Path validation, secret encryption, SSRF prevention, scoped env vars
- **Observability**: Centralized logging with dev/prod defaults
- **Stability**: Rate limiting prevents resource exhaustion
- **Compatibility**: Shell env setup ensures CLI tools work correctly despite Electron limitations

## Integration Points
- **credentialStore**: Used by CLI managers to store/retrieve API keys
- **logger**: Used throughout app (no console.log directly)
- **pathSecurity**: Used by file handlers, session managers, knowledge base operations
- **rateLimiter**: Called by IPC handlers before expensive operations
- **shellEnv**: Called at app startup (must await `initShellEnv()` before spawning processes)
- **storeEncryption**: Passed to all electron-store instances via `encryptionKey` option
