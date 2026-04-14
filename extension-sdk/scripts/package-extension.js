#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const archiver = require('archiver')

// ---------- constants ----------
const MANIFEST_FILE = 'clearpath-extension.json'
const EXCLUDE_PATTERNS = ['node_modules/', '.git/', 'package-lock.json']

// ---------- helpers ----------
function printUsage() {
  console.log(`
Usage: package-extension <extension-dir> [--output <dir>]

Arguments:
  extension-dir   Path to the extension directory containing ${MANIFEST_FILE}

Options:
  --output, -o    Output directory for the zip file (default: current working directory)
  --help, -h      Show this help message

Examples:
  node scripts/package-extension.js ../extensions/com.clearpathai.sdk-example
  node scripts/package-extension.js ../extensions/com.clearpathai.sdk-example --output ./dist/
`)
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function fatal(message) {
  console.error(`\nError: ${message}`)
  process.exit(1)
}

// ---------- parse arguments ----------
const args = process.argv.slice(2)

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printUsage()
  process.exit(args.length === 0 ? 1 : 0)
}

let extensionDirArg = null
let outputDir = process.cwd()

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' || args[i] === '-o') {
    i++
    if (!args[i]) fatal('--output requires a directory argument')
    outputDir = path.resolve(args[i])
  } else if (args[i].startsWith('-')) {
    fatal(`Unknown flag: ${args[i]}`)
  } else if (!extensionDirArg) {
    extensionDirArg = args[i]
  } else {
    fatal(`Unexpected argument: ${args[i]}`)
  }
}

if (!extensionDirArg) {
  fatal('Extension directory argument is required')
}

const extensionDir = path.resolve(extensionDirArg)

// ---------- validate extension directory ----------
if (!fs.existsSync(extensionDir)) {
  fatal(`Extension directory not found: ${extensionDir}`)
}

const stat = fs.statSync(extensionDir)
if (!stat.isDirectory()) {
  fatal(`Not a directory: ${extensionDir}`)
}

// ---------- validate manifest ----------
const manifestPath = path.join(extensionDir, MANIFEST_FILE)
if (!fs.existsSync(manifestPath)) {
  fatal(`Manifest not found: ${manifestPath}\nEnsure the extension directory contains a ${MANIFEST_FILE} file.`)
}

let manifest
try {
  const raw = fs.readFileSync(manifestPath, 'utf-8')
  manifest = JSON.parse(raw)
} catch (err) {
  fatal(`Failed to parse ${MANIFEST_FILE}: ${err.message}`)
}

if (!manifest.id || typeof manifest.id !== 'string') {
  fatal(`Manifest is missing a valid "id" field`)
}
if (!manifest.version || typeof manifest.version !== 'string') {
  fatal(`Manifest is missing a valid "version" field`)
}

// ---------- ensure output directory exists ----------
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
  console.log(`Created output directory: ${outputDir}`)
}

// ---------- build zip ----------
const zipName = `${manifest.id}-v${manifest.version}.zip`
const zipPath = path.join(outputDir, zipName)

console.log(`\nPackaging extension:`)
console.log(`  Name:      ${manifest.name || manifest.id}`)
console.log(`  ID:        ${manifest.id}`)
console.log(`  Version:   ${manifest.version}`)
console.log(`  Source:    ${extensionDir}`)
console.log(`  Output:    ${zipPath}`)
console.log(`  Excluding: ${EXCLUDE_PATTERNS.join(', ')}`)
console.log()

const output = fs.createWriteStream(zipPath)
const archive = archiver('zip', { zlib: { level: 9 } })

let fileCount = 0

output.on('close', () => {
  console.log(`\nDone!`)
  console.log(`  Files:  ${fileCount}`)
  console.log(`  Size:   ${formatBytes(archive.pointer())}`)
  console.log(`  Output: ${zipPath}`)
  process.exit(0)
})

archive.on('entry', () => {
  fileCount++
})

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn(`Warning: ${err.message}`)
  } else {
    fatal(`Archive warning: ${err.message}`)
  }
})

archive.on('error', (err) => {
  fatal(`Archive error: ${err.message}`)
})

archive.pipe(output)

// Add files from the extension directory at the root of the zip,
// excluding development artifacts.
archive.directory(extensionDir, false, (entry) => {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.endsWith('/')) {
      // Directory pattern: exclude if path starts with it or contains it as a segment
      const dirName = pattern.slice(0, -1)
      if (entry.name === dirName || entry.name.startsWith(pattern) || entry.name.includes('/' + pattern)) {
        return false
      }
    } else {
      // File pattern: exact basename match
      if (entry.name === pattern || entry.name.endsWith('/' + pattern)) {
        return false
      }
    }
  }
  return entry
})

archive.finalize()
