import { config as baseConfig } from './wdio.conf.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const config = {
  ...baseConfig,
  specs: [path.join(__dirname, 'e2e/extensions-integration.spec.ts')],
  exclude: [],  // no exclusions — we want exactly this spec
}
