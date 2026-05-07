#!/usr/bin/env node
/**
 * convert-wdio-to-playwright.mjs
 *
 * Best-effort find/replace of common WebdriverIO patterns → Playwright.
 *
 * Usage:
 *   node .claude/skills/e2e-playwright/scripts/convert-wdio-to-playwright.mjs <spec-file>
 *
 * Example:
 *   node .claude/skills/e2e-playwright/scripts/convert-wdio-to-playwright.mjs e2e/smoke.spec.ts
 *
 * Behaviour:
 *   - Writes the converted spec to <spec-file>.playwright.ts (does NOT overwrite
 *     the original).
 *   - Prints a list of patterns that DEFINITELY need manual review.
 *   - Returns non-zero exit code if the file couldn't be processed.
 *
 * After running, you MUST manually review and clean up:
 *   - Multi-arg `browser.execute` → single-arg `page.evaluate`
 *   - `browser.electron.mock(...)` → custom mock helper
 *   - Visual `checkScreen` → `expect(page).toHaveScreenshot`
 *   - XPath that's now redundant (use `getByRole`)
 *   - Helpers signature update (each helper now takes `page` as first arg)
 *
 * See: .claude/skills/e2e-playwright/examples/migrate-spec-from-wdio.md
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node convert-wdio-to-playwright.mjs <spec-file>');
  process.exit(1);
}

const inputPath = path.resolve(args[0]);
if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

let src = fs.readFileSync(inputPath, 'utf8');
const original = src;
const manualReviewItems = new Set();
const noteLine = (s) => manualReviewItems.add(s);

// ── 1. Triple-slash refs — strip ─────────────────────────────────────────────
src = src.replace(/^\/\/\/\s*<reference\s+types="(?:@wdio\/[^"]+|mocha)"\s*\/>\s*\n/gm, '');

// ── 2. Imports — replace WDIO globals with @playwright/test imports ─────────
// If the file doesn't already import test/expect, prepend it after the existing imports.
if (!/from\s+['"]@playwright\/test['"]/.test(src) && !/from\s+['"]\.\/fixtures['"]/.test(src)) {
  // Prepend after the last import line, or at the top
  const importBlockMatch = src.match(/^(?:(?:import\s+[^\n]*?\n)|(?:\/\*[\s\S]*?\*\/\s*\n))+/m);
  const insertAt = importBlockMatch ? importBlockMatch[0].length : 0;
  src =
    src.slice(0, insertAt) +
    `import { test, expect } from './fixtures';\n` +
    src.slice(insertAt);
  noteLine(
    'Added: import { test, expect } from \'./fixtures\'. Adjust path if your fixtures live elsewhere.',
  );
}

// ── 3. Mocha → Playwright Test API ──────────────────────────────────────────
src = src.replace(/\bdescribe\b/g, 'test.describe');
src = src.replace(/\bbefore\(/g, 'test.beforeAll(');
src = src.replace(/\bafter\(/g, 'test.afterAll(');
src = src.replace(/\bbeforeEach\(/g, 'test.beforeEach(');
src = src.replace(/\bafterEach\(/g, 'test.afterEach(');
if (/\btest\.beforeAll\(/.test(src)) {
  noteLine(
    'before(...) was rewritten to test.beforeAll(...). Playwright `beforeAll` does NOT receive `page` by default — if the body now references `page` (e.g. via the helper-rewrite step), either (a) change to test.beforeEach (recommended for per-test setup like waitForAppReady), or (b) accept fixtures: `test.beforeAll(async ({ electronApp }) => { ... })`.',
  );
}

// `it(...)` → `test('title', async ({ page }) => {...})`
// Pattern: it('title', async () => { ... })   → test('title', async ({ page }) => { ... })
src = src.replace(
  /\bit\(\s*(['"`][^'"`\n]+['"`])\s*,\s*async\s*\(\s*\)\s*=>/g,
  'test($1, async ({ page }) =>',
);
// it('title', async function () => ...) — rare
src = src.replace(
  /\bit\(\s*(['"`][^'"`\n]+['"`])\s*,\s*async\s+function\s*\(\s*\)\s*=>/g,
  'test($1, async ({ page }) =>',
);
// it.skip / it.only
src = src.replace(/\bit\.skip\(/g, 'test.skip(');
src = src.replace(/\bit\.only\(/g, 'test.only(');

// ── 4. Selectors — light touch ──────────────────────────────────────────────
// $('...') → page.locator('...')
src = src.replace(/(?<![A-Za-z_$])\$\(\s*(['"`])/g, "page.locator($1");
// $$('...') → page.locator('...')   (caller will need .all() / .first() / etc.)
src = src.replace(/(?<![A-Za-z_$])\$\$\(\s*(['"`])/g, "page.locator($1");
noteLine(
  '$() / $$() converted to page.locator(...) — review for cases where you should use getByRole/getByText/getByLabel instead. Multi-element ops (forEach/length) need explicit .all().',
);

// ── 5. Assertions — best-effort matchers ────────────────────────────────────
// expect(el).toBeDisplayed() → await expect(loc).toBeVisible()
src = src.replace(
  /\bexpect\(([^)]+)\)\.toBeDisplayed\(\)/g,
  'await expect($1).toBeVisible()',
);
// expect(el).toExist() → await expect(loc).toBeAttached()
src = src.replace(/\bexpect\(([^)]+)\)\.toExist\(\)/g, 'await expect($1).toBeAttached()');
// expect(el).toBeClickable() → await expect(loc).toBeEnabled() (best approximation)
src = src.replace(/\bexpect\(([^)]+)\)\.toBeClickable\(\)/g, 'await expect($1).toBeEnabled()');
// expect(el).toBeEnabled() → await expect(loc).toBeEnabled()
src = src.replace(/\bexpect\(([^)]+)\)\.toBeEnabled\(\)/g, 'await expect($1).toBeEnabled()');
// expect(el).toBeDisabled() → await expect(loc).toBeDisabled()
src = src.replace(/\bexpect\(([^)]+)\)\.toBeDisabled\(\)/g, 'await expect($1).toBeDisabled()');
// expect(el).toBeFocused()
src = src.replace(/\bexpect\(([^)]+)\)\.toBeFocused\(\)/g, 'await expect($1).toBeFocused()');
// expect(el).toBeChecked()
src = src.replace(/\bexpect\(([^)]+)\)\.toBeChecked\(\)/g, 'await expect($1).toBeChecked()');
// expect(els).toBeElementsArrayOfSize(N) → await expect(loc).toHaveCount(N)
src = src.replace(
  /\bexpect\(([^)]+)\)\.toBeElementsArrayOfSize\(\s*(\d+)\s*\)/g,
  'await expect($1).toHaveCount($2)',
);
// expect(el).toMatchScreenSnapshot('tag') → await expect(page).toHaveScreenshot('tag.png')
src = src.replace(
  /\bexpect\(([^)]+)\)\.toMatchScreenSnapshot\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  "await expect(page).toHaveScreenshot('$2.png')",
);

// ── 6. Element / locator method renames ─────────────────────────────────────
src = src.replace(/\.setValue\(/g, '.fill(');
src = src.replace(/\.getValue\(\)/g, '.inputValue()');
src = src.replace(/\.getText\(\)/g, '.textContent()');
src = src.replace(/\.getHTML\(\)/g, '.innerHTML()');
src = src.replace(/\.isExisting\(\)/g, '.count().then(n => n > 0)');
src = src.replace(/\.isDisplayed\(\)/g, '.isVisible()');
src = src.replace(/\.doubleClick\(/g, '.dblclick(');
// waitForExist / waitForDisplayed: handle both `.waitForExist()` (no args)
// and `.waitForExist({ timeout: X })` (object literal). The second form
// previously produced invalid `.waitFor({ state: 'attached', { timeout: X })`
// because we'd have an extra `{`. Detect the object literal and merge.
src = src.replace(
  /\.waitForExist\(\s*\{([^{}]*)\}\s*\)/g,
  ".waitFor({ state: 'attached',$1 })",
);
src = src.replace(/\.waitForExist\(\s*\)/g, ".waitFor({ state: 'attached' })");
src = src.replace(
  /\.waitForDisplayed\(\s*\{([^{}]*)\}\s*\)/g,
  ".waitFor({ state: 'visible',$1 })",
);
src = src.replace(/\.waitForDisplayed\(\s*\)/g, ".waitFor({ state: 'visible' })");
src = src.replace(/\.scrollIntoView\(\)/g, '.scrollIntoViewIfNeeded()');
noteLine(
  'Element method renames are best-effort. .waitForExist({ ... }) and .waitForDisplayed({ ... }) options were merged into the new waitFor object — review the merged shape (e.g. options other than `timeout` may need adjustment). .isExisting() became `.count().then(n => n > 0)` — usually better as `expect(loc).toBeAttached()`.',
);

// ── 7. Browser → page ───────────────────────────────────────────────────────
src = src.replace(/\bbrowser\.execute\(/g, 'page.evaluate(');
src = src.replace(/\bbrowser\.executeAsync\(/g, 'page.evaluate(');
src = src.replace(/\bbrowser\.electron\.execute\(/g, 'electronApp.evaluate(');
src = src.replace(/\bbrowser\.url\(/g, 'page.goto(');
src = src.replace(/\bbrowser\.getTitle\(\)/g, 'page.title()');
src = src.replace(/\bbrowser\.getUrl\(\)/g, 'page.url()');
src = src.replace(/\bbrowser\.pause\(/g, 'page.waitForTimeout(');
src = src.replace(/\bbrowser\.waitUntil\(/g, 'page.waitForFunction(');
src = src.replace(
  /\bbrowser\.keys\(\s*\[?\s*(['"`][^'"`\]]+['"`])\s*\]?\s*\)/g,
  'page.keyboard.press($1)',
);
src = src.replace(/\bbrowser\.saveScreenshot\(/g, 'page.screenshot({ path: ');
src = src.replace(
  /\bbrowser\.checkScreen\(\s*(['"`][^'"`]+['"`])/g,
  'await expect(page).toHaveScreenshot($1.png',
);
src = src.replace(/\bbrowser\.debug\(\)/g, 'await page.pause()');

// ── 8. Note manual-review hotspots ──────────────────────────────────────────
if (/browser\.electron\.mock\(/.test(src)) {
  noteLine(
    'browser.electron.mock(...) calls remain — replace with mockElectronApi(electronApp, mod, method) helper from e2e/helpers/electronMock.ts',
  );
}
if (/browser\.electron\./.test(src)) {
  noteLine(
    'Other browser.electron.* calls remain (browser.electron.dialog, browser.electron.app, etc.) — replace with electronApp.evaluate(...) accessing the relevant module.',
  );
}
if (/page\.evaluate\([^)]*?,\s*[^),]+,\s*[^),]+\)/.test(src)) {
  noteLine(
    'Multi-arg page.evaluate detected. Playwright takes a single arg — wrap in tuple: `page.evaluate(([a,b]) => ..., [a, b])`.',
  );
}
if (/this\.timeout\(/.test(src)) {
  noteLine(
    'this.timeout(N) detected (Mocha) — replace with test.setTimeout(N).',
  );
}
if (/\bgetCriticalConsoleErrors\b/.test(src)) {
  noteLine(
    'getCriticalConsoleErrors() — switch to the consoleErrors fixture (auto-collects via page.on(\'console\') / pageerror).',
  );
}
if (/\$\([\s\S]*?'\/\//.test(src)) {
  noteLine(
    'XPath selectors detected — many can be replaced with getByRole/getByText. See examples/selector-strategies.md.',
  );
}

// ── 9. Helper call signatures: each helper now takes page first ─────────────
//    Best-effort — find common helper names without page arg and add it.
const helperNames = [
  'waitForAppReady',
  'navigateSidebarTo',
  'navigateToHash',
  'navigateToConfigureTab',
  'navigateToConnectTab',
  'isConfigureTabSelected',
  'getInputValue',
  'setInputValue',
  'setInputValueLowLevel',
  'invokeIPC',
  'elementWithTextExists',
  'waitForText',
  'buttonExists',
  'clickButton',
  'countElements',
  'waitForSelector',
  'getToggleState',
  'clickToggle',
  'getTextContents',
  'getRootHTML',
  'mainContentIsRendered',
  'freezeDynamicContent',
];
for (const h of helperNames) {
  // helperName(  → helperName(page,   (only if not already followed by page,)
  const re = new RegExp(`\\b${h}\\(\\s*(?!page[,\\)])`, 'g');
  src = src.replace(re, `${h}(page, `);
  // Edge: helperName() — no args (common for waitForAppReady, mainContentIsRendered)
  const reZero = new RegExp(`\\b${h}\\(page,\\s*\\)`, 'g');
  src = src.replace(reZero, `${h}(page)`);
}

// ── 10. Output ──────────────────────────────────────────────────────────────
const outputPath = inputPath.replace(/\.ts$/, '.playwright.ts');
fs.writeFileSync(outputPath, src);

console.log(`\nConverted: ${path.relative(process.cwd(), inputPath)}`);
console.log(`     → ${path.relative(process.cwd(), outputPath)}\n`);

if (src === original) {
  console.log('No automatic changes were applied. The file may already be Playwright code, or it uses patterns the script doesn\'t cover.');
} else {
  console.log('Changes applied. The original file is UNTOUCHED.\n');
}

if (manualReviewItems.size > 0) {
  console.log('Manual review needed:');
  for (const item of manualReviewItems) console.log(`  - ${item}`);
  console.log('');
}

console.log('Next steps:');
console.log('  1. Open the converted file and clean up.');
console.log(
  '  2. Read .claude/skills/e2e-playwright/examples/migrate-spec-from-wdio.md for a worked example.',
);
console.log('  3. Run the test:  npx playwright test ' + path.relative(process.cwd(), outputPath));
console.log('  4. When green, replace the original with the converted file.');
