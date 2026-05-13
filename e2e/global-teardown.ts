/**
 * e2e/global-teardown.ts
 *
 * Final safety net: kill any orphaned Electron processes after the entire
 * Playwright run completes.
 */
export default async function (): Promise<void> {
  try {
    const { execSync } = await import('node:child_process')
    execSync('pkill -f "out/main/index.js" 2>/dev/null || true', { stdio: 'ignore' })
  } catch {
    // Best-effort cleanup
  }
}
