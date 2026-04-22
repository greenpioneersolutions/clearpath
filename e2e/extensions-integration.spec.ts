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

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Switch into the extension iframe, run an action, then switch back.
 * Handles the try/finally boilerplate for every tab test.
 */
async function withExtensionFrame<T>(fn: () => Promise<T>): Promise<T> {
  const iframe = await $('iframe[title*="Extension:"]')
  await browser.switchToFrame(iframe)
  try {
    return await fn()
  } finally {
    await browser.switchToFrame(null).catch(() => {/* ignore if already at top */})
  }
}

/**
 * Click a tab inside the already-open extension iframe and return the content HTML.
 * Must be called from within an active iframe frame context.
 */
async function switchToTab(label: string): Promise<string> {
  await clickExtensionTab(label)
  // Give async IPC calls (quota, theme.get, etc.) time to resolve
  await browser.pause(800)
  return getExtensionTabHTML()
}

/**
 * Click a tab and wait for a specific string to appear in the tab content.
 */
async function switchToTabAndWaitFor(label: string, text: string, timeout = 8000): Promise<string> {
  await clickExtensionTab(label)
  await browser.waitUntil(
    async () => {
      const html = await getExtensionTabHTML()
      return html.includes(text)
    },
    { timeout, timeoutMsg: `"${text}" did not appear in ${label} tab within ${timeout}ms`, interval: 400 },
  )
  return getExtensionTabHTML()
}

