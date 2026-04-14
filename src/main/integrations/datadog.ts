import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { storeSecret, retrieveSecret, deleteSecret } from '../utils/credentialStore'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'
import { systemFetch } from '../utils/electronFetch'

// ── Types ───────────────────────────────────────────────────────────────────

type DatadogSite = 'US1' | 'US3' | 'US5' | 'EU1' | 'AP1' | 'US1-FED'

interface DatadogStoreData {
  site: string
  apiUrl: string
  connected: boolean
  connectedAt: number
}

interface IntegrationStoreSchema {
  datadog: DatadogStoreData | null
}

interface ConnectArgs {
  site: string
  apiKey: string
  appKey: string
  customUrl?: string
}

interface MonitorsArgs {
  tags?: string
  monitorTags?: string
  groupStates?: string
}

interface MonitorDetailArgs {
  id: number
}

interface DashboardDetailArgs {
  id: string
}

interface MetricsArgs {
  query: string
  from: number
  to: number
}

interface EventsArgs {
  start: number
  end: number
  sources?: string
  tags?: string
}

interface HostsArgs {
  count?: number
  filter?: string
}

interface LogsSearchArgs {
  query: string
  from?: string
  to?: string
  limit?: number
}

// ── Constants ───────────────────────────────────────────────────────────────

const SITE_URLS: Record<DatadogSite, string> = {
  'US1': 'https://api.datadoghq.com',
  'US3': 'https://api.us3.datadoghq.com',
  'US5': 'https://api.us5.datadoghq.com',
  'EU1': 'https://api.datadoghq.eu',
  'AP1': 'https://api.ap1.datadoghq.com',
  'US1-FED': 'https://api.ddog-gov.com',
}

const CREDENTIAL_API_KEY = 'datadog-api-key'
const CREDENTIAL_APP_KEY = 'datadog-app-key'

// ── Store ───────────────────────────────────────────────────────────────────

const store = new Store<IntegrationStoreSchema>({
  name: 'clear-path-integrations',
  defaults: { datadog: null },
  encryptionKey: getStoreEncryptionKey(),
})

// ── Datadog Client ──────────────────────────────────────────────────────────

class DatadogClient {
  private apiUrl: string

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl
  }

  /** Resolve the API base URL from a site name or custom URL. */
  static resolveApiUrl(site: string, customUrl?: string): string {
    if (customUrl) {
      let url = customUrl.trim()
      url = url.replace(/\/+$/, '')
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`
      }
      return url
    }

    const mapped = SITE_URLS[site as DatadogSite]
    if (!mapped) {
      throw new Error(`Unknown Datadog site "${site}". Use one of: ${Object.keys(SITE_URLS).join(', ')}, or provide a custom URL.`)
    }
    return mapped
  }

  /** Build authentication headers from stored credentials. */
  private getAuthHeaders(): Record<string, string> {
    const apiKey = retrieveSecret(CREDENTIAL_API_KEY)
    if (!apiKey) throw new Error('No Datadog API key found. Please reconnect.')

    const appKey = retrieveSecret(CREDENTIAL_APP_KEY)
    if (!appKey) throw new Error('No Datadog Application key found. Please reconnect.')

    return {
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': appKey,
    }
  }

  /** Make an authenticated GET request. */
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.apiUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...this.getAuthHeaders(),
      ...(options.headers as Record<string, string> ?? {}),
    }

    log.debug('[datadog] %s %s', options.method ?? 'GET', path)

    let response: Response
    try {
      response = await systemFetch(url, { ...options, headers })
    } catch (err) {
      log.error('[datadog] Network error on %s — %s', path, err)
      throw new Error(`Failed to connect to Datadog at ${this.apiUrl}. Check your network and API URL.`)
    }

    if (response.status === 401) {
      throw new Error('Authentication failed. Your Datadog API key or Application key may be invalid. Please reconnect.')
    }
    if (response.status === 403) {
      throw new Error('Permission denied. Your Datadog keys may lack the required access for this endpoint.')
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') ?? response.headers.get('X-RateLimit-Reset')
      const retryMsg = retryAfter ? ` Retry after ${retryAfter} seconds.` : ''
      throw new Error(`Rate limited by Datadog.${retryMsg} Please wait and try again.`)
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Datadog API error (${response.status}): ${body.slice(0, 500)}`)
    }

    return response
  }

  /** Validate the API key only (does not require Application key). */
  async validateApiKey(apiKey: string): Promise<boolean> {
    const url = `${this.apiUrl}/api/v1/validate`
    log.debug('[datadog] Validating API key against %s', url)

    let response: Response
    try {
      response = await systemFetch(url, {
        headers: {
          'DD-API-KEY': apiKey,
          'Accept': 'application/json',
        },
      })
    } catch (err) {
      log.error('[datadog] Validation network error — %s', err)
      throw new Error(`Failed to connect to Datadog at ${this.apiUrl}. Check your network and API URL.`)
    }

    if (!response.ok) {
      return false
    }

    const data = (await response.json()) as { valid?: boolean }
    return data.valid === true
  }
}

