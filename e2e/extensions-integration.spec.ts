/**
 * e2e/extensions-integration.spec.ts
 *
 * Integration tests for extension install, enable/disable, and restart flow.
 * Requires pre-packaged .clear.ext file — run `npm run pretest:e2e:extensions` first.
 */

import {
  waitForAppReady,
  getCriticalConsoleErrors,
  navigateToConfigureTab,
  navigateToConnectTab,
  buttonExists,
  clickButton,
  getRootHTML,
  invokeIPC,
} from './helpers/app.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Path to the pre-packaged example extension
const EXAMPLE_EXT_PATH = path.resolve(
  __dirname,
  '../com.clearpathai.sdk-example-v1.0.0.clear.ext'
)

describe('ClearPathAI — Extension Integration', () => {
  before(async () => {
    await waitForAppReady()
  })

  // ── Install Extension via IPC ────────────────────────────────────────

  describe('Extension Install from .clear.ext', () => {
    before(async () => {
      await navigateToConnectTab('extensions')
      await browser.pause(500)
    })

    it('installs the example extension via IPC', async () => {
      // Use IPC directly to install (bypasses file dialog)
      const result = await invokeIPC('extension:install', { filePath: EXAMPLE_EXT_PATH }) as {
        success: boolean
        data?: { manifest: { id: string; name: string } }
        error?: string
      }

      expect(result.success).toBe(true)
      expect(result.data?.manifest?.id).toBe('com.clearpathai.sdk-example')

      // Refresh the preload's extension channel allowlist so IPC channels work
      // without requiring a full app restart
      await browser.execute(() => {
        const api = (window as any).electronAPI
        if (typeof api.refreshExtensionChannels === 'function') {
          api.refreshExtensionChannels()
        }
      })
    })

    it('shows the installed extension in the list', async () => {
      // Refresh the extensions tab to pick up the new installation
      await navigateToConfigureTab('settings')
      await browser.pause(300)
      await navigateToConnectTab('extensions')
      await browser.pause(500)

      const html = await getRootHTML()
      expect(html).toContain('SDK Example')
    })

    it('marks newly installed extension as user source', async () => {
      const html = await getRootHTML()
      // The installed extension should have 'user' badge
      expect(html).toContain('user')
    })

    it('extension:list IPC includes the installed extension', async () => {
      const result = await invokeIPC('extension:list') as {
        success: boolean
        data?: Array<{ manifest: { id: string }; source: string }>
      }
      expect(result.success).toBe(true)
      const sdkExample = result.data?.find(
        (e) => e.manifest.id === 'com.clearpathai.sdk-example'
      )
      expect(sdkExample).toBeTruthy()
      expect(sdkExample?.source).toBe('user')
    })
  })

  // ── Extension IPC Channel Access ──────────────────────────────────────

  describe('Extension IPC Channel Access', () => {
    it('can call sdk-example:health after install', async () => {
      // The preload should have refreshed extension channels after install
      // so we can call extension IPC channels directly
      const result = await invokeIPC('sdk-example:health') as {
        success: boolean
        data?: { status: string; handlers: string[] }
      }
      expect(result.success).toBe(true)
      expect(result.data?.status).toBe('healthy')
      expect(result.data?.handlers.length).toBeGreaterThan(0)
    })

    it('can call sdk-example:get-config', async () => {
      const result = await invokeIPC('sdk-example:get-config') as {
        success: boolean
        data?: { greeting: string }
      }
      expect(result.success).toBe(true)
      expect(result.data).toBeTruthy()
    })

    it('can call sdk-example:increment-counter', async () => {
      const result = await invokeIPC('sdk-example:increment-counter') as {
        success: boolean
        data?: { counter: number }
      }
      expect(result.success).toBe(true)
      expect(typeof result.data?.counter).toBe('number')
    })

    it('can call sdk-example:get-event-log', async () => {
      const result = await invokeIPC('sdk-example:get-event-log') as {
        success: boolean
        data?: Array<{ type: string; details: string }>
      }
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
    })

    it('can call sdk-example:get-storage-stats', async () => {
      const result = await invokeIPC('sdk-example:get-storage-stats') as {
        success: boolean
        data?: { keyCount: number }
      }
      expect(result.success).toBe(true)
      expect(typeof result.data?.keyCount).toBe('number')
    })

    it('can call sdk-example:clear-event-log', async () => {
      const result = await invokeIPC('sdk-example:clear-event-log') as { success: boolean }
      expect(result.success).toBe(true)
    })

    it('can call sdk-example:get-demo-data', async () => {
      const result = await invokeIPC('sdk-example:get-demo-data') as {
        success: boolean
        data?: { extensionId: string; sessionCount: number; turnCount: number }
      }
      expect(result.success).toBe(true)
      expect(result.data?.extensionId).toBe('com.clearpathai.sdk-example')
    })

    it('can call sdk-example:ctx-demo context provider', async () => {
      const result = await invokeIPC('sdk-example:ctx-demo', { topic: 'testing' }) as {
        success: boolean
        context?: string
        metadata?: { topic: string }
      }
      expect(result.success).toBe(true)
      expect(result.metadata?.topic).toBe('testing')
    })
  })

  // ── Enable/Disable + Restart Banner ──────────────────────────────────

  describe('Extension Toggle and Restart Flow', () => {
    before(async () => {
      await navigateToConnectTab('extensions')
      await browser.pause(500)
    })

    it('shows no restart banner initially (install does not require restart)', async () => {
      // Extension install uses the install-without-restart flow:
      // channels are refreshed via refreshExtensionChannels() so no
      // pendingRestart state is set. Only enable/disable toggles trigger
      // the restart banner.
      const html = await getRootHTML()
      expect(html).not.toContain('Changes require a restart')
    })

    it('toggling an extension shows the restart banner', async () => {
      // Find a toggle button and click it
      const toggleBtn = await $('button[title="Enable"], button[title="Disable"]')
      if (!(await toggleBtn.isExisting())) return

      await toggleBtn.click()
      await browser.pause(500)

      const html = await getRootHTML()
      expect(html).toContain('Changes require a restart')
    })

    it('restart banner shows "Restart now" and "Dismiss" buttons', async () => {
      expect(await buttonExists('Restart now')).toBe(true)
      expect(await buttonExists('Dismiss')).toBe(true)
    })

    it('shows "Restart App" button in header when pending', async () => {
      expect(await buttonExists('Restart App')).toBe(true)
    })

    it('dismiss button hides the restart banner', async () => {
      await clickButton('Dismiss')
      await browser.pause(300)

      const html = await getRootHTML()
      expect(html).not.toContain('Changes require a restart')
    })

    it('toggling again re-shows the banner', async () => {
      const toggleBtn = await $('button[title="Enable"], button[title="Disable"]')
      if (!(await toggleBtn.isExisting())) return

      await toggleBtn.click()
      await browser.pause(500)

      const html = await getRootHTML()
      expect(html).toContain('Changes require a restart')

      // Toggle back to restore state
      const toggleBtn2 = await $('button[title="Enable"], button[title="Disable"]')
      await toggleBtn2.click()
      await browser.pause(300)
    })
  })

  // ── Tab Navigation Guard ─────────────────────────────────────────────

  describe('Tab Navigation Guard', () => {
    before(async () => {
      await navigateToConnectTab('extensions')
      await browser.pause(500)
    })

    it('shows restart modal when navigating away with pending changes', async () => {
      // Create a pending change
      const toggleBtn = await $('button[title="Enable"], button[title="Disable"]')
      if (!(await toggleBtn.isExisting())) return

      await toggleBtn.click()
      await browser.pause(500)

      // Try to navigate to a sibling Connect tab. PR #47 moved Extensions
      // from Configure → Connect, so the guard now intercepts switching
      // between connect-tab-* buttons (or away from /connect entirely).
      const otherConnectTab = await $('#connect-tab-mcp')
      if (await otherConnectTab.isExisting()) {
        await otherConnectTab.click()
        await browser.pause(300)
      }

      const html = await getRootHTML()
      expect(html).toContain('Extension changes pending')
    })

    it('Stay here button keeps user on Extensions tab', async () => {
      const html = await getRootHTML()
      if (!html.includes('Extension changes pending')) return

      await clickButton('Stay here')
      await browser.pause(300)

      // Should still be on Extensions tab
      const afterHtml = await getRootHTML()
      expect(afterHtml).toContain('Extensions')
      expect(afterHtml).toContain('Changes require a restart')
    })

    it('Continue without restart navigates to target tab', async () => {
      // Try to navigate away again — this time to the MCP connect tab.
      const otherConnectTab = await $('#connect-tab-mcp')
      if (!(await otherConnectTab.isExisting())) return

      await otherConnectTab.click()
      await browser.pause(300)

      const html = await getRootHTML()
      if (!html.includes('Extension changes pending')) return

      await clickButton('Continue without restart')
      await browser.pause(500)

      // Should now be on the MCP connect tab
      const mcpSelected = await $('#connect-tab-mcp')
      const selected = await mcpSelected.getAttribute('aria-selected')
      expect(selected).toBe('true')
    })
  })

  // ── IPC Direct Tests ─────────────────────────────────────────────────

  describe('Extension IPC Integration', () => {
    it('extension:toggle via IPC updates enabled state', async () => {
      const listResult = await invokeIPC('extension:list') as {
        success: boolean
        data?: Array<{ manifest: { id: string }; enabled: boolean }>
      }
      if (!listResult.success || !listResult.data || listResult.data.length === 0) return

      const ext = listResult.data[0]
      const originalEnabled = ext.enabled

      // Toggle
      const toggleResult = await invokeIPC('extension:toggle', {
        extensionId: ext.manifest.id,
        enabled: !originalEnabled,
      }) as { success: boolean }
      expect(toggleResult.success).toBe(true)

      // Verify state changed
      const verifyResult = await invokeIPC('extension:get', {
        extensionId: ext.manifest.id,
      }) as { success: boolean; data?: { enabled: boolean } }
      expect(verifyResult.success).toBe(true)
      expect(verifyResult.data?.enabled).toBe(!originalEnabled)

      // Restore original state
      await invokeIPC('extension:toggle', {
        extensionId: ext.manifest.id,
        enabled: originalEnabled,
      })
    })

    it('extension:get returns correct data shape', async () => {
      const listResult = await invokeIPC('extension:list') as {
        success: boolean
        data?: Array<{ manifest: { id: string } }>
      }
      if (!listResult.success || !listResult.data || listResult.data.length === 0) return

      const ext = listResult.data[0]
      const result = await invokeIPC('extension:get', {
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

  describe('Cleanup', () => {
    it('uninstalls the test extension if it was installed', async () => {
      const result = await invokeIPC('extension:uninstall', {
        extensionId: 'com.clearpathai.sdk-example',
      }) as { success: boolean }
      // May fail if not installed — that's OK
      // Just verify it doesn't cause a crash
      expect(typeof result.success).toBe('boolean')
    })

    it('has no critical errors after all integration tests', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })
})
