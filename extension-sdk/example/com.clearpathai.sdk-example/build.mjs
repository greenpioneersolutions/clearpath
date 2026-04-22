/**
 * esbuild bundle script for the SDK Example extension.
 *
 * Produces two outputs:
 *   dist/main.cjs   — Main process entry (CommonJS, Node platform)
 *   dist/renderer.js — Renderer entry (IIFE, browser platform)
 *
 * Usage:
 *   node build.mjs           # one-shot build
 *   node build.mjs --watch   # watch mode for development
 *   node build.mjs --dist    # build for distribution (no local SDK alias)
 *
 * When running inside the extension-sdk monorepo, the SDK is resolved from
 * the local source at ../../src/index.ts. When --dist is passed (or the local
 * source doesn't exist), normal node_modules resolution is used instead.
 */
import * as esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isWatch = process.argv.includes('--watch')
const isDist = process.argv.includes('--dist')

// Resolve the local SDK source — only alias if it exists and --dist wasn't passed
const localSDKEntry = path.resolve(__dirname, '../../src/index.ts')
const useLocalSDK = !isDist && fs.existsSync(localSDKEntry)
const sdkAlias = useLocalSDK
  ? { '@clearpath/extension-sdk': localSDKEntry }
  : {}

if (useLocalSDK) {
  console.log('[build] Using local SDK source:', localSDKEntry)
} else {
  console.log('[build] Using @clearpath/extension-sdk from node_modules')
}

/** @type {esbuild.BuildOptions} */
const mainConfig = {
  entryPoints: [path.join(__dirname, 'src/main.ts')],
  outfile: path.join(__dirname, 'dist/main.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['@clearpath/extension-sdk', 'electron'],
  sourcemap: false,
  alias: sdkAlias,
}

/** @type {esbuild.BuildOptions} */
const rendererConfig = {
  entryPoints: [path.join(__dirname, 'src/renderer.tsx')],
  outfile: path.join(__dirname, 'dist/renderer.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  // React is bundled directly into the IIFE — the host iframe srcdoc does NOT
  // inject window.React/window.ReactDOM as globals, so marking React external
  // causes esbuild to emit __require("react") calls that fail in the browser.
  jsx: 'automatic',
  sourcemap: false,
  alias: sdkAlias,
  // In --dist mode, use tsconfig.dist.json so the tsconfig "paths" aliases
  // (which point @clearpath/extension-sdk to ../../src/index.ts) are cleared.
  // Without this, esbuild reads tsconfig.json's paths and resolves the SDK
  // from the local TypeScript source even when sdkAlias is empty, pulling in
  // the project root's React instead of the example's own React — causing a
  // duplicate React instance that makes ReactCurrentDispatcher.current null
  // and breaks all hooks (useContext, useState, etc.) inside the iframe.
  ...(isDist ? { tsconfig: path.join(__dirname, 'tsconfig.dist.json') } : {}),
}

async function build() {
  if (isWatch) {
    const mainCtx = await esbuild.context(mainConfig)
    const rendererCtx = await esbuild.context(rendererConfig)
    await Promise.all([mainCtx.watch(), rendererCtx.watch()])
    console.log('[build] Watching for changes...')
  } else {
    await Promise.all([esbuild.build(mainConfig), esbuild.build(rendererConfig)])
    console.log('[build] Done — dist/main.cjs + dist/renderer.js')
  }
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
