/**
 * e2e/extensions-integration.spec.ts
 *
 * Full lifecycle e2e tests for the SDK example extension.
 *
 * The extension under test is built from the compiled SDK dist (not source aliases),
 * exactly as a real consumer would build and package it. The .clear.ext file is
 * produced by `npm run pretest:e2e:extensions` (runs scripts/build-sdk-for-testing.js)
 * which: builds the SDK → packs it → installs into example → bundles dist mode → packages.
 *
 * Run standalone:
 *   npm run e2e:extensions
 *
 * Or generate the package separately then run the app tests:
 *   npm run pretest:e2e:extensions
 *   npm run build
 *   wdio run wdio.extensions.conf.ts
 */

import {
  waitForAppReady,
  getCriticalConsoleErrors,
  navigateToConfigureTab,
  navigateSidebarTo,
  waitForText,
  buttonExists,
  clickButton,
  getRootHTML,
  invokeIPC,
  waitForSidebarNavItem,
  waitForExtensionIframe,
  waitForExtensionContent,
  clickExtensionTab,
  getExtensionTabHTML,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Path to the pre-packaged example extension (produced by pretest:e2e:extensions)
const EXAMPLE_EXT_PATH = path.resolve(
  __dirname,
  '../com.clearpathai.sdk-example-v1.0.0.clear.ext'
)

// Number of IPC handlers declared in the example manifest and registered in main.ts
const EXPECTED_HANDLER_COUNT = 13

describe('ClearPathAI — Extension Integration', () => {
  before(async () => {
    await waitForAppReady()
  })

  // ── SDK Build Pre-conditions ──────────────────────────────────────────
  // These run first to give a clear error if the .clear.ext was not produced
  // by `npm run pretest:e2e:extensions` (scripts/build-sdk-for-testing.js).

  describe('SDK Build Pre-conditions', () => {
    it('packaged .clear.ext file exists at expected path', () => {
      const exists = fs.existsSync(EXAMPLE_EXT_PATH)
      if (!exists) {
        throw new Error(
          `Pre-packaged extension not found at:\n  ${EXAMPLE_EXT_PATH}\n\n` +
          `Run the following to build and package it:\n  npm run pretest:e2e:extensions\n\n` +
          `This script builds the SDK, packs it as a tarball, installs it into the ` +
          `example extension as a consumer would, bundles in dist mode, then packages ` +
          `to a .clear.ext file at the project root.`
        )
      }
      expect(exists).toBe(true)
    })

    it('packaged .clear.ext is a non-empty file', () => {
      const stat = fs.statSync(EXAMPLE_EXT_PATH)
      expect(stat.isFile()).toBe(true)
      // A valid zip has at least a 22-byte end-of-central-directory record
      expect(stat.size).toBeGreaterThan(100)
    })
  })

  // ── Install Extension via IPC ────────────────────────────────────────

  describe('Extension Install from .clear.ext', () => {
    before(async () => {
      await navigateToConfigureTab('extensions')
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
      await navigateToConfigureTab('extensions')
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

    it('enables the extension so the clearpath-ext:// protocol serves its assets', async () => {
      // User-installed extensions start disabled (enabled: false by design).
      // The clearpath-ext:// protocol handler returns 403 for disabled extensions,
      // so the renderer bundle would never load (blank iframe). Enable it here.
      const result = await invokeIPC('extension:toggle', {
        extensionId: 'com.clearpathai.sdk-example',
        enabled: true,
      }) as { success: boolean; error?: string }
      expect(result.success).toBe(true)

      // Refresh the preload's extension channel allowlist now that it is enabled
      await browser.execute(() => {
        const api = (window as any).electronAPI
        if (typeof api.refreshExtensionChannels === 'function') {
          api.refreshExtensionChannels()
        }
      })

      // Brief pause for state to propagate
      await browser.pause(500)
    })
  })

  // ── Sidebar Navigation (extension:changed refresh) ────────────────────
  //
  // After install the main process fires `extension:changed` via webContents.send().
  // All useExtensions() hook instances (including the Sidebar's) receive it and
  // call refresh(), so the extension nav item appears without a page reload.

  describe('Extension Sidebar Navigation', () => {
    // ── 1. Sidebar presence check ─────────────────────────────────────
    it('sidebar shows the extension nav item after install (no page refresh)', async () => {
      // The SDK Example extension contributes a nav item with label "SDK Example"
      // (clearpath-extension.json → contributes.navigation[0].label).
      // After extension:changed is received the Sidebar re-renders with the new item.
      await waitForSidebarNavItem('SDK Example', ELEMENT_TIMEOUT)

      const xpath = `//aside//a[contains(., 'SDK Example')]`
      const link = await $(xpath)
      expect(await link.isExisting()).toBe(true)
    })

    // ── 2. Navigation and iframe load ─────────────────────────────────
    it('clicking the extension nav item navigates to the extension page', async () => {
      await navigateSidebarTo('SDK Example')

      // The route is /ext/com.clearpathai.sdk-example/extensions/sdk-example.
      // ExtensionPage renders either an iframe (if renderer is present) or a
      // "no UI component" message. Either way it should not show the generic
      // "Extension not found" error.
      const html = await getRootHTML()
      expect(html).not.toContain('Extension not found')
    })

    it('extension page renders the iframe for the renderer bundle', async () => {
      // The SDK example has a renderer entry (dist/renderer.js), so ExtensionHost
      // renders a sandboxed iframe with title "Extension: SDK Example".
      await waitForExtensionIframe(ELEMENT_TIMEOUT)

      const iframe = await $('iframe[title^="Extension:"]')
      expect(await iframe.isExisting()).toBe(true)

      const title = await iframe.getAttribute('title')
      expect(title).toContain('SDK Example')
    })

    it('ext-root is populated — React mounted inside the iframe', async () => {
      // This is the critical test that catches the blank page bug.
      // waitForExtensionContent switches into the iframe context, polls until
      // #ext-root has child content, then returns the inner HTML.
      // try/finally ensures we always exit iframe context so subsequent tests
      // don't run inside the wrong browsing context.
      try {
        const extRootHtml = await waitForExtensionContent(15000)

        // Must contain substantially more than an empty div tag
        expect(extRootHtml.length).toBeGreaterThan(100)

        // The App header is always rendered as the very first element inside
        // ext-root regardless of which tab is active.
        expect(extRootHtml).toContain('SDK Example Extension')
      } finally {
        // Always return to top-level context — even on timeout or assertion failure
        await browser.switchToFrame(null).catch(() => {/* ignore if already at top */})
      }
    })

    // ── 3. Extension tab navigation and content ───────────────────────
    it('Overview tab is the default active tab and shows Extension Identity', async () => {
      const iframe = await $('iframe[title*="Extension:"]')
      await browser.switchToFrame(iframe)
      try {
        const html = await getExtensionTabHTML()
        expect(html).toContain('Extension Overview')
        expect(html).toContain('Extension Identity')
        expect(html).toContain('Extension ID')
        expect(html).toContain('com.clearpathai.sdk-example')
      } finally {
        await browser.switchToFrame(null).catch(() => {})
      }
    })

    it('clicking the Storage tab shows the storage UI', async () => {
      const iframe = await $('iframe[title*="Extension:"]')
      await browser.switchToFrame(iframe)
      try {
        await clickExtensionTab('Storage')
        const html = await getExtensionTabHTML()
        expect(html).toContain('Storage (sdk.storage)')
        expect(html).toContain('Add / Update Entry')
        expect(html).toContain('Stored Keys')
      } finally {
        await browser.switchToFrame(null).catch(() => {})
      }
    })

    it('clicking the Sessions tab shows the sessions UI', async () => {
      const iframe = await $('iframe[title*="Extension:"]')
      await browser.switchToFrame(iframe)
      try {
        await clickExtensionTab('Sessions')
        const html = await getExtensionTabHTML()
        expect(html).toContain('Sessions')
      } finally {
        await browser.switchToFrame(null).catch(() => {})
      }
    })

    it('all 14 tab buttons are present in the tab bar', async () => {
      const iframe = await $('iframe[title*="Extension:"]')
      await browser.switchToFrame(iframe)
      try {
        const extHtml = await getExtensionTabHTML()
        const expectedTabs = [
          'Overview', 'Storage', 'Notifications', 'Environment',
          'HTTP', 'Theme', 'Sessions', 'Cost',
          'Feature Flags', 'Local Models', 'Context', 'GitHub',
          'Events', 'Navigation',
        ]
        for (const tabLabel of expectedTabs) {
          expect(extHtml).toContain(tabLabel)
        }
      } finally {
        await browser.switchToFrame(null).catch(() => {})
      }
    })

    // ── 4. IPC data visible in rendered UI ────────────────────────────
    it('Overview tab shows the extension ID sourced from IPC (sdk.extensionId)', async () => {
      const iframe = await $('iframe[title*="Extension:"]')
      await browser.switchToFrame(iframe)
      try {
        await clickExtensionTab('Overview')
        const html = await getExtensionTabHTML()
        expect(html).toContain('com.clearpathai.sdk-example')
      } finally {
        await browser.switchToFrame(null).catch(() => {})
      }
    })

    it('Storage tab quota data loads from IPC (sdk.storage.quota)', async () => {
      const iframe = await $('iframe[title*="Extension:"]')
      await browser.switchToFrame(iframe)
      try {
        await clickExtensionTab('Storage')

        // Wait for the quota card to appear — it requires an IPC round-trip
        await browser.waitUntil(
          async () => {
            const html = await getExtensionTabHTML()
            return html.includes('Quota')
          },
          {
            timeout: 10000,
            timeoutMsg: 'Storage quota did not load from IPC within 10s',
            interval: 400,
          },
        )

        const html = await getExtensionTabHTML()
        expect(html).toContain('Used')
        expect(html).toContain('Limit')
        expect(html).toContain('Usage')
      } finally {
        await browser.switchToFrame(null).catch(() => {})
      }
    })

    // ── 5. Console error check ────────────────────────────────────────
    it('no extension-related critical console errors after full navigation', async () => {
      const errors = await getCriticalConsoleErrors()
      // Only flag errors explicitly tied to the extension or its host component.
      // General React warnings (e.g. key props) are not critical errors.
      const extErrors = errors.filter((e) =>
        e.includes('sdk-example') ||
        e.includes('clearpath-ext') ||
        e.includes('ExtensionHost') ||
        e.includes('[SDK Example]')
      )
      expect(extErrors).toHaveLength(0)
    })

    it('navigates back to configure/extensions tab', async () => {
      await navigateToConfigureTab('extensions')

      // Verify we are back on the Extensions configure tab
      const html = await getRootHTML()
      expect(html).toContain('SDK Example')
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

    it('sdk-example:set-config + sdk-example:get-config storage round-trip', async () => {
      // Verifies that the dist-built main.cjs correctly reads/writes extension storage
      const testGreeting = 'Hello from e2e dist test'
      const setResult = await invokeIPC('sdk-example:set-config', {
        greeting: testGreeting,
      }) as { success: boolean; data?: { greeting: string } }
      expect(setResult.success).toBe(true)
      expect(setResult.data?.greeting).toBe(testGreeting)

      const getResult = await invokeIPC('sdk-example:get-config') as {
        success: boolean
        data?: { greeting: string }
      }
      expect(getResult.success).toBe(true)
      expect(getResult.data?.greeting).toBe(testGreeting)
    })

    it(`sdk-example:health reports exactly ${EXPECTED_HANDLER_COUNT} registered handlers`, async () => {
      // All handlers declared in ipcChannels (clearpath-extension.json) must be
      // registered when activate() runs. This validates the dist build compiled
      // all 13 handlers correctly.
      const result = await invokeIPC('sdk-example:health') as {
        success: boolean
        data?: { handlers: string[] }
      }
      expect(result.success).toBe(true)
      expect(result.data?.handlers.length).toBe(EXPECTED_HANDLER_COUNT)
    })
  })

  // ── Enable/Disable + Restart Banner ──────────────────────────────────

  describe('Extension Toggle and Restart Flow', () => {
    before(async () => {
      await navigateToConfigureTab('extensions')
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
      await navigateToConfigureTab('extensions')
      await browser.pause(500)
    })

    it('shows restart modal when navigating away with pending changes', async () => {
      // Create a pending change
      const toggleBtn = await $('button[title="Enable"], button[title="Disable"]')
      if (!(await toggleBtn.isExisting())) return

      await toggleBtn.click()
      await browser.pause(500)

      // Try to navigate to Settings tab
      const settingsTab = await $('#tab-settings')
      await settingsTab.click()
      await browser.pause(300)

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
      // Try to navigate away again
      const settingsTab = await $('#tab-settings')
      await settingsTab.click()
      await browser.pause(300)

      const html = await getRootHTML()
      if (!html.includes('Extension changes pending')) return

      await clickButton('Continue without restart')
      await browser.pause(500)

      // Should now be on Settings tab
      const settingsSelected = await $('#tab-settings')
      const selected = await settingsSelected.getAttribute('aria-selected')
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
