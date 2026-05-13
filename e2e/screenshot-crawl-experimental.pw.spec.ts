/**
 * e2e/screenshot-crawl-experimental.pw.spec.ts
 *
 * Visual coverage for experimental-only surfaces. Requires a build with
 * CLEARPATH_E2E_EXPERIMENTAL=1 so every `experimental: true` flag from
 * features.json is forced ON, restoring the experimental page chunks to the
 * bundle for visual coverage.
 *
 * Run via the dedicated config:
 *   CLEARPATH_E2E_EXPERIMENTAL=1 npm run pw:screenshots:experimental
 *
 * Baselines for these screenshots live under
 *   e2e/screenshots/baseline/experimental-features/
 * so they don't pollute the normal baseline directory.
 *
 * Adding a new experimental page: list it in EXPERIMENTAL_PAGES below and
 * commit the resulting baseline.
 */

import { test, expect, type Page } from './fixtures'
import { waitForAppReady, freezeDynamicContent, ELEMENT_TIMEOUT } from './helpers/pw'
import fs from 'node:fs'
import path from 'node:path'

interface ExperimentalRoute {
  /** URL hash to navigate to (without the leading `#/`). May include query
   *  params for sub-tabs, e.g. 'connect?tab=mcp' → `#/connect?tab=mcp`. */
  route: string
  /** Visible text used to confirm the experimental surface rendered. Pick
   *  a string unique to the gated chunk so a missing
   *  `CLEARPATH_E2E_EXPERIMENTAL=1` build fails loudly instead of silently
   *  capturing the fallback page. */
  marker: string
  /** Output filename — written under experimental-features/. */
  screenshot: string
}

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
  // Connect sub-tabs gated behind experimental flags.
  {
    route: 'connect?tab=mcp',
    // McpCatalogGrid renders a "Custom server" tile at the end of the grid.
    marker: 'Custom server',
    screenshot: 'experimental-features/connect--tab-mcp',
  },
  {
    route: 'connect?tab=extensions',
    // ExtensionManager renders an "Install Extension" button at the top.
    marker: 'Install Extension',
    screenshot: 'experimental-features/connect--tab-extensions',
  },
]

const BASELINE_DIR = path.resolve(process.cwd(), 'e2e/screenshots/baseline')

async function preparePage(page: Page): Promise<void> {
  await freezeDynamicContent(page)
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition-property: none !important;
        transition-duration: 0ms !important;
        animation-duration: 0ms !important;
        animation-iteration-count: 1 !important;
        caret-color: transparent !important;
      }
      .animate-pulse, .animate-spin, .animate-bounce, .animate-ping {
        animation: none !important;
      }
    `,
  })
  await page.evaluate(() => {
    const active = document.activeElement
    if (active && active instanceof HTMLElement && active !== document.body) {
      active.blur()
    }
  })
}

async function captureElectronWindow(
  electronApp: import('@playwright/test').ElectronApplication,
  filePath: string,
): Promise<void> {
  const buf = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No BrowserWindow available for capture')
    const img = await win.capturePage()
    return img.toPNG().toString('base64')
  })
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, Buffer.from(buf, 'base64'))
}

function isUpdateMode(): boolean {
  const mode = test.info().config.updateSnapshots
  return mode === 'all' || mode === 'changed'
}

// pixelmatch v7 is ESM-only — `require()` would throw `ERR_REQUIRE_ESM`,
// so we use a dynamic `import()` and cache the resolved function.
type PixelmatchFn = (
  img1: Uint8Array,
  img2: Uint8Array,
  output: Uint8Array | null,
  width: number,
  height: number,
  options?: { threshold?: number },
) => number

let pixelmatchCache: PixelmatchFn | null = null
async function loadPixelmatch(): Promise<PixelmatchFn> {
  if (pixelmatchCache) return pixelmatchCache
  const mod = (await import('pixelmatch')) as unknown as
    | { default: PixelmatchFn }
    | PixelmatchFn
  pixelmatchCache = typeof mod === 'function' ? mod : mod.default
  return pixelmatchCache
}

async function comparePngPixelRatio(
  baselinePath: string,
  actualPath: string,
): Promise<number | null> {
  // pngjs is CJS, so a normal require works.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PNG } = require('pngjs') as typeof import('pngjs')
  const pixelmatch = await loadPixelmatch()
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath))
  const actual = PNG.sync.read(fs.readFileSync(actualPath))
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    return 1
  }
  const diff = new PNG({ width: baseline.width, height: baseline.height })
  const numDiff = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold: 0.2 },
  )
  return numDiff / (baseline.width * baseline.height)
}

async function checkScreenshot(
  page: Page,
  electronApp: import('@playwright/test').ElectronApplication,
  name: string,
): Promise<void> {
  await preparePage(page)
  const baselinePath = path.join(BASELINE_DIR, `${name}.png`)

  if (isUpdateMode()) {
    await captureElectronWindow(electronApp, baselinePath)
    return
  }
  if (!fs.existsSync(baselinePath)) {
    if (process.env.CI) {
      throw new Error(
        `Missing baseline for "${name}" at ${baselinePath}. ` +
        `On CI, baselines must already be committed (or the run must be invoked with -u). ` +
        `Check Git LFS pulled and the baseline exists on the branch.`,
      )
    }
    await captureElectronWindow(electronApp, baselinePath)
    test.info().annotations.push({ type: 'note', description: `Wrote missing baseline: ${name}` })
    return
  }
  const tmpPath = path.join(test.info().outputDir, `${name.replace(/[/\\]/g, '_')}-actual.png`)
  await captureElectronWindow(electronApp, tmpPath)
  const ratio = await comparePngPixelRatio(baselinePath, tmpPath)
  if (ratio === null || ratio <= 0.02) return
  await test.info().attach(`${name}-actual`, { path: tmpPath, contentType: 'image/png' })
  await test.info().attach(`${name}-expected`, { path: baselinePath, contentType: 'image/png' })
  throw new Error(
    `Visual diff for "${name}": ${(ratio * 100).toFixed(2)}% pixels differ ` +
    `(threshold 2.00%). Re-run with -u to accept the change, then commit the ` +
    `updated baseline. Actual: ${tmpPath}; baseline: ${baselinePath}.`,
  )
}

test.describe.configure({ mode: 'serial' })

test.describe('ClearPathAI — Experimental Features Screenshot Crawl', () => {
  test.beforeAll(async ({ electronApp }) => {
    const win = await electronApp.firstWindow()
    await waitForAppReady(win)
  })

  for (const expPage of EXPERIMENTAL_PAGES) {
    test(`captures experimental page: ${expPage.route}`, async ({ page, electronApp }) => {
      await page.evaluate((hash) => {
        window.location.hash = `#/${hash}`
      }, expPage.route)
      await page.waitForTimeout(800)

      // Confirm the experimental page actually rendered (vs landing on a
      // 404/fallback). Missing marker text means the build was NOT produced
      // with CLEARPATH_E2E_EXPERIMENTAL=1 — fail loudly here rather than
      // silently capturing a blank/fallback page.
      await expect(
        page.locator('#root').getByText(expPage.marker, { exact: false }).first(),
        `Expected experimental route "${expPage.route}" to render marker text "${expPage.marker}" before screenshot — build likely missing CLEARPATH_E2E_EXPERIMENTAL=1.`,
      ).toBeVisible({ timeout: ELEMENT_TIMEOUT })

      await checkScreenshot(page, electronApp, expPage.screenshot)
    })
  }
})
