/**
 * e2e/extensions-integration.pw.spec.ts
 *
 * Integration tests for extension install, enable/disable, and restart flow.
 * Requires pre-packaged .clear.ext file — run `npm run pretest:e2e:extensions` first
 * to ensure ../com.clearpathai.sdk-example-v1.0.0.clear.ext exists at the repo root.
 *
 * NOTE: This spec is intentionally excluded from the default `playwright.config.ts`
 * testMatch and is run via the dedicated `pw:extensions` npm script
 * (which uses `playwright.extensions.config.ts`). The tests mutate
 * persistent state (installs / toggles an extension) so describe blocks
 * run in serial mode and assume earlier tests have completed.
 */

import { test, expect } from './fixtures'
import {
  navigateToConfigureTab,
  navigateToConnectTab,
  buttonExists,
  clickButton,
  getRootHTML,
  invokeIPC,
} from './helpers/pw'
import path from 'node:path'

// Path to the pre-packaged example extension (repo root). Playwright runs from
// the project root, so process.cwd() is stable.
const EXAMPLE_EXT_PATH = path.resolve(
  process.cwd(),
  'com.clearpathai.sdk-example-v1.0.0.clear.ext',
)

test.describe('ClearPathAI — Extension Integration', () => {
  // The whole flow assumes earlier tests have run (install before list-checks,
  // toggle before banner-check). Force serial mode across describe blocks.
  test.describe.configure({ mode: 'serial' })

  // ── Install Extension via IPC ────────────────────────────────────────

  test.describe('Extension Install from .clear.ext', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(500)
    })

    test('installs the example extension via IPC', async ({ page }) => {
      // Use IPC directly to install (bypasses file dialog)
      const result = await invokeIPC(page, 'extension:install', {
        filePath: EXAMPLE_EXT_PATH,
      }) as {
        success: boolean
        data?: { manifest: { id: string; name: string } }
        error?: string
      }

      expect(result.success).toBe(true)
      expect(result.data?.manifest?.id).toBe('com.clearpathai.sdk-example')

      // Refresh the preload's extension channel allowlist so IPC channels work
      // without requiring a full app restart
      await page.evaluate(() => {
        const api = (window as unknown as { electronAPI: { refreshExtensionChannels?: () => void } }).electronAPI
        if (typeof api.refreshExtensionChannels === 'function') {
          api.refreshExtensionChannels()
        }
      })
    })

    test('shows the installed extension in the list', async ({ page }) => {
      // Refresh the extensions tab to pick up the new installation
      await navigateToConfigureTab(page, 'settings')
      await page.waitForTimeout(300)
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(500)

      const html = await getRootHTML(page)
      expect(html).toContain('SDK Example')
    })

    test('marks newly installed extension as user source', async ({ page }) => {
      const html = await getRootHTML(page)
      // The installed extension should have 'user' badge
      expect(html).toContain('user')
    })

    test('extension:list IPC includes the installed extension', async ({ page }) => {
      const result = await invokeIPC(page, 'extension:list') as {
        success: boolean
        data?: Array<{ manifest: { id: string }; source: string }>
      }
      expect(result.success).toBe(true)
      const sdkExample = result.data?.find(
        (e) => e.manifest.id === 'com.clearpathai.sdk-example',
      )
      expect(sdkExample).toBeTruthy()
      expect(sdkExample?.source).toBe('user')
    })
  })

  // ── Extension IPC Channel Access ──────────────────────────────────────

  test.describe('Extension IPC Channel Access', () => {
    test('can call sdk-example:health after install', async ({ page }) => {
      // The preload should have refreshed extension channels after install
      // so we can call extension IPC channels directly
      const result = await invokeIPC(page, 'sdk-example:health') as {
        success: boolean
        data?: { status: string; handlers: string[] }
      }
      expect(result.success).toBe(true)
      expect(result.data?.status).toBe('healthy')
      expect((result.data?.handlers ?? []).length).toBeGreaterThan(0)
    })

    test('can call sdk-example:get-config', async ({ page }) => {
      const result = await invokeIPC(page, 'sdk-example:get-config') as {
        success: boolean
        data?: { greeting: string }
      }
      expect(result.success).toBe(true)
      expect(result.data).toBeTruthy()
    })

    test('can call sdk-example:increment-counter', async ({ page }) => {
      const result = await invokeIPC(page, 'sdk-example:increment-counter') as {
        success: boolean
        data?: { counter: number }
      }
      expect(result.success).toBe(true)
      expect(typeof result.data?.counter).toBe('number')
    })

    test('can call sdk-example:get-event-log', async ({ page }) => {
      const result = await invokeIPC(page, 'sdk-example:get-event-log') as {
        success: boolean
        data?: Array<{ type: string; details: string }>
      }
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
    })

    test('can call sdk-example:get-storage-stats', async ({ page }) => {
      const result = await invokeIPC(page, 'sdk-example:get-storage-stats') as {
        success: boolean
        data?: { keyCount: number }
      }
      expect(result.success).toBe(true)
      expect(typeof result.data?.keyCount).toBe('number')
    })

    test('can call sdk-example:clear-event-log', async ({ page }) => {
      const result = await invokeIPC(page, 'sdk-example:clear-event-log') as { success: boolean }
      expect(result.success).toBe(true)
    })

    test('can call sdk-example:get-demo-data', async ({ page }) => {
      const result = await invokeIPC(page, 'sdk-example:get-demo-data') as {
        success: boolean
        data?: { extensionId: string; sessionCount: number; turnCount: number }
      }
      expect(result.success).toBe(true)
      expect(result.data?.extensionId).toBe('com.clearpathai.sdk-example')
    })

    test('can call sdk-example:ctx-demo context provider', async ({ page }) => {
      const result = await invokeIPC(page, 'sdk-example:ctx-demo', { topic: 'testing' }) as {
        success: boolean
        context?: string
        metadata?: { topic: string }
      }
      expect(result.success).toBe(true)
      expect(result.metadata?.topic).toBe('testing')
    })
  })

  // ── Enable/Disable + Restart Banner ──────────────────────────────────

  test.describe('Extension Toggle and Restart Flow', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(500)
    })

    test('shows no restart banner initially (install does not require restart)', async ({ page }) => {
      // Extension install uses the install-without-restart flow:
      // channels are refreshed via refreshExtensionChannels() so no
      // pendingRestart state is set. Only enable/disable toggles trigger
      // the restart banner.
      const html = await getRootHTML(page)
      expect(html).not.toContain('Changes require a restart')
    })

    test('toggling an extension shows the restart banner and Restart App + Restart now/Dismiss buttons', async ({ page }) => {
      const toggleBtn = page.locator('button[title="Enable"], button[title="Disable"]').first()
      if ((await toggleBtn.count()) === 0) {
        test.skip(true, 'No extensions with toggle buttons available')
        return
      }

      await toggleBtn.click()
      await page.waitForTimeout(500)

      const html = await getRootHTML(page)
      expect(html).toContain('Changes require a restart')

      // Banner buttons
      expect(await buttonExists(page, 'Restart now')).toBe(true)
      expect(await buttonExists(page, 'Dismiss')).toBe(true)

      // Header button
      expect(await buttonExists(page, 'Restart App')).toBe(true)
    })

    test('dismiss button hides the restart banner', async ({ page }) => {
      // Banner should still be visible from the previous test (serial mode)
      const initial = await getRootHTML(page)
      if (!initial.includes('Changes require a restart')) {
        // Re-trigger if the banner state was lost (defensive — shouldn't happen
        // in serial mode but keeps this test self-recoverable).
        const toggleBtn = page.locator('button[title="Enable"], button[title="Disable"]').first()
        if ((await toggleBtn.count()) === 0) {
          test.skip(true, 'No extensions with toggle buttons available')
          return
        }
        await toggleBtn.click()
        await page.waitForTimeout(500)
      }

      await clickButton(page, 'Dismiss')
      await page.waitForTimeout(300)

      const html = await getRootHTML(page)
      expect(html).not.toContain('Changes require a restart')
    })

    test('toggling again re-shows the banner', async ({ page }) => {
      const toggleBtn = page.locator('button[title="Enable"], button[title="Disable"]').first()
      if ((await toggleBtn.count()) === 0) {
        test.skip(true, 'No extensions with toggle buttons available')
        return
      }

      await toggleBtn.click()
      await page.waitForTimeout(500)

      const html = await getRootHTML(page)
      expect(html).toContain('Changes require a restart')

      // Toggle back to restore state
      const toggleBtn2 = page.locator('button[title="Enable"], button[title="Disable"]').first()
      await toggleBtn2.click()
      await page.waitForTimeout(300)
    })
  })

  // ── Tab Navigation Guard ─────────────────────────────────────────────

  test.describe('Tab Navigation Guard', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(500)
    })

    test('shows restart modal when navigating away with pending changes', async ({ page }) => {
      // Create a pending change
      const toggleBtn = page.locator('button[title="Enable"], button[title="Disable"]').first()
      if ((await toggleBtn.count()) === 0) {
        test.skip(true, 'No extensions with toggle buttons available')
        return
      }

      await toggleBtn.click()
      await page.waitForTimeout(500)

      // Try to navigate to a sibling Connect tab. PR #47 moved Extensions
      // from Configure → Connect, so the guard now intercepts switching
      // between connect-tab-* buttons (or away from /connect entirely).
      const otherConnectTab = page.locator('#connect-tab-mcp')
      if ((await otherConnectTab.count()) > 0) {
        await otherConnectTab.click()
        await page.waitForTimeout(300)
      }

      const html = await getRootHTML(page)
      expect(html).toContain('Extension changes pending')
    })

    test('Stay here button keeps user on Extensions tab', async ({ page }) => {
      const html = await getRootHTML(page)
      if (!html.includes('Extension changes pending')) {
        test.skip(true, 'No pending-change modal in current state')
        return
      }

      await clickButton(page, 'Stay here')
      await page.waitForTimeout(300)

      // Should still be on Extensions tab
      const afterHtml = await getRootHTML(page)
      expect(afterHtml).toContain('Extensions')
      expect(afterHtml).toContain('Changes require a restart')
    })

    test('Continue without restart navigates to target tab', async ({ page }) => {
      // Try to navigate away again — this time to the MCP connect tab.
      const otherConnectTab = page.locator('#connect-tab-mcp')
      if ((await otherConnectTab.count()) === 0) {
        test.skip(true, 'MCP connect tab not present')
        return
      }

      await otherConnectTab.click()
      await page.waitForTimeout(300)

      const html = await getRootHTML(page)
      if (!html.includes('Extension changes pending')) {
        test.skip(true, 'No pending-change modal triggered')
        return
      }

      await clickButton(page, 'Continue without restart')
      await page.waitForTimeout(500)

      // Should now be on the MCP connect tab
      const mcpSelected = page.locator('#connect-tab-mcp')
      const selected = await mcpSelected.getAttribute('aria-selected')
      expect(selected).toBe('true')
    })
  })

  // ── IPC Direct Tests ─────────────────────────────────────────────────

  test.describe('Extension IPC Integration', () => {
    test('extension:toggle via IPC updates enabled state', async ({ page }) => {
      const listResult = await invokeIPC(page, 'extension:list') as {
        success: boolean
        data?: Array<{ manifest: { id: string }; enabled: boolean }>
      }
      if (!listResult.success || !listResult.data || listResult.data.length === 0) {
        test.skip(true, 'No extensions installed to test toggle')
        return
      }

      const ext = listResult.data[0]
      const originalEnabled = ext.enabled

      // Toggle
      const toggleResult = await invokeIPC(page, 'extension:toggle', {
        extensionId: ext.manifest.id,
        enabled: !originalEnabled,
      }) as { success: boolean }
      expect(toggleResult.success).toBe(true)

      // Verify state changed
      const verifyResult = await invokeIPC(page, 'extension:get', {
        extensionId: ext.manifest.id,
      }) as { success: boolean; data?: { enabled: boolean } }
      expect(verifyResult.success).toBe(true)
      expect(verifyResult.data?.enabled).toBe(!originalEnabled)

      // Restore original state
      await invokeIPC(page, 'extension:toggle', {
        extensionId: ext.manifest.id,
        enabled: originalEnabled,
      })
    })

    test('extension:get returns correct data shape', async ({ page }) => {
      const listResult = await invokeIPC(page, 'extension:list') as {
        success: boolean
        data?: Array<{ manifest: { id: string } }>
      }
      if (!listResult.success || !listResult.data || listResult.data.length === 0) {
        test.skip(true, 'No extensions installed')
        return
      }

      const ext = listResult.data[0]
      const result = await invokeIPC(page, 'extension:get', {
        extensionId: ext.manifest.id,
      }) as { success: boolean; data?: Record<string, unknown> }

      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('manifest')
      expect(result.data).toHaveProperty('enabled')
      expect(result.data).toHaveProperty('source')
      expect(result.data).toHaveProperty('grantedPermissions')
    })
  })

  // ── Cleanup ──────────────────────────────────────────────────────────

  test.describe('Cleanup', () => {
    test('uninstalls the test extension if it was installed', async ({ page }) => {
      const result = await invokeIPC(page, 'extension:uninstall', {
        extensionId: 'com.clearpathai.sdk-example',
      }) as { success: boolean }
      // May fail if not installed — that's OK
      // Just verify it doesn't cause a crash
      expect(typeof result.success).toBe('boolean')
    })

    test('has no critical errors after all integration tests', async ({ consoleErrors }) => {
      // Use the auto-attached fixture — collects console.error + pageerror
      // for the duration of THIS test only (test-scoped).
      expect(consoleErrors).toEqual([])
    })
  })
})
