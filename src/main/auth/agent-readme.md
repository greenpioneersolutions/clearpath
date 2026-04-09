# Auth — Authentication status checking and login flows

## Purpose
Manages authentication state for both GitHub Copilot CLI and Claude Code CLI. Checks installation status, verifies auth tokens (env vars, config files, CLI commands), caches results, and streams interactive login output to the renderer.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| AuthManager.ts | Auth status checking, login flow orchestration, caching | AuthManager class: getStatus(), refresh(), startLogin(), cancelLogin(), checkCopilot(), checkClaude(), loginCopilot(), loginClaude() |

## Architecture Notes
- **Caching**: Auth status cached for 5 min (authenticated) or 10 min (not installed); can force refresh.
- **Copilot checks**: Resolves binary via login-shell `which`, confirms executable with `--version`, checks env vars (GH_TOKEN, GITHUB_TOKEN), inspects ~/.copilot/config.json for logged_in_users array.
- **Claude checks**: Resolves binary, confirms with `--version`, checks ANTHROPIC_API_KEY env var, runs `claude auth status` command, looks for ~/.claude/.credentials.json or auth.json.
- **Login flows**: Spawns copilot or claude as interactive child process with stdin/stdout piping; streams output lines (ANSI-stripped) to renderer via `auth:login-output` IPC; emits `auth:login-complete` with success/error.
- **Token sources**: Tracked as 'env-var', 'config-file', or 'auth-status' to distinguish where credentials came from.
- **WebContents callback**: Takes getWebContents() function to allow safe IPC send after window is ready; checks !wc.isDestroyed() before sending.

## Business Context
Powers the "Authenticate with Copilot / Claude" UI flows in the app. Enables users to see install/auth status and triggers browser-based login flows for both CLIs.
