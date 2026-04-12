import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { storeSecret, retrieveSecret, deleteSecret } from '../utils/credentialStore'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'

// ── Types ───────────────────────────────────────────────────────────────────

interface BackstageCapabilities {
  catalog: boolean
  techdocs: boolean
  scaffolder: boolean
  search: boolean
  kubernetes: boolean
}

interface BackstageStoreData {
  baseUrl: string
  connected: boolean
  connectedAt: number
  capabilities: BackstageCapabilities
}

interface IntegrationStoreSchema {
  backstage: BackstageStoreData | null
}

interface ConnectArgs {
  baseUrl: string
  token: string
}

interface EntitiesArgs {
  filter?: string
  limit?: number
  offset?: number
}

interface EntityDetailArgs {
  kind: string
  namespace?: string
  name: string
}

interface SearchArgs {
  term: string
  types?: string[]
  limit?: number
}

interface TechDocsArgs {
  namespace: string
  kind: string
  name: string
}

interface TemplatesArgs {
  limit?: number
}

interface KubernetesArgs {
  entityRef?: string
}

interface BackstageEntity {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace?: string
    description?: string
    annotations?: Record<string, string>
    labels?: Record<string, string>
    uid?: string
    tags?: string[]
  }
  spec?: Record<string, unknown>
  relations?: Array<{ type: string; targetRef: string }>
}

// ── Store ───────────────────────────────────────────────────────────────────

const store = new Store<IntegrationStoreSchema>({
  name: 'clear-path-integrations',
  defaults: { backstage: null },
  encryptionKey: getStoreEncryptionKey(),
})

// ── Backstage Client ────────────────────────────────────────────────────────

class BackstageClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  /** Normalize a Backstage base URL. */
  static normalizeUrl(input: string): string {
    let url = input.trim()
    // Strip trailing slash
    url = url.replace(/\/+$/, '')
    // Ensure https:// if no protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`
    }
    return url
  }

  /** Build authorization header from stored token. */
  private getAuthHeader(): string {
    const token = retrieveSecret('backstage-token')
    if (!token) throw new Error('No Backstage token found. Please reconnect.')
    return `Bearer ${token}`
  }

  /** Make an authenticated request. */
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': this.getAuthHeader(),
      ...(options.headers as Record<string, string> ?? {}),
    }

    log.debug('[backstage] %s %s', options.method ?? 'GET', path)

    let response: Response
    try {
      response = await fetch(url, { ...options, headers })
    } catch (err) {
      log.error('[backstage] Network error on %s — %s', path, err)
      throw new Error(`Failed to connect to Backstage at ${this.baseUrl}. Check your network and base URL.`)
    }

    if (response.status === 401) {
      throw new Error('Authentication failed. Your Backstage token may have expired. Please reconnect.')
    }
    if (response.status === 403) {
      throw new Error('Permission denied. Your Backstage token may lack the required access.')
    }
    if (response.status === 429) {
      throw new Error('Rate limited by Backstage. Please wait and try again.')
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Backstage API error (${response.status}): ${body.slice(0, 500)}`)
    }

    return response
  }

  /** Probe a capability endpoint — returns true if accessible, false otherwise. */
  async probeCapability(path: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}${path}`
      const token = retrieveSecret('backstage-token')
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })
      // 2xx or 3xx means the endpoint exists
      return response.ok || (response.status >= 300 && response.status < 400)
    } catch {
      return false
    }
  }
}

// ── Cached client ───────────────────────────────────────────────────────────

let client: BackstageClient | null = null

function getClient(): BackstageClient {
  if (client) return client

  const bs = store.get('backstage')
  if (!bs?.connected) {
    throw new Error('Backstage is not connected. Please connect via Configure > Integrations.')
  }

  client = new BackstageClient(bs.baseUrl)
  return client
}

// ── Entity mapping ──────────────────────────────────────────────────────────

