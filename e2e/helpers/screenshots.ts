/**
 * e2e/helpers/screenshots.ts
 *
 * Screenshot capture utilities for the WebdriverIO Electron e2e suite.
 *
 * Directory strategy (controlled by SCREENSHOT_DIR env var):
 *   Default:  e2e/screenshots/baseline     — committed to Git LFS
 *   CI mode:  e2e/screenshots/actual       — generated, gitignored, uploaded as artifact
 *   Failures: e2e/screenshots/failures     — always written on test failure
 *
 * Naming convention: lowercase, hyphens only, double-dash separates page from section.
 * Examples: "home--initial", "configure--tab-settings", "work--tab-compose"
 */

import path from 'path'
import fs from 'fs'

/**
 * Resolved absolute path for the screenshot output directory.
 * Controlled by the SCREENSHOT_DIR env var; defaults to e2e/screenshots/baseline.
 * Paths are resolved relative to process.cwd() (the project root).
 */
export const SCREENSHOT_DIR: string = path.resolve(
  process.cwd(),
  process.env.SCREENSHOT_DIR ?? 'e2e/screenshots/baseline',
)

/**
 * Sanitize a screenshot name and resolve it to an absolute file path.
 * The name is normalized to lowercase, with any character that is not
 * a letter, digit, hyphen, or dash replaced by a hyphen.
 * Creates the target directory if it does not already exist.
 *
 * @param name - Human-readable screenshot name, e.g. "home--initial"
 * @returns Absolute path to the .png file that should be written
 */
export function resolveScreenshotPath(name: string): string {
  // Support subdirectory paths using '/' as a separator so callers can write
  // captureScreenshot('configure/high-contrast-on') and get a file at
  // SCREENSHOT_DIR/configure/high-contrast-on.png.
  // Each path segment is sanitized independently so that directory separators
  // are preserved.
  const segments = name.split('/')
  const safeSegments = segments.map((seg) =>
    seg
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, ''),
  )

  const dir =
    safeSegments.length > 1
      ? path.join(SCREENSHOT_DIR, ...safeSegments.slice(0, -1))
      : SCREENSHOT_DIR

  fs.mkdirSync(dir, { recursive: true })

  return path.join(dir, `${safeSegments[safeSegments.length - 1]}.png`)
}

/**
 * Capture a screenshot of the current Electron window and write it to disk.
 * The file is placed in SCREENSHOT_DIR using the sanitized form of `name`.
 *
 * @param name - Screenshot name (e.g. "configure--tab-settings")
 * @returns Absolute path of the file that was written
 */
export async function captureScreenshot(name: string): Promise<string> {
  const filePath = resolveScreenshotPath(name)
  await browser.saveScreenshot(filePath)
  console.log(`[screenshot] Saved: ${filePath}`)
  return filePath
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