// ── Cached client ───────────────────────────────────────────────────────────

let client: DatadogClient | null = null

function getClient(): DatadogClient {
  if (client) return client

  const dd = store.get('datadog')
  if (!dd?.connected) {
    throw new Error('Datadog is not connected. Please connect via Configure > Integrations.')
  }

  client = new DatadogClient(dd.apiUrl)
  return client
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerDatadogHandlers(ipcMain: IpcMain): void {

  // ── Connect ─────────────────────────────────────────────────────────────

  ipcMain.handle('integration:datadog-connect', async (_e, args: ConnectArgs) => {
    log.info('[datadog] connect: site=%s customUrl=%s', args.site, args.customUrl ?? 'none')
    try {
      const apiUrl = DatadogClient.resolveApiUrl(args.site, args.customUrl)
      const tempClient = new DatadogClient(apiUrl)

      // Validate API key
      const valid = await tempClient.validateApiKey(args.apiKey)
      if (!valid) {
        log.error('[datadog] connect: API key validation failed')
        return { success: false, error: 'Invalid Datadog API key. Please check your key and selected site.' }
      }

      // Store credentials
      storeSecret(CREDENTIAL_API_KEY, args.apiKey)
      storeSecret(CREDENTIAL_APP_KEY, args.appKey)

      // Persist metadata
      store.set('datadog', {
        site: args.site,
        apiUrl,
        connected: true,
        connectedAt: Date.now(),
      })

      // Cache client
      client = tempClient

      log.info('[datadog] connect: Connected successfully to %s', apiUrl)
      return { success: true }
    } catch (err) {
      log.error('[datadog] connect: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Disconnect ──────────────────────────────────────────────────────────

  ipcMain.handle('integration:datadog-disconnect', () => {
    log.info('[datadog] disconnect: Clearing credentials and metadata')
    deleteSecret(CREDENTIAL_API_KEY)
    deleteSecret(CREDENTIAL_APP_KEY)
    store.set('datadog', null)
    client = null
    return { success: true }
  })

  // ── Monitors: List ──────────────────────────────────────────────────────

  ipcMain.handle('integration:datadog-monitors', async (_e, args?: MonitorsArgs) => {
    log.info('[datadog] monitors: tags=%s monitorTags=%s groupStates=%s',
      args?.tags ?? '', args?.monitorTags ?? '', args?.groupStates ?? '')
    try {
      const c = getClient()
      const params = new URLSearchParams()
      if (args?.tags) params.set('tags', args.tags)
      if (args?.monitorTags) params.set('monitor_tags', args.monitorTags)
      if (args?.groupStates) params.set('group_states', args.groupStates)

      const queryStr = params.toString()
      const path = `/api/v1/monitor${queryStr ? `?${queryStr}` : ''}`
      const response = await c.request(path)
      const monitors = await response.json()

      log.info('[datadog] monitors: Received %d monitors', Array.isArray(monitors) ? monitors.length : 0)
      return { success: true, monitors }
    } catch (err) {
      log.error('[datadog] monitors: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Monitor: Detail ─────────────────────────────────────────────────────

  ipcMain.handle('integration:datadog-monitor-detail', async (_e, args: MonitorDetailArgs) => {
    log.info('[datadog] monitor-detail: id=%d', args.id)
    try {
      const c = getClient()
      const response = await c.request(`/api/v1/monitor/${encodeURIComponent(String(args.id))}`)
      const monitor = await response.json()

      return { success: true, monitor }
    } catch (err) {
      log.error('[datadog] monitor-detail: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Dashboards: List ────────────────────────────────────────────────────

  ipcMain.handle('integration:datadog-dashboards', async () => {
    log.info('[datadog] dashboards: Listing all dashboards')
    try {
      const c = getClient()
      const response = await c.request('/api/v1/dashboard')
      const data = (await response.json()) as { dashboards?: unknown[] }

      log.info('[datadog] dashboards: Received %d dashboards', data.dashboards?.length ?? 0)
      return { success: true, dashboards: data.dashboards ?? [] }
    } catch (err) {
      log.error('[datadog] dashboards: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Dashboard: Detail ───────────────────────────────────────────────────

  ipcMain.handle('integration:datadog-dashboard-detail', async (_e, args: DashboardDetailArgs) => {
    log.info('[datadog] dashboard-detail: id=%s', args.id)
    try {
      const c = getClient()
      const response = await c.request(`/api/v1/dashboard/${encodeURIComponent(args.id)}`)
      const dashboard = await response.json()

      return { success: true, dashboard }
    } catch (err) {
      log.error('[datadog] dashboard-detail: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Metrics: Query ──────────────────────────────────────────────────────

  ipcMain.handle('integration:datadog-metrics', async (_e, args: MetricsArgs) => {
    log.info('[datadog] metrics: query=%s from=%d to=%d', args.query, args.from, args.to)
    try {
      const c = getClient()
      const params = new URLSearchParams({
        query: args.query,
        from: String(args.from),
        to: String(args.to),
      })

      const response = await c.request(`/api/v1/query?${params.toString()}`)
      const data = await response.json()

      return { success: true, data }
    } catch (err) {
      log.error('[datadog] metrics: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Events: List ────────────────────────────────────────────────────────

  ipcMain.handle('integration:datadog-events', async (_e, args: EventsArgs) => {
    log.info('[datadog] events: start=%d end=%d sources=%s tags=%s',
      args.start, args.end, args.sources ?? '', args.tags ?? '')
    try {
      const c = getClient()
      const params = new URLSearchParams({
        start: String(args.start),
        end: String(args.end),
      })
      if (args.sources) params.set('sources', args.sources)
      if (args.tags) params.set('tags', args.tags)

      const response = await c.request(`/api/v1/events?${params.toString()}`)
      const data = (await response.json()) as { events?: unknown[] }

      log.info('[datadog] events: Received %d events', data.events?.length ?? 0)
      return { success: true, events: data.events ?? [] }
    } catch (err) {
      log.error('[datadog] events: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Incidents: List (v2 API) ────────────────────────────────────────────

  ipcMain.handle('integration:datadog-incidents', async () => {
    log.info('[datadog] incidents: Listing all incidents')
    try {
      const c = getClient()
      const response = await c.request('/api/v2/incidents')
      const data = (await response.json()) as { data?: unknown[] }

      log.info('[datadog] incidents: Received %d incidents', data.data?.length ?? 0)
      return { success: true, incidents: data.data ?? [] }
    } catch (err) {
      log.error('[datadog] incidents: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── SLOs: List ──────────────────────────────────────────────────────────

  ipcMain.handle('integration:datadog-slos', async () => {
    log.info('[datadog] slos: Listing all SLOs')
    try {
      const c = getClient()
      const response = await c.request('/api/v1/slo')
      const data = (await response.json()) as { data?: unknown[] }

      log.info('[datadog] slos: Received %d SLOs', data.data?.length ?? 0)
      return { success: true, slos: data.data ?? [] }
    } catch (err) {
      log.error('[datadog] slos: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Hosts: List ─────────────────────────────────────────────────────────

  ipcMain.handle('integration:datadog-hosts', async (_e, args?: HostsArgs) => {
    log.info('[datadog] hosts: count=%d filter=%s', args?.count ?? 100, args?.filter ?? '')
    try {
      const c = getClient()
      const params = new URLSearchParams()
      params.set('count', String(args?.count ?? 100))
      if (args?.filter) params.set('filter', args.filter)

      const response = await c.request(`/api/v1/hosts?${params.toString()}`)
      const data = (await response.json()) as { host_list?: unknown[]; total_matching?: number }

      log.info('[datadog] hosts: Received %d hosts (total_matching=%d)',
        data.host_list?.length ?? 0, data.total_matching ?? 0)
      return { success: true, hosts: data.host_list ?? [], totalMatching: data.total_matching ?? 0 }
    } catch (err) {
      log.error('[datadog] hosts: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Logs: Search (v2 API) ───────────────────────────────────────────────

  ipcMain.handle('integration:datadog-logs-search', async (_e, args: LogsSearchArgs) => {
    log.info('[datadog] logs-search: query=%s from=%s to=%s limit=%d',
      args.query, args.from ?? 'now-1h', args.to ?? 'now', args.limit ?? 25)
    try {
      const c = getClient()
      const body = {
        filter: {
          query: args.query,
          from: args.from ?? 'now-1h',
          to: args.to ?? 'now',
        },
        page: {
          limit: args.limit ?? 25,
        },
      }

      const response = await c.request('/api/v2/logs/events/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = (await response.json()) as { data?: unknown[] }

      log.info('[datadog] logs-search: Received %d log entries', data.data?.length ?? 0)
      return { success: true, logs: data.data ?? [] }
    } catch (err) {
      log.error('[datadog] logs-search: Failed —', err)
      return { success: false, error: String(err) }
    }
  })
}
