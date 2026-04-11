import type { IpcMain } from 'electron'
import https from 'node:https'
import Store from 'electron-store'
import { storeSecret, retrieveSecret, deleteSecret } from '../utils/credentialStore'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'

// ── Types ───────────────────────────────────────────────────────────────────

interface SplunkStoreData {
  hostUrl: string
  username: string
  authMethod: 'token' | 'basic'
  serverVersion: string
  connected: boolean
  connectedAt: number
  allowSelfSignedCerts: boolean
}

interface IntegrationStoreSchema {
  splunk: SplunkStoreData | null
}

interface ConnectArgs {
  hostUrl: string
  authMethod: 'token' | 'basic'
  token?: string
  username?: string
  password?: string
  allowSelfSignedCerts?: boolean
}

interface SearchArgs {
  query: string
  earliest?: string
  latest?: string
}

interface SearchJobArgs {
  query: string
  earliest?: string
  latest?: string
}

interface JobStatusArgs {
  sid: string
}

interface JobResultsArgs {
  sid: string
  count?: number
  offset?: number
}

interface SplunkServerInfo {
  serverName: string
  version: string
  build: string
  os: string
  cpu_arch: string
}

interface SplunkSearchResult {
  results: Record<string, unknown>[]
  fields?: Array<{ name: string; type?: string }>
  preview?: boolean
}

interface SplunkJobStatus {
  sid: string
  dispatchState: string
  doneProgress: number
  scanCount: number
  eventCount: number
  resultCount: number
  runDuration: number
}

interface SplunkSavedSearch {
  name: string
  search: string
  description: string
  isScheduled: boolean
  nextScheduledTime: string
  cronSchedule: string
  disabled: boolean
}

interface SplunkIndex {
  name: string
  currentDBSizeMB: number
  totalEventCount: number
  maxTotalDataSizeMB: number
  minTime: string
  maxTime: string
  disabled: boolean
}

interface SplunkAlert {
  name: string
  severity: string
  triggeredAlertCount: number
  triggerTime: string
  savedSearchName: string
}

interface SplunkDashboard {
  name: string
  label: string
  description: string
  app: string
  owner: string
  isDashboard: boolean
  isVisible: boolean
}

// ── Store ───────────────────────────────────────────────────────────────────

const store = new Store<IntegrationStoreSchema>({
  name: 'clear-path-integrations',
  defaults: { splunk: null },
  encryptionKey: getStoreEncryptionKey(),
})

// ── Splunk Client ───────────────────────────────────────────────────────────

class SplunkClient {
  private hostUrl: string
  private authMethod: 'token' | 'basic'
  private username: string
  private allowSelfSignedCerts: boolean
  private httpsAgent: https.Agent | undefined

  constructor(
    hostUrl: string,
    authMethod: 'token' | 'basic',
    username: string,
    allowSelfSignedCerts: boolean,
  ) {
    this.hostUrl = hostUrl
    this.authMethod = authMethod
    this.username = username
    this.allowSelfSignedCerts = allowSelfSignedCerts

    if (allowSelfSignedCerts) {
      this.httpsAgent = new https.Agent({ rejectUnauthorized: false })
    }
  }

