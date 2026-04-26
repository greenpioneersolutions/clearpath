/**
 * e2e/helpers/screenshots.ts
 *
 * Screenshot utilities for the WebdriverIO Electron e2e suite.
 *
 * Visual regression (page-level comparison) is handled by @wdio/visual-service
 * via browser.checkScreen() in screenshot-crawl.spec.ts. The helpers here are
 * for the *functional* specs (home / configure / extensions / …) that take
 * ad-hoc captures while exercising the app, plus the failure-screenshot hook
 * used by wdio.conf.ts.
 */

import path from 'path'
import fs from 'fs'

/**
 * Default directory for captures from `captureScreenshot()` and
 * `captureFailureScreenshot()`. Lives under `.tmp/` (gitignored) so that
 * running `npm run e2e` locally never churns committed baseline PNGs.
 *
 * Override by setting the `SCREENSHOT_DIR` env var — useful when explicitly
 * regenerating baselines from a functional spec, e.g.:
 *
 *   SCREENSHOT_DIR=e2e/screenshots/baseline npm run e2e
 *
 * Without that override, captures land in `.tmp/visual/captures/{name}.png`
 * which the CI workflow uploads via the `screenshots` artifact for
 * post-mortem inspection.
 */
function captureRoot(): string {
  return (
    process.env.SCREENSHOT_DIR ??
    path.resolve(process.cwd(), '.tmp/visual/captures')
  )
}

/**
 * Capture a screenshot of the current renderer view to a stable, named PNG
 * under the capture root (defaults to `.tmp/visual/captures/`).
 *
 * Tags may include forward slashes for nested directories (e.g.
 * `home/dashboard-initial`); this helper creates parent dirs as needed.
 *
 * Errors are swallowed and logged so a screenshot failure never masks the
 * original assertion result.
 *
 * @param tag — relative output path without the `.png` extension
 */
export async function captureScreenshot(tag: string): Promise<void> {
  try {
    const filePath = path.join(captureRoot(), `${tag}.png`)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    await browser.saveScreenshot(filePath)
  } catch (err) {
    console.warn(`[screenshot] Failed to capture "${tag}":`, err)
  }
}

/**
 * Capture a failure screenshot to the dedicated failures directory.
 * The file is named with an ISO timestamp prefix so failures from
 * multiple runs do not overwrite one another.
 *
 * This function is best-effort: any error is caught and logged rather
 * than re-thrown so it never masks the original test failure.
 *
 * @param testTitle - Mocha test title (used to build the filename)
 */
export async function captureFailureScreenshot(testTitle: string): Promise<void> {
  try {
    const failureDir = path.resolve(process.cwd(), 'e2e/screenshots/failures')
    fs.mkdirSync(failureDir, { recursive: true })

    const safeTitle = testTitle
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(failureDir, `${timestamp}--${safeTitle}.png`)

    await browser.saveScreenshot(filePath)
    console.log(`[screenshot] Failure screenshot saved: ${filePath}`)
  } catch (err) {
    console.warn(`[screenshot] Failed to capture failure screenshot for "${testTitle}":`, err)
  }
}
