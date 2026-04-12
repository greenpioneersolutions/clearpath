import type { Options } from '@wdio/types'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const config: Options.Testrunner = {
  runner: 'local',
  specs: ['./e2e/**/*.spec.ts'],
  exclude: [],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        // Point at the built electron-vite main bundle (unpackaged app).
        // Must run `npm run build` before e2e tests.
        appEntryPoint: path.join(__dirname, 'out/main/index.js'),
        appArgs: [],
      },
    },
  ],

  logLevel: 'info',
  bail: 0,
  baseUrl: 'http://localhost',
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: ['electron'],
  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
}
