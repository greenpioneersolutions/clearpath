/**
 * e2e/helpers/pw-screenshots.ts
 *
 * Ad-hoc screenshot helper for Playwright specs. Built-in
 * `screenshot: 'only-on-failure'` (in playwright.config.ts) covers the
 * automatic failure-capture case — keep this for explicit "save now"
 * captures during debugging.
 */
import type { Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_DIR = path.resolve(process.cwd(), '.tmp/visual/captures')

/**
 * Capture a screenshot of the current renderer view to a stable, named PNG.
 *
 * Tags may include forward slashes for nested directories — parent dirs are
 * created as needed. Errors are swallowed so a screenshot failure never
 * masks the original assertion result.
 *
 * Short 5s timeout: on some Electron renderer states the `document.fonts.ready`
 * promise that `page.screenshot` waits on can hang past Playwright's default
 * 30s. This helper is for ad-hoc captures; if the page is too busy to grab in
 * 5s we just log and move on.
 */
export async function captureScreenshot(page: Page, tag: string): Promise<void> {
  try {
    const dir = process.env.SCREENSHOT_DIR ?? DEFAULT_DIR
    const filePath = path.join(dir, `${tag}.png`)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    await page.screenshot({ path: filePath, timeout: 5_000 })
  } catch (err) {
    console.warn(`captureScreenshot('${tag}') failed:`, err)
  }
}