  /** Normalize a Splunk host URL. */
  static normalizeUrl(input: string): string {
    let url = input.trim()
    // Strip trailing slash
    url = url.replace(/\/+$/, '')
    // Ensure https:// if no protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`
    }
    // Append default management port if none specified
    const parsed = new URL(url)
    if (!parsed.port) {
      parsed.port = '8089'
      url = parsed.toString().replace(/\/+$/, '')
    }
    return url
  }

  /** Build authorization header from stored credentials. */
  private getAuthHeader(): string {
    if (this.authMethod === 'token') {
      const token = retrieveSecret('splunk-token')
      if (!token) throw new Error('No Splunk auth token found. Please reconnect.')
      return `Splunk ${token}`
    }
    // Basic auth — use stored session key if available, otherwise fall back to user/pass
    const sessionKey = retrieveSecret('splunk-token')
    if (sessionKey) {
      return `Splunk ${sessionKey}`
    }
    const password = retrieveSecret('splunk-password')
    if (!password) throw new Error('No Splunk credentials found. Please reconnect.')
    const encoded = Buffer.from(`${this.username}:${password}`).toString('base64')
    return `Basic ${encoded}`
  }

  /** Build fetch options including the TLS agent for self-signed certs. */
  private buildFetchOptions(options: RequestInit = {}): RequestInit {
    const fetchOpts: RequestInit & { dispatcher?: unknown } = { ...options }
    // Node.js fetch supports the `dispatcher` option via undici;
    // for compatibility we also set the agent via a custom property
    // that node-fetch and Electron's net module understand.
    if (this.httpsAgent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fetchOpts as any).agent = this.httpsAgent
    }
    return fetchOpts
  }

  /** Make an authenticated request to the Splunk REST API. */
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    // Always request JSON output
    const separator = path.includes('?') ? '&' : '?'
    const url = `${this.hostUrl}${path}${separator}output_mode=json`

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': this.getAuthHeader(),
      ...(options.headers as Record<string, string> ?? {}),
    }

    log.debug('[splunk] %s %s', options.method ?? 'GET', path)

    let response: Response
    try {
      response = await fetch(url, { ...this.buildFetchOptions(options), headers })
    } catch (err) {
      log.error('[splunk] Network error on %s — %s', path, err)
      throw new Error(`Failed to connect to Splunk at ${this.hostUrl}. Check your network and host URL.`)
    }

    // Handle 401 — attempt re-authentication for basic auth
    if (response.status === 401 && this.authMethod === 'basic') {
      log.info('[splunk] 401 on %s — attempting re-authentication', path)
      const refreshed = await this.refreshSessionKey()
      if (refreshed) {
        headers['Authorization'] = this.getAuthHeader()
        try {
          response = await fetch(url, { ...this.buildFetchOptions(options), headers })
        } catch (err) {
          throw new Error(`Failed to connect to Splunk after re-authentication: ${err}`)
        }
      } else {
        log.error('[splunk] Re-authentication failed — marking as disconnected')
        store.set('splunk', null)
        throw new Error('Splunk session expired and re-authentication failed. Please reconnect.')
      }
    }

    if (response.status === 401) {
      throw new Error('Authentication failed. Your Splunk token may have expired. Please reconnect.')
    }
    if (response.status === 403) {
      throw new Error('Permission denied. Your Splunk account may lack the required access.')
    }
    if (response.status === 429) {
      throw new Error('Rate limited by Splunk. Please wait and try again.')
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Splunk API error (${response.status}): ${body.slice(0, 500)}`)
    }

    return response
  }

  /** Authenticate with username/password to obtain a session key. */
  async authenticate(username: string, password: string): Promise<string> {
    const url = `${this.hostUrl}/services/auth/login?output_mode=json`
    const body = new URLSearchParams({ username, password })

    log.debug('[splunk] Authenticating as %s', username)

    let response: Response
    try {
      response = await fetch(url, {
        ...this.buildFetchOptions(),
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
      })
    } catch (err) {
      log.error('[splunk] Auth network error — %s', err)
      throw new Error(`Failed to connect to Splunk at ${this.hostUrl}. Check your network and host URL.`)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Splunk authentication failed (${response.status}): ${text.slice(0, 300)}`)
    }

    const data = (await response.json()) as { sessionKey?: string }
    if (!data.sessionKey) {
      throw new Error('Splunk authentication succeeded but no session key was returned.')
    }

    return data.sessionKey
  }

  /** Re-authenticate using stored username/password to refresh the session key. */
  private async refreshSessionKey(): Promise<boolean> {
    const password = retrieveSecret('splunk-password')
    if (!password || !this.username) {
      log.warn('[splunk] Cannot refresh session key — missing username or password')
      return false
    }

    try {
      const sessionKey = await this.authenticate(this.username, password)
      storeSecret('splunk-token', sessionKey)
      log.info('[splunk] Session key refreshed successfully')
      return true
    } catch (err) {
      log.error('[splunk] Session key refresh failed — %s', err)
      return false
    }
  }

  /** Fetch server info for connection validation. */
  async getServerInfo(): Promise<SplunkServerInfo> {
    const response = await this.request('/services/server/info')
    const data = (await response.json()) as {
      entry?: Array<{ content?: Record<string, unknown> }>
    }

    const content = data.entry?.[0]?.content ?? {}
    return {
      serverName: (content.serverName as string) ?? '',
      version: (content.version as string) ?? '',
      build: (content.build as string) ?? '',
      os: (content.os_name as string) ?? '',
      cpu_arch: (content.cpu_arch as string) ?? '',
    }
  }
}

