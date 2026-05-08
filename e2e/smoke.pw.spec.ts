/**
 * e2e/smoke.pw.spec.ts
 *
 * Smoke test suite for ClearPathAI (CoPilot Commander) — Playwright port.
 *
 * Goals:
 *  1. Verify the Electron window opens and the React app mounts
 *  2. Confirm the page title or root element is present
 *  3. Confirm no critical JS errors on load
 *  4. Verify sidebar navigation exists and is clickable
 *  5. Verify main content area renders
 *  6. Click through major sidebar nav items without crashing
 *  7. Report any critical console errors found
 */

import { test, expect } from './fixtures'
import {
  navigateSidebarTo,
  mainContentIsRendered,
  ELEMENT_TIMEOUT,
} from './helpers/pw'

test.describe('ClearPathAI — Smoke Tests', () => {
  // ── 1. Window & Root Element ────────────────────────────────────────────

  test('opens the Electron window', async ({ page }) => {
    const title = await page.title()
    // Electron loads our renderer index.html — title may be empty or set by the app
    // We simply verify the page loaded (no error page, driver connected)
    expect(typeof title).toBe('string')
  })

  test('mounts the React root element', async ({ page }) => {
    const root = page.locator('#root')
    await expect(root).toBeAttached({ timeout: ELEMENT_TIMEOUT })
  })

  test('renders visible content inside the root', async ({ page }) => {
    const html = await page.locator('#root').innerHTML()
    // Root should contain more than just an empty div
    expect(html.length).toBeGreaterThan(100)
  })

  // ── 2. Console Error Check ──────────────────────────────────────────────

  test('has no critical console errors on initial load', async ({ consoleErrors }) => {
    // Renderer-side console.error and pageerror events. Main-process stderr
    // (e.g. ClearMemory binary missing, dbus errors on Linux CI) does NOT
    // appear here — those go through process.stderr forwarding in fixtures.
    expect(consoleErrors).toEqual([])
  })

  // ── 3. Sidebar Navigation ───────────────────────────────────────────────

  test('renders the sidebar navigation', async ({ page }) => {
    // The sidebar is rendered as a <nav> element in Sidebar.tsx
    await expect(page.locator('nav').first()).toBeAttached({ timeout: ELEMENT_TIMEOUT })
  })

  test('renders multiple navigation links in the sidebar', async ({ page }) => {
    // NavLink elements render as anchor tags inside the nav
    const count = await page.locator('nav a').count()
    expect(count).toBeGreaterThan(0)
  })

  test('renders the Home navigation link', async ({ page }) => {
    // Home is the index route, always shown per Sidebar.tsx NAV_ITEMS
    const texts = await page.locator('nav a').allTextContents()
    expect(texts.length).toBeGreaterThan(0)
    const foundHome = texts.some((t) => t.includes('Home'))
    expect(foundHome).toBe(true)
  })

  // ── 4. Main Content Area ────────────────────────────────────────────────

  test('renders a main content area', async ({ page }) => {
    const rendered = await mainContentIsRendered(page)
    expect(rendered).toBe(true)
  })

  // ── 5. Navigation — Click Through Main Routes ───────────────────────────

  test('navigates to Sessions without crashing', async ({ page }) => {
    await navigateSidebarTo(page, 'Sessions')
    const root = page.locator('#root')
    // After navigation the root should still exist and have content
    await expect(root).toBeAttached()
    const html = await root.innerHTML()
    expect(html.length).toBeGreaterThan(50)
  })

  test('navigates to Insights without crashing', async ({ page }) => {
    await navigateSidebarTo(page, 'Insights')
    const root = page.locator('#root')
    await expect(root).toBeAttached()
    const html = await root.innerHTML()
    expect(html.length).toBeGreaterThan(50)
  })

  test('navigates to Configure (sidebar label "Settings") without crashing', async ({ page }) => {
    // PR #47: the sidebar link to /configure is now labeled "Settings".
    await navigateSidebarTo(page, 'Settings')
    const root = page.locator('#root')
    await expect(root).toBeAttached()
    const html = await root.innerHTML()
    expect(html.length).toBeGreaterThan(50)
  })

  test('navigates back to Home without crashing', async ({ page }) => {
    await navigateSidebarTo(page, 'Home')
    const root = page.locator('#root')
    await expect(root).toBeAttached()
    const html = await root.innerHTML()
    expect(html.length).toBeGreaterThan(50)
  })

  // ── 6. Final Error Check ────────────────────────────────────────────────

  test('has no critical errors after full navigation round-trip', async ({ consoleErrors }) => {
    expect(consoleErrors).toEqual([])
  })
})
