import { spawn } from 'child_process'

/**
 * macOS-only: does the Claude Code credential exist in the login Keychain?
 *
 * Claude Code stores its token as a generic-password Keychain item with service
 * name "Claude Code-credentials" — on macOS there is NO ~/.claude/*.json
 * credentials file, so any file-based auth check returns a false negative.
 * Unlike `claude auth status`, the `security` lookup does NOT depend on the USER
 * env var, so it works even from the stripped environment a GUI-launched
 * Electron app inherits. Presence of the item ⇒ the user has signed in.
 *
 * Shared by AuthManager.checkClaude (launchpad readiness) and
 * ClaudeCodeAdapter.isAuthenticated (session-start guard) so the two gates can
 * never disagree about whether Claude is signed in.
 */
export function claudeKeychainTokenExists(): Promise<boolean> {
  if (process.platform !== 'darwin') return Promise.resolve(false)
  return new Promise((resolve) => {
    try {
      const child = spawn(
        '/usr/bin/security',
        ['find-generic-password', '-s', 'Claude Code-credentials'],
        { stdio: 'ignore' },
      )
      child.on('error', () => resolve(false))
      child.on('close', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}