// ── Cached client ───────────────────────────────────────────────────────────

let client: SplunkClient | null = null

function getClient(): SplunkClient {
  if (client) return client

  const sp = store.get('splunk')
  if (!sp?.connected) {
    throw new Error('Splunk is not connected. Please connect via Configure > Integrations.')
  }

  client = new SplunkClient(sp.hostUrl, sp.authMethod, sp.username, sp.allowSelfSignedCerts)
  return client
}

// ── Result mapping helpers ──────────────────────────────────────────────────

function mapSavedSearch(entry: Record<string, unknown>): SplunkSavedSearch {
  const content = (entry.content ?? {}) as Record<string, unknown>
  return {
    name: (entry.name as string) ?? '',
    search: (content.search as string) ?? '',
    description: (content.description as string) ?? '',
    isScheduled: (content.is_scheduled as string) === '1',
    nextScheduledTime: (content.next_scheduled_time as string) ?? '',
    cronSchedule: (content.cron_schedule as string) ?? '',
    disabled: (content.disabled as string) === '1',
  }
}

function mapIndex(entry: Record<string, unknown>): SplunkIndex {
  const content = (entry.content ?? {}) as Record<string, unknown>
  return {
    name: (entry.name as string) ?? '',
    currentDBSizeMB: Number(content.currentDBSizeMB ?? 0),
    totalEventCount: Number(content.totalEventCount ?? 0),
    maxTotalDataSizeMB: Number(content.maxTotalDataSizeMB ?? 0),
    minTime: (content.minTime as string) ?? '',
    maxTime: (content.maxTime as string) ?? '',
    disabled: (content.disabled as boolean) ?? false,
  }
}

function mapAlert(entry: Record<string, unknown>): SplunkAlert {
  const content = (entry.content ?? {}) as Record<string, unknown>
  return {
    name: (entry.name as string) ?? '',
    severity: (content.severity as string) ?? '',
    triggeredAlertCount: Number(content.triggered_alert_count ?? 0),
    triggerTime: (content.trigger_time as string) ?? '',
    savedSearchName: (content.savedsearch_name as string) ?? '',
  }
}

function mapDashboard(entry: Record<string, unknown>): SplunkDashboard {
  const content = (entry.content ?? {}) as Record<string, unknown>
  return {
    name: (entry.name as string) ?? '',
    label: (content.label as string) ?? (entry.name as string) ?? '',
    description: (content.description as string) ?? '',
    app: (content['eai:acl'] as Record<string, unknown>)?.app as string ?? '',
    owner: (content['eai:acl'] as Record<string, unknown>)?.owner as string ?? '',
    isDashboard: (content.isDashboard as string) !== '0',
    isVisible: (content.isVisible as string) !== '0',
  }
}

