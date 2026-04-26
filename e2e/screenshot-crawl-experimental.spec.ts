/// <reference types="@wdio/globals/types" />
/// <reference types="@wdio/visual-service" />
/// <reference types="mocha" />

/**
 * e2e/screenshot-crawl-experimental.spec.ts
 *
 * Visual coverage for experimental-only surfaces. Run via the dedicated
 * config (wdio.screenshots.experimental.conf.ts) which:
 *   1. Builds the app with CLEARPATH_E2E_EXPERIMENTAL=1 so every
 *      `experimental: true` flag from features.json is forced ON, including
 *      the page chunks that are normally tree-shaken.
 *   2. Writes screenshots into e2e/screenshots/baseline/experimental-features/
 *      so the normal baseline directory stays free of experimental content.
 *
 * Adding a new experimental page: list it in EXPERIMENTAL_PAGES below and
 * commit the resulting baseline. The crawl is intentionally narrow — we
 * only capture surfaces that don't exist when the flags are off.
 */

import {
  waitForAppReady,
  freezeDynamicContent,
  ELEMENT_TIMEOUT,
} from './helpers/app.js'

interface ExperimentalRoute {
  /** URL hash route (excluding the leading `#/`). */
  route: string
  /** Visible heading or marker text used to confirm the page rendered. */
  marker: string
  /** Output filename — written under experimental-features/. */
  screenshot: string
}

// Experimental routes are gated by build-time flags and only exist when
// CLEARPATH_E2E_EXPERIMENTAL=1 was set when the bundle was built. Each
// screenshot tag is prefixed `experimental-features/` so the visual service
// writes it into the dedicated baseline subfolder.
const EXPERIMENTAL_PAGES: ExperimentalRoute[] = [
  {
    route: 'pr-scores',
    marker: 'PR Scores',
    screenshot: 'experimental-features/pr-scores--initial',
  },
  {
    route: 'backstage-explorer',
    marker: 'Backstage',
    screenshot: 'experimental-features/backstage-explorer--initial',
  },
]

async function checkScreenshot(name: string): Promise<void> {
  await freezeDynamicContent()
  await browser.checkScreen(name, {})
}

describe('ClearPathAI — Experimental Features Screenshot Crawl', () => {
  before(async () => {
    await waitForAppReady()
  })

  for (const page of EXPERIMENTAL_PAGES) {
    it(`captures experimental page: ${page.route}`, async () => {
      await browser.execute((hash) => {
        window.location.hash = `#/${hash}`
      }, page.route)
      await browser.pause(800)

      // Confirm the experimental page actually rendered (vs. landing on a
      // 404 / fallback). If the marker text isn't present the build was not
      // produced with CLEARPATH_E2E_EXPERIMENTAL=1 and the test should fail
      // loudly rather than silently capturing a blank page.
      const root = await $('#root')
      await root.waitForExist({ timeout: ELEMENT_TIMEOUT })
      await browser.waitUntil(
        async () => (await root.getText()).includes(page.marker),
        {
          timeout: ELEMENT_TIMEOUT,
          timeoutMsg: `Expected experimental route "${page.route}" to render marker text "${page.marker}" before screenshot — build likely missing CLEARPATH_E2E_EXPERIMENTAL=1.`,
        },
      )

      await checkScreenshot(page.screenshot)
    })
  }
})
