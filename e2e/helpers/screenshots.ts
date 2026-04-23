/**
 * e2e/helpers/screenshots.ts
 *
 * Screenshot utilities for the WebdriverIO Electron e2e suite.
 *
 * Visual regression (page-level comparison) is handled by @wdio/visual-service
 * via browser.checkScreen() in screenshot-crawl.spec.ts.  This helper only
 * provides the failure-screenshot helper used by wdio.conf.ts afterEach.
 */

import path from 'path'
import fs from 'fs'

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