function mapEntity(raw: Record<string, unknown>): BackstageEntity {
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>
  return {
    apiVersion: (raw.apiVersion as string) ?? '',
    kind: (raw.kind as string) ?? '',
    metadata: {
      name: (metadata.name as string) ?? '',
      namespace: metadata.namespace as string | undefined,
      description: metadata.description as string | undefined,
      annotations: metadata.annotations as Record<string, string> | undefined,
      labels: metadata.labels as Record<string, string> | undefined,
      uid: metadata.uid as string | undefined,
      tags: metadata.tags as string[] | undefined,
    },
    spec: raw.spec as Record<string, unknown> | undefined,
    relations: raw.relations as Array<{ type: string; targetRef: string }> | undefined,
  }
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerBackstageHandlers(ipcMain: IpcMain): void {

  // ── Connect ─────────────────────────────────────────────────────────────

  ipcMain.handle('integration:backstage-connect', async (_e, args: ConnectArgs) => {
    log.info('[backstage] connect: baseUrl=%s', args.baseUrl)
    try {
      const baseUrl = BackstageClient.normalizeUrl(args.baseUrl)

      // Store the token first so the client can use it
      storeSecret('backstage-token', args.token)

      const tempClient = new BackstageClient(baseUrl)

      // Validate catalog access (required)
      try {
        await tempClient.request('/api/catalog/entities?limit=1')
      } catch (err) {
        // Clean up token on validation failure
        deleteSecret('backstage-token')
        log.error('[backstage] connect: Catalog validation failed —', err)
        return { success: false, error: `Failed to access Backstage catalog: ${err}` }
      }

      // Probe optional capabilities in parallel
      log.info('[backstage] connect: Probing capabilities')
      const [techdocs, scaffolder, search, kubernetes] = await Promise.all([
        tempClient.probeCapability('/api/techdocs/'),
        tempClient.probeCapability('/api/scaffolder/v2/templates?limit=1'),
        tempClient.probeCapability('/api/search/query?term=test&limit=1'),
        tempClient.probeCapability('/api/kubernetes/clusters'),
      ])

      const capabilities: BackstageCapabilities = {
        catalog: true,
        techdocs,
        scaffolder,
        search,
        kubernetes,
      }

      log.info('[backstage] connect: Capabilities — techdocs=%s scaffolder=%s search=%s kubernetes=%s',
        techdocs, scaffolder, search, kubernetes)

      // Persist metadata
      store.set('backstage', {
        baseUrl,
        connected: true,
        connectedAt: Date.now(),
        capabilities,
      })

      // Cache client
      client = tempClient

      return { success: true, capabilities }
    } catch (err) {
      log.error('[backstage] connect: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Disconnect ──────────────────────────────────────────────────────────

  ipcMain.handle('integration:backstage-disconnect', () => {
    log.info('[backstage] disconnect: Clearing token and metadata')
    deleteSecret('backstage-token')
    store.set('backstage', null)
    client = null
    return { success: true }
  })

  // ── Entities: List ──────────────────────────────────────────────────────

  ipcMain.handle('integration:backstage-entities', async (_e, args?: EntitiesArgs) => {
    log.info('[backstage] entities: filter=%s limit=%d offset=%d', args?.filter ?? '', args?.limit ?? 20, args?.offset ?? 0)
    try {
      const c = getClient()
      const params = new URLSearchParams()
      if (args?.filter) params.set('filter', args.filter)
      if (args?.limit) params.set('limit', String(args.limit))
      if (args?.offset) params.set('offset', String(args.offset))

      const queryStr = params.toString()
      const path = `/api/catalog/entities${queryStr ? `?${queryStr}` : ''}`
      const response = await c.request(path)
      const data = (await response.json()) as Record<string, unknown>[]

      const entities = data.map(mapEntity)
      log.info('[backstage] entities: Received %d entities', entities.length)
      return { success: true, entities }
    } catch (err) {
      log.error('[backstage] entities: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Entity: Detail ──────────────────────────────────────────────────────

  ipcMain.handle('integration:backstage-entity-detail', async (_e, args: EntityDetailArgs) => {
    const namespace = args.namespace ?? 'default'
    log.info('[backstage] entity-detail: %s/%s/%s', args.kind, namespace, args.name)
    try {
      const c = getClient()
      const path = `/api/catalog/entities/by-name/${encodeURIComponent(args.kind)}/${encodeURIComponent(namespace)}/${encodeURIComponent(args.name)}`
      const response = await c.request(path)
      const data = (await response.json()) as Record<string, unknown>

      return { success: true, entity: mapEntity(data) }
    } catch (err) {
      log.error('[backstage] entity-detail: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Search ──────────────────────────────────────────────────────────────

  ipcMain.handle('integration:backstage-search', async (_e, args: SearchArgs) => {
    log.info('[backstage] search: term=%s types=%s limit=%d', args.term, args.types?.join(',') ?? 'all', args.limit ?? 25)
    try {
      const c = getClient()
      const params = new URLSearchParams({ term: args.term })
      if (args.limit) params.set('limit', String(args.limit))
      if (args.types && args.types.length > 0) {
        for (const t of args.types) {
          params.append('types', t)
        }
      }

      const response = await c.request(`/api/search/query?${params.toString()}`)
      const data = (await response.json()) as { results: Array<{ type: string; document: Record<string, unknown> }> }

      log.info('[backstage] search: Received %d results', data.results?.length ?? 0)
      return { success: true, results: data.results ?? [] }
    } catch (err) {
      log.error('[backstage] search: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── TechDocs ────────────────────────────────────────────────────────────

  ipcMain.handle('integration:backstage-techdocs', async (_e, args: TechDocsArgs) => {
    log.info('[backstage] techdocs: %s/%s/%s', args.namespace, args.kind, args.name)
    try {
      const c = getClient()
      const path = `/api/techdocs/entities/namespace/${encodeURIComponent(args.namespace)}/kind/${encodeURIComponent(args.kind)}/name/${encodeURIComponent(args.name)}`
      const response = await c.request(path)
      const data = await response.json()

      return { success: true, techdocs: data }
    } catch (err) {
      log.error('[backstage] techdocs: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Templates (Scaffolder) ──────────────────────────────────────────────

  ipcMain.handle('integration:backstage-templates', async (_e, args?: TemplatesArgs) => {
    log.info('[backstage] templates: limit=%d', args?.limit ?? 50)
    try {
      const c = getClient()
      const params = new URLSearchParams()
      if (args?.limit) params.set('limit', String(args.limit))

      const queryStr = params.toString()
      const path = `/api/scaffolder/v2/templates${queryStr ? `?${queryStr}` : ''}`
      const response = await c.request(path)
      const data = await response.json()

      const templates = Array.isArray(data) ? data : (data as Record<string, unknown>).items ?? data
      log.info('[backstage] templates: Received %d templates', Array.isArray(templates) ? templates.length : 0)
      return { success: true, templates }
    } catch (err) {
      log.error('[backstage] templates: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Kubernetes ──────────────────────────────────────────────────────────

  ipcMain.handle('integration:backstage-kubernetes', async (_e, args?: KubernetesArgs) => {
    log.info('[backstage] kubernetes: entityRef=%s', args?.entityRef ?? 'clusters')
    try {
      const c = getClient()
      let path: string

      if (args?.entityRef) {
        path = `/api/kubernetes/services/${encodeURIComponent(args.entityRef)}`
      } else {
        path = '/api/kubernetes/clusters'
      }

      const response = await c.request(path)
      const data = await response.json()

      return { success: true, data }
    } catch (err) {
      log.error('[backstage] kubernetes: Failed —', err)
      return { success: false, error: String(err) }
    }
  })
}