function mapJobStatus(entry: Record<string, unknown>): SplunkJobStatus {
  const content = (entry.content ?? {}) as Record<string, unknown>
  return {
    sid: (entry.sid as string) ?? (content.sid as string) ?? '',
    dispatchState: (content.dispatchState as string) ?? '',
    doneProgress: Number(content.doneProgress ?? 0),
    scanCount: Number(content.scanCount ?? 0),
    eventCount: Number(content.eventCount ?? 0),
    resultCount: Number(content.resultCount ?? 0),
    runDuration: Number(content.runDuration ?? 0),
  }
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerSplunkHandlers(ipcMain: IpcMain): void {

  // ── Connect ─────────────────────────────────────────────────────────────

  ipcMain.handle('integration:splunk-connect', async (_e, args: ConnectArgs) => {
    log.info('[splunk] connect: hostUrl=%s authMethod=%s', args.hostUrl, args.authMethod)
    try {
      const hostUrl = SplunkClient.normalizeUrl(args.hostUrl)
      const allowSelfSignedCerts = args.allowSelfSignedCerts ?? false
      const username = args.username ?? ''

      const tempClient = new SplunkClient(hostUrl, args.authMethod, username, allowSelfSignedCerts)

      // Authenticate based on method
      if (args.authMethod === 'basic') {
        if (!args.username || !args.password) {
          return { success: false, error: 'Username and password are required for basic auth.' }
        }
        // Authenticate to get session key
        const sessionKey = await tempClient.authenticate(args.username, args.password)
        storeSecret('splunk-token', sessionKey)
        storeSecret('splunk-password', args.password)
      } else {
        if (!args.token) {
          return { success: false, error: 'Auth token is required for token authentication.' }
        }
        storeSecret('splunk-token', args.token)
      }

      // Validate connection by fetching server info
      let serverInfo: SplunkServerInfo
      try {
        serverInfo = await tempClient.getServerInfo()
      } catch (err) {
        // Clean up credentials on validation failure
        deleteSecret('splunk-token')
        if (args.authMethod === 'basic') deleteSecret('splunk-password')
        log.error('[splunk] connect: Server info validation failed —', err)
        return { success: false, error: `Failed to validate Splunk connection: ${err}` }
      }

      log.info('[splunk] connect: Server=%s version=%s build=%s',
        serverInfo.serverName, serverInfo.version, serverInfo.build)

      // Persist metadata
      store.set('splunk', {
        hostUrl,
        username,
        authMethod: args.authMethod,
        serverVersion: serverInfo.version,
        connected: true,
        connectedAt: Date.now(),
        allowSelfSignedCerts,
      })

      // Cache client
      client = tempClient

      return { success: true, serverInfo }
    } catch (err) {
      log.error('[splunk] connect: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Disconnect ──────────────────────────────────────────────────────────

  ipcMain.handle('integration:splunk-disconnect', () => {
    log.info('[splunk] disconnect: Clearing credentials and metadata')
    deleteSecret('splunk-token')
    deleteSecret('splunk-password')
    store.set('splunk', null)
    client = null
    return { success: true }
  })

  // ── Search (oneshot) ────────────────────────────────────────────────────

  ipcMain.handle('integration:splunk-search', async (_e, args: SearchArgs) => {
    log.info('[splunk] search: query=%s earliest=%s latest=%s',
      args.query.slice(0, 100), args.earliest ?? 'default', args.latest ?? 'default')
    try {
      const c = getClient()
      const body = new URLSearchParams({ search: args.query })
      if (args.earliest) body.set('earliest_time', args.earliest)
      if (args.latest) body.set('latest_time', args.latest)

      const response = await c.request('/services/search/jobs/oneshot', {
        method: 'POST',
        body: body.toString(),
      })
      const data = (await response.json()) as SplunkSearchResult

      log.info('[splunk] search: Received %d results', data.results?.length ?? 0)
      return {
        success: true,
        results: data.results ?? [],
        fields: data.fields ?? [],
      }
    } catch (err) {
      log.error('[splunk] search: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Search Job (async) ──────────────────────────────────────────────────

  ipcMain.handle('integration:splunk-search-job', async (_e, args: SearchJobArgs) => {
    log.info('[splunk] search-job: query=%s earliest=%s latest=%s',
      args.query.slice(0, 100), args.earliest ?? 'default', args.latest ?? 'default')
    try {
      const c = getClient()
      const body = new URLSearchParams({ search: args.query })
      if (args.earliest) body.set('earliest_time', args.earliest)
      if (args.latest) body.set('latest_time', args.latest)

      const response = await c.request('/services/search/jobs', {
        method: 'POST',
        body: body.toString(),
      })
      const data = (await response.json()) as { sid?: string }

      if (!data.sid) {
        return { success: false, error: 'Splunk did not return a search job ID.' }
      }

      log.info('[splunk] search-job: Created job sid=%s', data.sid)
      return { success: true, sid: data.sid }
    } catch (err) {
      log.error('[splunk] search-job: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Job Status ──────────────────────────────────────────────────────────

  ipcMain.handle('integration:splunk-job-status', async (_e, args: JobStatusArgs) => {
    log.info('[splunk] job-status: sid=%s', args.sid)
    try {
      const c = getClient()
      const path = `/services/search/jobs/${encodeURIComponent(args.sid)}`
      const response = await c.request(path)
      const data = (await response.json()) as {
        entry?: Array<Record<string, unknown>>
      }

      const entry = data.entry?.[0]
      if (!entry) {
        return { success: false, error: `No job found with SID: ${args.sid}` }
      }

      const status = mapJobStatus(entry)
      log.info('[splunk] job-status: sid=%s state=%s progress=%d resultCount=%d',
        args.sid, status.dispatchState, status.doneProgress, status.resultCount)
      return { success: true, status }
    } catch (err) {
      log.error('[splunk] job-status: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Job Results ─────────────────────────────────────────────────────────

  ipcMain.handle('integration:splunk-job-results', async (_e, args: JobResultsArgs) => {
    const count = args.count ?? 100
    const offset = args.offset ?? 0
    log.info('[splunk] job-results: sid=%s count=%d offset=%d', args.sid, count, offset)
    try {
      const c = getClient()
      const params = new URLSearchParams({
        count: String(count),
        offset: String(offset),
      })
      const path = `/services/search/jobs/${encodeURIComponent(args.sid)}/results?${params.toString()}`
      const response = await c.request(path)
      const data = (await response.json()) as SplunkSearchResult

      log.info('[splunk] job-results: Received %d results', data.results?.length ?? 0)
      return {
        success: true,
        results: data.results ?? [],
        fields: data.fields ?? [],
      }
    } catch (err) {
      log.error('[splunk] job-results: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Saved Searches ──────────────────────────────────────────────────────

  ipcMain.handle('integration:splunk-saved-searches', async () => {
    log.info('[splunk] saved-searches: Listing')
    try {
      const c = getClient()
      const response = await c.request('/services/saved/searches?count=0')
      const data = (await response.json()) as {
        entry?: Array<Record<string, unknown>>
      }

      const searches = (data.entry ?? []).map(mapSavedSearch)
      log.info('[splunk] saved-searches: Received %d searches', searches.length)
      return { success: true, searches }
    } catch (err) {
      log.error('[splunk] saved-searches: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Indexes ─────────────────────────────────────────────────────────────

  ipcMain.handle('integration:splunk-indexes', async () => {
    log.info('[splunk] indexes: Listing')
    try {
      const c = getClient()
      const response = await c.request('/services/data/indexes?count=0')
      const data = (await response.json()) as {
        entry?: Array<Record<string, unknown>>
      }

      const indexes = (data.entry ?? []).map(mapIndex)
      log.info('[splunk] indexes: Received %d indexes', indexes.length)
      return { success: true, indexes }
    } catch (err) {
      log.error('[splunk] indexes: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Fired Alerts ────────────────────────────────────────────────────────

  ipcMain.handle('integration:splunk-alerts', async () => {
    log.info('[splunk] alerts: Listing fired alerts')
    try {
      const c = getClient()
      const response = await c.request('/services/alerts/fired_alerts?count=0')
      const data = (await response.json()) as {
        entry?: Array<Record<string, unknown>>
      }

      const alerts = (data.entry ?? []).map(mapAlert)
      log.info('[splunk] alerts: Received %d fired alerts', alerts.length)
      return { success: true, alerts }
    } catch (err) {
      log.error('[splunk] alerts: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Dashboards ──────────────────────────────────────────────────────────

  ipcMain.handle('integration:splunk-dashboards', async () => {
    log.info('[splunk] dashboards: Listing')
    try {
      const c = getClient()
      const response = await c.request('/servicesNS/-/-/data/ui/views?count=0')
      const data = (await response.json()) as {
        entry?: Array<Record<string, unknown>>
      }

      const dashboards = (data.entry ?? []).map(mapDashboard)
      log.info('[splunk] dashboards: Received %d dashboards', dashboards.length)
      return { success: true, dashboards }
    } catch (err) {
      log.error('[splunk] dashboards: Failed —', err)
      return { success: false, error: String(err) }
    }
  })
}
