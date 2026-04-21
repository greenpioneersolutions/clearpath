#!/usr/bin/env node
'use strict'

/**
 * scripts/build-sdk-for-testing.js
 *
 * Builds the SDK package from source, packs it into a tarball that matches
 * exactly what `npm publish` would put on the registry, installs that tarball
 * into the example extension (the same way a consumer's `npm install` would),
 * bundles in dist mode (no local source alias), and packages to a .clear.ext
 * file at the project root — ready for the extension e2e tests.
 *
 * This ensures the e2e suite exercises the identical bundle consumers ship.
 *
 * Steps:
 *   1. Build SDK TypeScript   → extension-sdk/dist/
 *   2. Pack SDK               → extension-sdk/clearpath-extension-sdk-*.tgz
 *   3. Install example deps   → example/node_modules/
 *   4. Install SDK from pack  → example/node_modules/@clearpath/extension-sdk/
 *   5. Bundle (dist mode)     → example/dist/main.cjs + dist/renderer.js
 *   6. Package extension      → <project-root>/com.clearpathai.sdk-example-v*.clear.ext
 *
 * Usage (from project root):
 *   node scripts/build-sdk-for-testing.js
 *
 * Called automatically by:
 *   npm run pretest:e2e:extensions   (which is run by npm run e2e:extensions)
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// ── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..')
const SDK_DIR = path.join(PROJECT_ROOT, 'extension-sdk')
const EXAMPLE_DIR = path.join(SDK_DIR, 'example', 'com.clearpathai.sdk-example')
const PACKAGE_SCRIPT = path.join(SDK_DIR, 'scripts', 'package-extension.js')

// ── Helpers ──────────────────────────────────────────────────────────────────

let stepCount = 0

function step(label) {
  stepCount++
  console.log(`\n[${stepCount}/6] ${label}`)
}

function run(cmd, cwd) {
  console.log(`  $ ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function abort(msg) {
  console.error(`\nERROR: ${msg}`)
  process.exit(1)
}

// ── Validate environment ─────────────────────────────────────────────────────

if (!fs.existsSync(SDK_DIR)) abort('extension-sdk/ directory not found')
if (!fs.existsSync(EXAMPLE_DIR)) abort(`Example extension not found: ${EXAMPLE_DIR}`)
if (!fs.existsSync(PACKAGE_SCRIPT)) abort(`Package script not found: ${PACKAGE_SCRIPT}`)

console.log('Building SDK and packaging example extension for e2e testing...')
console.log(`  SDK:     ${SDK_DIR}`)
console.log(`  Example: ${EXAMPLE_DIR}`)
console.log(`  Output:  ${PROJECT_ROOT}`)

// ── Step 1: Build SDK TypeScript ─────────────────────────────────────────────

step('Build SDK TypeScript → extension-sdk/dist/')
run('npm run build', SDK_DIR)

// Verify output exists
const sdkDist = path.join(SDK_DIR, 'dist', 'index.js')
if (!fs.existsSync(sdkDist)) abort(`SDK build failed — ${sdkDist} not found`)
console.log('  dist/index.js produced')

// ── Step 2: Pack SDK into a registry-equivalent tarball ──────────────────────

step('Pack SDK (npm pack) — produces registry-equivalent tarball')

// npm pack --json writes a JSON array to stdout with pack metadata.
// This is exactly what would be uploaded to the npm registry.
let tarballName
try {
  const packOutput = execSync('npm pack --json', {
    cwd: SDK_DIR,
    encoding: 'utf-8',
    // stderr (npm notices) goes to terminal; we only need stdout
    stdio: ['inherit', 'pipe', 'inherit'],
  }).trim()
  const packResult = JSON.parse(packOutput)
  tarballName = packResult[0].filename
} catch (err) {
  abort(`npm pack failed: ${err.message}`)
}

const tarballPath = path.join(SDK_DIR, tarballName)
if (!fs.existsSync(tarballPath)) abort(`Tarball not found after pack: ${tarballPath}`)
console.log(`  Packed: ${tarballName} (${(fs.statSync(tarballPath).size / 1024).toFixed(1)} KB)`)

// ── Step 3: Install example extension devDependencies ────────────────────────

step('Install example extension devDependencies')
run('npm install --legacy-peer-deps', EXAMPLE_DIR)

// ── Step 4: Install SDK from tarball into example/node_modules/ ──────────────

step('Install SDK from tarball into example (mirrors consumer npm install)')

const sdkNodeModulesDir = path.join(EXAMPLE_DIR, 'node_modules', '@clearpath', 'extension-sdk')

// Clear any previously installed version so the tarball is always used fresh.
// npm install --no-save <tarball> can be a no-op when the lockfile already has
// a record for this package; direct extraction is more reliable.
if (fs.existsSync(sdkNodeModulesDir)) {
  fs.rmSync(sdkNodeModulesDir, { recursive: true, force: true })
  console.log('  Cleared previous install of @clearpath/extension-sdk')
}
fs.mkdirSync(sdkNodeModulesDir, { recursive: true })

// npm tarballs prefix every file with 'package/' — strip that prefix on extraction.
// tar is available on macOS, Linux, and Windows 10+.
execSync(
  `tar -xzf "${tarballPath}" --strip-components=1 -C "${sdkNodeModulesDir}"`,
  { stdio: 'inherit' }
)

// Verify the SDK dist landed correctly
const installedIndex = path.join(sdkNodeModulesDir, 'dist', 'index.js')
if (!fs.existsSync(installedIndex)) {
  abort(`SDK not installed correctly — dist/index.js not found in node_modules`)
}
console.log('  @clearpath/extension-sdk installed from tarball')

// Clean up the tarball (no longer needed)
fs.unlinkSync(tarballPath)
console.log(`  Cleaned up tarball: ${tarballName}`)

// ── Step 5: Bundle in dist mode (no local SDK source alias) ──────────────────

step('Bundle example extension (dist mode — SDK from node_modules, no source alias)')
run('node build.mjs --dist', EXAMPLE_DIR)

const mainCjs = path.join(EXAMPLE_DIR, 'dist', 'main.cjs')
const rendererJs = path.join(EXAMPLE_DIR, 'dist', 'renderer.js')
if (!fs.existsSync(mainCjs)) abort(`Bundle failed — dist/main.cjs not found`)
if (!fs.existsSync(rendererJs)) abort(`Bundle failed — dist/renderer.js not found`)
console.log(`  dist/main.cjs    (${(fs.statSync(mainCjs).size / 1024).toFixed(1)} KB)`)
console.log(`  dist/renderer.js (${(fs.statSync(rendererJs).size / 1024).toFixed(1)} KB)`)

// ── Step 6: Package into .clear.ext at project root ──────────────────────────

step('Package extension → .clear.ext at project root')
run(`node "${PACKAGE_SCRIPT}" "${EXAMPLE_DIR}" --output "${PROJECT_ROOT}"`, PROJECT_ROOT)

// Confirm the output file exists
const manifest = JSON.parse(fs.readFileSync(path.join(EXAMPLE_DIR, 'clearpath-extension.json'), 'utf-8'))
const outputFile = path.join(PROJECT_ROOT, `${manifest.id}-v${manifest.version}.clear.ext`)
if (!fs.existsSync(outputFile)) abort(`Package step produced no output file: ${outputFile}`)

console.log('\nDone. Extension packaged and ready for e2e testing.')
console.log(`  ${outputFile}`)
