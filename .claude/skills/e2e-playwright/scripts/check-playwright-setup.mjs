#!/usr/bin/env node
/**
 * check-playwright-setup.mjs
 *
 * Doctor script — verifies the project is ready to run Playwright Electron tests.
 *
 * Usage:
 *   node .claude/skills/e2e-playwright/scripts/check-playwright-setup.mjs
 *
 * Checks:
 *   1. @playwright/test is installed (devDependency or installed in node_modules)
 *   2. ELECTRON_RUN_AS_NODE is not set in current env
 *   3. out/main/index.js exists (or warns to run npm run build)
 *   4. playwright.config.ts exists (or warns)
 *   5. e2e/fixtures.ts exists (or warns)
 *   6. tsconfig.playwright.json exists (or warns — optional)
 *   7. e2e/screenshots/baseline directory exists (creates if missing)
 *   8. .gitattributes has Git LFS for screenshots (warns if missing)
 *   9. xvfb-run available (Linux only — warns if missing)
 *  10. node version is >= 22 (>= 18 is warned but still allowed)
 *
 * Exits 0 if all GREEN/YELLOW; non-zero if any RED checks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let errors = 0;
let warnings = 0;

function check(label, status, msg) {
  const color = status === 'red' ? RED : status === 'yellow' ? YELLOW : GREEN;
  const icon = status === 'red' ? '✗' : status === 'yellow' ? '⚠' : '✓';
  console.log(`${color}${icon}${RESET}  ${label}${msg ? ' — ' + msg : ''}`);
  if (status === 'red') errors++;
  else if (status === 'yellow') warnings++;
}

console.log('\nPlaywright + Electron setup doctor\n');

// 1. @playwright/test installed
{
  const pkgJsonPath = path.join(ROOT, 'package.json');
  let pwInstalled = false;
  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    pwInstalled = !!(
      pkg.devDependencies?.['@playwright/test'] ||
      pkg.dependencies?.['@playwright/test']
    );
  }
  const moduleExists = fs.existsSync(path.join(ROOT, 'node_modules/@playwright/test/package.json'));
  if (pwInstalled && moduleExists) {
    let version = 'unknown';
    try {
      version = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'node_modules/@playwright/test/package.json'), 'utf8'),
      ).version;
    } catch {}
    check('@playwright/test installed', 'green', version);
  } else if (pwInstalled) {
    check(
      '@playwright/test in package.json but not installed',
      'red',
      'Run: npm install',
    );
  } else {
    check(
      '@playwright/test missing',
      'red',
      'Run: npm install --save-dev @playwright/test',
    );
  }
}

// 2. ELECTRON_RUN_AS_NODE not set
if ('ELECTRON_RUN_AS_NODE' in process.env && process.env.ELECTRON_RUN_AS_NODE) {
  check(
    'ELECTRON_RUN_AS_NODE is set to ' + process.env.ELECTRON_RUN_AS_NODE,
    'red',
    'unset before launching tests; the fixture also strips it',
  );
} else {
  check('ELECTRON_RUN_AS_NODE not set', 'green');
}

// 3. out/main/index.js exists
const APP_ENTRY = path.join(ROOT, 'out/main/index.js');
if (fs.existsSync(APP_ENTRY)) {
  check('out/main/index.js exists', 'green');
} else {
  check(
    'out/main/index.js missing',
    'yellow',
    'Run: npm run build (required before running e2e)',
  );
}

// 4. playwright.config.ts exists
{
  const candidates = [
    'playwright.config.ts',
    'playwright.config.js',
    'playwright.config.mjs',
    'playwright.config.cjs',
  ];
  const found = candidates.find((c) => fs.existsSync(path.join(ROOT, c)));
  if (found) {
    check(`Playwright config: ${found}`, 'green');
  } else {
    check(
      'No playwright.config.ts found',
      'yellow',
      'See .claude/skills/e2e-playwright/examples/playwright-config-example.md',
    );
  }
}

// 5. e2e/fixtures.ts exists
{
  const fp = path.join(ROOT, 'e2e/fixtures.ts');
  if (fs.existsSync(fp)) {
    check('e2e/fixtures.ts exists', 'green');
  } else {
    check(
      'e2e/fixtures.ts missing',
      'yellow',
      'See .claude/skills/e2e-playwright/examples/electron-fixtures.md',
    );
  }
}

// 6. tsconfig.playwright.json (optional but recommended)
{
  const fp = path.join(ROOT, 'tsconfig.playwright.json');
  if (fs.existsSync(fp)) {
    check('tsconfig.playwright.json exists', 'green');
  } else {
    check(
      'tsconfig.playwright.json missing (optional)',
      'yellow',
      'recommended for typed e2e — see references/typescript-setup.md',
    );
  }
}

// 7. screenshots baseline dir
{
  const dir = path.join(ROOT, 'e2e/screenshots/baseline');
  if (fs.existsSync(dir)) {
    check('e2e/screenshots/baseline exists', 'green');
  } else {
    fs.mkdirSync(dir, { recursive: true });
    check(
      'e2e/screenshots/baseline created',
      'yellow',
      'add to git (use Git LFS for large baselines)',
    );
  }
}

// 8. Git LFS for baselines
{
  const gattr = path.join(ROOT, '.gitattributes');
  if (fs.existsSync(gattr)) {
    const content = fs.readFileSync(gattr, 'utf8');
    if (/screenshots\/.+\.png filter=lfs/.test(content)) {
      check('Git LFS configured for screenshots', 'green');
    } else {
      check(
        '.gitattributes missing LFS rule',
        'yellow',
        "Run: git lfs track 'e2e/screenshots/**/*.png'",
      );
    }
  } else {
    check(
      'No .gitattributes',
      'yellow',
      "Run: git lfs install && git lfs track 'e2e/screenshots/**/*.png'",
    );
  }
}

// 9. Linux: xvfb-run available
if (process.platform === 'linux') {
  try {
    execSync('which xvfb-run', { stdio: 'ignore' });
    check('xvfb-run available', 'green');
  } catch {
    check(
      'xvfb-run missing',
      'red',
      'sudo apt-get install -y xvfb (or use the Playwright Docker image)',
    );
  }
} else {
  check('xvfb-run check skipped (not Linux)', 'green');
}

// 10. Node version
{
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 22) {
    check(`Node ${process.versions.node}`, 'green');
  } else if (nodeMajor >= 18) {
    check(`Node ${process.versions.node}`, 'yellow', 'project recommends Node 22+');
  } else {
    check(`Node ${process.versions.node}`, 'red', 'upgrade to Node 22+');
  }
}

console.log(
  `\nResult: ${errors === 0 ? GREEN + 'OK' + RESET : RED + errors + ' error(s)' + RESET}` +
    (warnings > 0 ? `, ${YELLOW}${warnings} warning(s)${RESET}` : '') +
    '\n',
);

process.exit(errors > 0 ? 1 : 0);