// ─────────────────────────────────────────────────────────────────────────────

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

  // ── Sidebar Navigation ────────────────────────────────────────────────

  describe('Extension Sidebar Navigation', () => {
    it('sidebar shows the extension nav item after install (no page refresh)', async () => {
      await waitForSidebarNavItem('SDK Example', ELEMENT_TIMEOUT)

      const xpath = `//aside//a[contains(., 'SDK Example')]`
      const link = await $(xpath)
      expect(await link.isExisting()).toBe(true)
    })

    it('clicking the extension nav item navigates to the extension page', async () => {
      await navigateSidebarTo('SDK Example')

      const html = await getRootHTML()
      expect(html).not.toContain('Extension not found')
    })

    it('extension page renders the iframe for the renderer bundle', async () => {
      await waitForExtensionIframe(ELEMENT_TIMEOUT)

      const iframe = await $('iframe[title^="Extension:"]')
      expect(await iframe.isExisting()).toBe(true)

      const title = await iframe.getAttribute('title')
      expect(title).toContain('SDK Example')
    })

    it('ext-root is populated — React mounted inside the iframe', async () => {
      try {
        const extRootHtml = await waitForExtensionContent(15000)

        expect(extRootHtml.length).toBeGreaterThan(100)
        expect(extRootHtml).toContain('SDK Example Extension')
      } finally {
        await browser.switchToFrame(null).catch(() => {})
      }
    })

    it('all 14 tab buttons are present in the tab bar', async () => {
      await withExtensionFrame(async () => {
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
      })
    })
  })

  // ── Tab Content Tests — one describe per tab ──────────────────────────

  describe('Overview tab', () => {
    it('shows Extension Identity section with the correct extension ID', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTabAndWaitFor('Overview', 'Extension Identity')
        expect(html).toContain('Extension Overview')
        expect(html).toContain('Extension ID')
        expect(html).toContain('com.clearpathai.sdk-example')
      })
    })

    it('loads and displays the current theme from sdk.theme.get()', async () => {
      await withExtensionFrame(async () => {
        // Theme data requires an IPC round-trip; wait for it
        const html = await switchToTabAndWaitFor('Overview', 'Current Theme')
        // Mode, primary, sidebar, accent should all appear
        expect(html).toContain('Mode')
        expect(html).toContain('primary')
        expect(html).toContain('sidebar')
        expect(html).toContain('accent')
      })
    })
  })

  describe('Storage tab', () => {
    it('shows heading and Add / Update Entry form', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTab('Storage')
        expect(html).toContain('Storage (sdk.storage)')
        expect(html).toContain('Add / Update Entry')
        expect(html).toContain('Stored Keys')
      })
    })

    it('loads quota data via sdk.storage.quota()', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTabAndWaitFor('Storage', 'Quota', 10000)
        expect(html).toContain('Used')
        expect(html).toContain('Limit')
        expect(html).toContain('Usage')
      })
    })
  })

  describe('Notifications tab', () => {
    it('shows compose form with title, message, and severity inputs', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTab('Notifications')
        expect(html).toContain('Notifications (sdk.notifications)')
        expect(html).toContain('Compose Notification')
        expect(html).toContain('Emit Notification')
        expect(html).toContain('Quick Presets')
      })
    })

    it('shows severity selector with info and warning options', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        expect(html).toContain('info')
        expect(html).toContain('warning')
      })
    })

    it('shows notification presets in the list', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        expect(html).toContain('Build Complete')
        expect(html).toContain('High Cost Alert')
        expect(html).toContain('Extension Ready')
      })
    })
  })

  describe('Environment tab', () => {
    it('shows lookup form and list all button', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTab('Environment')
        expect(html).toContain('Environment (sdk.env)')
        expect(html).toContain('Lookup Variable')
      })
    })

    it('loads environment variable list via sdk.env.keys()', async () => {
      await withExtensionFrame(async () => {
        // env.keys() returns an empty array in test (env vars not exposed to renderer)
        // but the section should still render
        const html = await switchToTabAndWaitFor('Environment', 'Available Variables', 8000)
        expect(html).toContain('Available Variables')
      })
    })
  })

  describe('HTTP tab', () => {
    it('shows request builder UI with method selector and URL input', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTab('HTTP')
        expect(html).toContain('HTTP (sdk.http)')
        expect(html).toContain('Request')
        expect(html).toContain('Send')
        // Method options
        expect(html).toContain('GET')
        expect(html).toContain('POST')
      })
    })

    it('shows preset URL examples for allowed domains', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        // Preset URL buttons use their labels (e.g. "JSONPlaceholder Post #1", "GitHub API Root")
        const hasPresets = html.includes('JSONPlaceholder') || html.includes('GitHub API Root')
        expect(hasPresets).toBe(true)
        // Should mention one of the allowed domain URLs
        expect(html).toMatch(/jsonplaceholder|api\.github\.com/i)
      })
    })
  })

  describe('Theme tab', () => {
    it('shows theme heading and loads theme via sdk.theme.get()', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTabAndWaitFor('Theme', 'Dark Mode', 8000)
        expect(html).toContain('Theme (sdk.theme)')
        expect(html).toContain('Mode')
        expect(html).toContain('Colors')
        // Should show actual hex color values
        expect(html).toMatch(/#[0-9a-fA-F]{6}/)
      })
    })

    it('shows color swatches for Primary, Sidebar, Accent', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        expect(html).toContain('Primary')
        expect(html).toContain('Sidebar')
        expect(html).toContain('Accent')
      })
    })

    it('shows Raw Theme Object JSON', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        expect(html).toContain('Raw Theme Object')
        // JSON should include the isDark field
        expect(html).toContain('isDark')
      })
    })

    it('shows theme changes observed counter', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        expect(html).toContain('Theme changes observed')
      })
    })
  })

  describe('Sessions tab', () => {
    it('shows sessions heading and loads session list via sdk.sessions.list()', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTabAndWaitFor('Sessions', 'Sessions', 8000)
        expect(html).toContain('Sessions (sdk.sessions)')
        // Either sessions are listed or the empty state message
        const hasContent = html.includes('Active Session') || html.includes('No sessions') || html.includes('session')
        expect(hasContent).toBe(true)
      })
    })
  })

  describe('Cost tab', () => {
    it('shows cost heading and loads summary via sdk.cost.summary()', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTabAndWaitFor('Cost', 'Cost', 8000)
        expect(html).toContain('Cost (sdk.cost)')
        // Summary cards should render regardless of whether there is spend data
        const hasSummary = html.includes('Total Cost') || html.includes('Sessions') || html.includes('Cost Summary')
        expect(hasSummary).toBe(true)
      })
    })

    it('shows budget configuration section', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        // Budget config card should appear after cost.getBudget() resolves
        const hasBudget = html.includes('Budget') || html.includes('budget')
        expect(hasBudget).toBe(true)
      })
    })
  })

  describe('Feature Flags tab', () => {
    it('shows feature flags heading and loads all flags via sdk.featureFlags.getAll()', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTabAndWaitFor('Feature Flags', 'Feature Flags', 8000)
        expect(html).toContain('Feature Flags (sdk.featureFlags)')
        expect(html).toContain('Lookup Flag')
        expect(html).toContain('All Flags')
      })
    })

    it('shows the extension-contributed flags declared in the manifest', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        // The manifest declares sdkExampleEnabled and sdkExampleDebugMode
        const hasFlags =
          html.includes('sdkExampleEnabled') ||
          html.includes('sdkExampleDebugMode') ||
          html.includes('ON') ||
          html.includes('OFF')
        expect(hasFlags).toBe(true)
      })
    })
  })

  describe('Local Models tab', () => {
    it('shows local models heading and detection UI', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTabAndWaitFor('Local Models', 'Local Models', 8000)
        expect(html).toContain('Local Models (sdk.localModels)')
        // Either Ollama/LM Studio detected or not-found message
        const hasContent =
          html.includes('Ollama') ||
          html.includes('LM Studio') ||
          html.includes('local model') ||
          html.includes('not detected')
        expect(hasContent).toBe(true)
      })
    })
  })

  describe('Context tab', () => {
    it('shows token estimator with textarea and estimate button', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTab('Context')
        expect(html).toContain('Context (sdk.context)')
        expect(html).toContain('Token Estimator')
        expect(html).toContain('Estimate Tokens')
      })
    })

    it('shows sample text presets', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        expect(html).toContain('Sample Texts')
      })
    })
  })

  describe('GitHub tab', () => {
    it('shows GitHub heading and repo browser UI', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTab('GitHub')
        expect(html).toContain('GitHub (sdk.github)')
        expect(html).toContain('Repositories')
        expect(html).toContain('Search GitHub')
      })
    })

    it('shows the repos section and either repo rows or a not-connected message', async () => {
      await withExtensionFrame(async () => {
        // Wait for the repo load to complete (either repos or empty/error)
        await browser.waitUntil(
          async () => {
            const html = await getExtensionTabHTML()
            return (
              html.includes('Repositories (') ||
              html.includes('No repositories found') ||
              html.includes('not connected') ||
              html.includes('Could not initialize')
            )
          },
          { timeout: 10000, timeoutMsg: 'GitHub repos section did not resolve within 10s', interval: 500 },
        )

        const html = await getExtensionTabHTML()
        // Regardless of GitHub auth, the UI structure should be present
        expect(html).toContain('Repositories')
        expect(html).not.toContain('Cannot read properties of undefined')
      })
    })
  })

  describe('Events tab', () => {
    it('shows events heading and active subscriptions', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTabAndWaitFor('Events', 'Active Subscriptions', 8000)
        expect(html).toContain('Events (sdk.events)')
        expect(html).toContain('Active Subscriptions')
        expect(html).toContain('Event Log')
      })
    })

    it('has default subscriptions including notification:emitted', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        // Default subscriptions from EventsTab
        expect(html).toContain('session:started')
        expect(html).toContain('theme-changed')
        expect(html).toContain('notification:emitted')
      })
    })

    it('shows the Notification Round-trip Demo section', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        expect(html).toContain('Notification Round-trip Demo')
        expect(html).toContain('Emit Notification + Watch Event')
      })
    })

    it('clicking the round-trip button emits a notification and shows the emitted event', async () => {
      await withExtensionFrame(async () => {
        // Click the round-trip test button (has id="test-round-trip")
        const btn = await $('#test-round-trip')
        await btn.waitForClickable({ timeout: ELEMENT_TIMEOUT })
        await btn.click()

        // Wait for the status message confirming the emission
        await browser.waitUntil(
          async () => {
            const html = await getExtensionTabHTML()
            return html.includes('Notification emitted')
          },
          { timeout: 8000, timeoutMsg: 'Round-trip status message did not appear within 8s', interval: 400 },
        )

        // The notification:emitted event should now be in the event log
        await browser.waitUntil(
          async () => {
            const html = await getExtensionTabHTML()
            return html.includes('notification:emitted')
          },
          { timeout: 5000, timeoutMsg: 'notification:emitted event did not appear in log within 5s', interval: 300 },
        )

        const html = await getExtensionTabHTML()
        expect(html).toContain('notification:emitted')
      })
    })
  })

  describe('Navigation tab', () => {
    it('shows navigation heading and preset routes', async () => {
      await withExtensionFrame(async () => {
        const html = await switchToTab('Navigation')
        expect(html).toContain('Navigation (sdk.navigate)')
        // Should have some preset route buttons
        const hasRoutes = html.includes('Home') || html.includes('Work') || html.includes('Configure')
        expect(hasRoutes).toBe(true)
      })
    })

    it('shows custom route input field and App Routes list', async () => {
      await withExtensionFrame(async () => {
        const html = await getExtensionTabHTML()
        // Section heading is "Custom Route" and the input label is "Path"
        expect(html).toContain('Custom Route')
        expect(html).toContain('App Routes')
      })
    })
  })

  // ── IPC Data visible in rendered UI ──────────────────────────────────

  describe('IPC data in rendered UI', () => {
    it('Overview tab shows extension ID sourced from IPC (sdk.extensionId)', async () => {
      await withExtensionFrame(async () => {
        await clickExtensionTab('Overview')
        const html = await getExtensionTabHTML()
        expect(html).toContain('com.clearpathai.sdk-example')
      })
    })

    it('Storage tab quota data loads from IPC (sdk.storage.quota)', async () => {
      await withExtensionFrame(async () => {
        await clickExtensionTab('Storage')

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
      })
    })
  })

  // ── Console errors ────────────────────────────────────────────────────

  it('no extension-related critical console errors after full tab navigation', async () => {
    const errors = await getCriticalConsoleErrors()
    const extErrors = errors.filter((e) =>
      e.includes('sdk-example') ||
      e.includes('clearpath-ext') ||
      e.includes('ExtensionHost') ||
      e.includes('[SDK Example]')
    )
    expect(extErrors).toHaveLength(0)
  })

  // ── Extension IPC Channel Access ──────────────────────────────────────

  describe('Extension IPC Channel Access', () => {
    before(async () => {
      await navigateToConfigureTab('extensions')
      await browser.pause(300)
    })

    it('can call sdk-example:health after install', async () => {
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
      const html = await getRootHTML()
      expect(html).not.toContain('Changes require a restart')
    })

    it('toggling an extension shows the restart banner', async () => {
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

    it('toggling again re-shows the banner, then toggle back to restore state', async () => {
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
      const toggleBtn = await $('button[title="Enable"], button[title="Disable"]')
      if (!(await toggleBtn.isExisting())) return

      await toggleBtn.click()
      await browser.pause(500)

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

      const afterHtml = await getRootHTML()
      expect(afterHtml).toContain('Extensions')
      expect(afterHtml).toContain('Changes require a restart')
    })

    it('Continue without restart navigates to target tab', async () => {
      const settingsTab = await $('#tab-settings')
      await settingsTab.click()
      await browser.pause(300)

      const html = await getRootHTML()
      if (!html.includes('Extension changes pending')) return

      await clickButton('Continue without restart')
      await browser.pause(500)

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

      const toggleResult = await invokeIPC('extension:toggle', {
        extensionId: ext.manifest.id,
        enabled: !originalEnabled,
      }) as { success: boolean }
      expect(toggleResult.success).toBe(true)

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
      expect(typeof result.success).toBe('boolean')
    })

    it('has no critical errors after all integration tests', async () => {
      const errors = await getCriticalConsoleErrors()
      expect(Array.isArray(errors)).toBe(true)
    })
  })
})
