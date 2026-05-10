/**
 * e2e/app-lifecycle.pw.spec.ts
 *
 * End-to-end tests for app-wide lifecycle concerns:
 * - Electron window management
 * - IPC bridge connectivity
 * - Error resilience across all pages
 * - Full app journey (simulate a real user session)
 */

import { test, expect, type Page } from './fixtures'
import {
  navigateSidebarTo,
  navigateToHash,
  navigateToConfigureTab,
  navigateToConnectTab,
  mainContentIsRendered,
  getRootHTML,
  invokeIPC,
  ELEMENT_TIMEOUT,
} from './helpers/pw'

test.describe('ClearPathAI — App Lifecycle', () => {
  // ── Electron Window ───────────────────────────────────────────────────

  test.describe('Electron Window', () => {
    test('has a browser window open', async ({ page }) => {
      const title = await page.title()
      expect(typeof title).toBe('string')
    })

    test('window has proper dimensions', async ({ page }) => {
      const size = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }))
      expect(size.width).toBeGreaterThan(400)
      expect(size.height).toBeGreaterThan(300)
    })

    test('React root is mounted', async ({ page }) => {
      const root = page.locator('#root')
      await expect(root).toBeAttached()
    })
  })

  // ── IPC Bridge ────────────────────────────────────────────────────────

  test.describe('IPC Bridge', () => {
    test('electronAPI is available on window', async ({ page }) => {
      const result = await page.evaluate(() => {
        return typeof (window as unknown as { electronAPI?: unknown }).electronAPI
      })
      expect(result).toBe('object')
    })

    test('electronAPI.invoke is a function', async ({ page }) => {
      const result = await page.evaluate(() => {
        const api = (window as unknown as { electronAPI?: { invoke?: unknown } }).electronAPI
        return typeof api?.invoke
      })
      expect(result).toBe('function')
    })

    test('electronAPI.on is a function', async ({ page }) => {
      const result = await page.evaluate(() => {
        const api = (window as unknown as { electronAPI?: { on?: unknown } }).electronAPI
        return typeof api?.on
      })
      expect(result).toBe('function')
    })
  })

  // ── Full User Journey ─────────────────────────────────────────────────

  test.describe('Full User Journey', () => {
    test('Step 1: Start at Home, see greeting', async ({ page }) => {
      await navigateSidebarTo(page, 'Home')
      await page.waitForTimeout(500)

      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(300)
    })

    test('Step 2: Navigate to Sessions page', async ({ page }) => {
      await navigateSidebarTo(page, 'Sessions')
      await page.waitForTimeout(500)

      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })

    test('Step 3: Check Insights analytics', async ({ page }) => {
      await navigateSidebarTo(page, 'Insights')
      await page.waitForTimeout(500)

      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })

    test('Step 4: Open Configure and check Settings', async ({ page }) => {
      await navigateToConfigureTab(page, 'settings')

      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(300)
    })

    test('Step 5: Check Integrations status (Connect → Integrations)', async ({ page }) => {
      // PR #47 moved integrations from Configure to the Connect page.
      await navigateToConnectTab(page, 'integrations')

      const html = await getRootHTML(page)
      expect(html).toContain('GitHub')
    })

    test('Step 6: Review Extensions (Connect → Extensions)', async ({ page }) => {
      // PR #47 moved extensions from Configure to the Connect page.
      // showExtensions is an experimental flag — when compiled-out (the
      // default build configuration), the renderer silently redirects
      // ?tab=extensions to the integrations tab. Try to enable it via IPC
      // first; if the build has it compiled in we'll see "Extensions" in
      // the heading, otherwise we accept the integrations fallback.
      await invokeIPC(page, 'feature-flags:set', { showExtensions: true })
      await navigateToConnectTab(page, 'extensions')
      await page.waitForTimeout(500)

      const html = await getRootHTML(page)
      // Either the Extensions tab mounted (compiled-in build) or the page
      // gracefully fell back to integrations (compiled-out build).
      const renderedExtensionsOrFallback =
        html.includes('Extensions') || html.includes('GitHub')
      expect(renderedExtensionsOrFallback).toBe(true)
    })

    test('Step 7: Check Agents configuration', async ({ page }) => {
      await navigateToConfigureTab(page, 'agents')

      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(200)
    })

    test('Step 8: Return Home', async ({ page }) => {
      await navigateSidebarTo(page, 'Home')
      await page.waitForTimeout(300)

      const html = await getRootHTML(page)
      expect(html.length).toBeGreaterThan(300)
    })

    test('final tab in user journey has no critical errors', async ({ consoleErrors }) => {
      // Test-scoped: covers errors from the page fixture's load + navigation
      // for THIS test. Prior 'journey' tests assert their own emptiness.
      expect(consoleErrors).toEqual([])
    })
  })

  // ── Error Resilience ──────────────────────────────────────────────────

  test.describe('Error Resilience', () => {
    test('handles direct hash navigation to all routes', async ({ page }) => {
      await navigateToHash(page, '#/')
      expect(await mainContentIsRendered(page)).toBe(true)

      await navigateToHash(page, '#/work')
      expect(await mainContentIsRendered(page)).toBe(true)

      await navigateToHash(page, '#/insights')
      expect(await mainContentIsRendered(page)).toBe(true)

      await navigateToHash(page, '#/configure')
      expect(await mainContentIsRendered(page)).toBe(true)

      // PR #47 added the top-level /connect route
      await navigateToHash(page, '#/connect')
      expect(await mainContentIsRendered(page)).toBe(true)
    })

    test('handles navigation to Connect with extensions tab query param', async ({ page }) => {
      // PR #47: extensions moved from Configure → Connect.
      // When showExtensions is compiled out the page silently redirects
      // to the integrations tab — verify the page didn't crash on the
      // unknown/disabled tab param either way.
      await invokeIPC(page, 'feature-flags:set', { showExtensions: true })
      await navigateToHash(page, '#/connect?tab=extensions')
      await page.waitForTimeout(500)

      const html = await getRootHTML(page)
      const renderedExtensionsOrFallback =
        html.includes('Extensions') || html.includes('GitHub')
      expect(renderedExtensionsOrFallback).toBe(true)
    })

    test('handles navigation to Connect with integrations tab param', async ({ page }) => {
      // PR #47: integrations moved from Configure → Connect.
      await navigateToHash(page, '#/connect?tab=integrations')

      const html = await getRootHTML(page)
      expect(html).toContain('GitHub')
    })

    test('does not crash on unknown routes', async ({ page }) => {
      await navigateToHash(page, '#/nonexistent-route')

      // The app may render a blank page for unknown routes — that's acceptable.
      // The key assertion is that the root element still exists (no white-screen crash).
      const root = page.locator('#root')
      await expect(root).toBeAttached()

      // Navigate back to a known route to recover for subsequent tests
      await navigateToHash(page, '#/')
      await page.waitForTimeout(1000)
    })

    test('app is still functional after error resilience tests', async ({ page }) => {
      const root = page.locator('#root')
      await expect(root).toBeAttached()
      const html = await root.innerHTML()
      expect(html.length).toBeGreaterThan(100)
    })
  })

  // ── Memory / Performance ──────────────────────────────────────────────

  test.describe('Performance Basics', () => {
    test.beforeEach(async ({ page }) => {
      // Ensure we're on a known route before performance tests
      await navigateToHash(page, '#/')
      await page.waitForTimeout(500)
    })

    test('main content renders within timeout', async ({ page }) => {
      await navigateSidebarTo(page, 'Home')
      // Poll mainContentIsRendered from the test runner side — invokeIPC
      // and helpers can't run inside page.waitForFunction (browser context).
      const start = Date.now()
      let rendered = false
      while (Date.now() - start < ELEMENT_TIMEOUT) {
        rendered = await mainContentIsRendered(page)
        if (rendered) break
        await page.waitForTimeout(150)
      }
      expect(rendered).toBe(true)
    })

    test('page does not show blank content after navigation', async ({ page }) => {
      // PR #47: sidebar label for /configure is now "Settings".
      const routes = ['Sessions', 'Insights', 'Settings', 'Home']
      for (const route of routes) {
        await navigateSidebarTo(page, route)
        await page.waitForTimeout(500)
        const html = await getRootHTML(page)
        // No page should render less than 100 chars — that would indicate a blank page
        expect(html.length).toBeGreaterThan(100)
      }
    })
  })

  // ── IPC Round-Trip Tests ──────────────────────────────────────────────

  test.describe('IPC Round-Trip', () => {
    test('accessibility:get returns valid settings object', async ({ page }) => {
      const result = await invokeIPC(page, 'accessibility:get') as Record<string, unknown> | null
      expect(result).not.toBeNull()
      expect(typeof result).toBe('object')
      expect(result).toHaveProperty('fontScale')
      expect(result).toHaveProperty('reducedMotion')
      expect(result).toHaveProperty('highContrast')
    })

    test('accessibility:set persists a change and accessibility:get reflects it', async ({ page }) => {
      // Set high contrast on
      await invokeIPC(page, 'accessibility:set', { highContrast: true })

      // Read it back
      const result = await invokeIPC(page, 'accessibility:get') as Record<string, unknown>
      expect(result.highContrast).toBe(true)

      // Reset to defaults
      await invokeIPC(page, 'accessibility:reset')

      // Verify reset worked
      const after = await invokeIPC(page, 'accessibility:get') as Record<string, unknown>
      expect(after.highContrast).toBe(false)
    })

    test('branding:get returns valid config', async ({ page }) => {
      const result = await invokeIPC(page, 'branding:get') as Record<string, unknown> | null
      expect(result).not.toBeNull()
      expect(typeof result).toBe('object')
      // Branding config should have appName
      expect(result).toHaveProperty('appName')
      expect(typeof (result as Record<string, unknown>).appName).toBe('string')
    })

    test('settings:get returns an object', async ({ page }) => {
      const result = await invokeIPC(page, 'settings:get')
      expect(result).not.toBeNull()
      expect(typeof result).toBe('object')
    })

    test('feature-flags:get returns flags object', async ({ page }) => {
      const result = await invokeIPC(page, 'feature-flags:get') as Record<string, unknown> | null
      expect(result).not.toBeNull()
      expect(typeof result).toBe('object')
    })

    test('extension:list returns success with array data', async ({ page }) => {
      const result = await invokeIPC(page, 'extension:list') as { success: boolean; data?: unknown[] }
      expect(result).toHaveProperty('success')
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
    })

    test('integration:get-status returns status map with github key', async ({ page }) => {
      const result = await invokeIPC(page, 'integration:get-status') as Record<string, unknown>
      expect(result).not.toBeNull()
      expect(result).toHaveProperty('github')
    })

    test('learn:get-paths returns array of learning paths', async ({ page }) => {
      const result = await invokeIPC(page, 'learn:get-paths') as unknown[]
      expect(Array.isArray(result)).toBe(true)
      if (result.length > 0) {
        const first = result[0] as Record<string, unknown>
        expect(first).toHaveProperty('id')
        expect(first).toHaveProperty('name')
      }
    })
  })
})
