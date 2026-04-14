import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { storeSecret, retrieveSecret, deleteSecret } from '../utils/credentialStore'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'
import { systemFetch } from '../utils/electronFetch'

// ── Types ───────────────────────────────────────────────────────────────────

interface ServiceNowStoreData {
  instanceUrl: string
  username: string
  displayName: string
  authMethod: 'oauth' | 'basic'
  connected: boolean
  connectedAt: number
  userSysId: string
}

interface IntegrationStoreSchema {
  servicenow: ServiceNowStoreData | null
}

interface ConnectArgs {
  instanceUrl: string
  username: string
  password: string
  authMethod: 'oauth' | 'basic'
  clientId?: string
  clientSecret?: string
}

interface IncidentListArgs {
  query?: string
  limit?: number
  offset?: number
}

interface IncidentCreateArgs {
  shortDescription: string
  description?: string
  urgency?: string
  impact?: string
  assignmentGroup?: string
  category?: string
}

interface IncidentUpdateArgs {
  sysId: string
  fields: Record<string, string>
}

interface ChangeListArgs {
  query?: string
  limit?: number
  offset?: number
}

interface KnowledgeArgs {
  query?: string
  limit?: number
}

interface CmdbSearchArgs {
  className?: string
  query?: string
  limit?: number
}

interface OAuthTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

// ── Store ───────────────────────────────────────────────────────────────────

const store = new Store<IntegrationStoreSchema>({
  name: 'clear-path-integrations',
  defaults: { servicenow: null },
  encryptionKey: getStoreEncryptionKey(),
})

// ── ServiceNow Client ───────────────────────────────────────────────────────

class ServiceNowClient {
  private instanceUrl: string
  private authMethod: 'oauth' | 'basic'
  private username: string

  constructor(instanceUrl: string, authMethod: 'oauth' | 'basic', username: string) {
    this.instanceUrl = instanceUrl
    this.authMethod = authMethod
    this.username = username
  }

  /** Normalize a ServiceNow instance URL. */
  static normalizeUrl(input: string): string {
    let url = input.trim()
    // Strip trailing slash
    url = url.replace(/\/+$/, '')
    // If it's just an instance name (no dots), assume .service-now.com
    if (!url.includes('.')) {
      url = `${url}.service-now.com`
    }
    // Ensure https://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`
    }
    // Force https
    url = url.replace(/^http:\/\//, 'https://')
    return url
  }

  /** Build authorization header. */
  private getAuthHeader(): string {
    if (this.authMethod === 'oauth') {
      const token = retrieveSecret('servicenow-access-token')
      if (!token) throw new Error('No OAuth access token found. Please reconnect.')
      return `Bearer ${token}`
    }
    // Basic auth
    const password = retrieveSecret('servicenow-password')
    if (!password) throw new Error('No password found. Please reconnect.')
    const encoded = Buffer.from(`${this.username}:${password}`).toString('base64')
    return `Basic ${encoded}`
  }

  /** Make an authenticated request with automatic OAuth token refresh on 401. */
  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.instanceUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': this.getAuthHeader(),
      ...(options.headers as Record<string, string> ?? {}),
    }

    log.debug('[servicenow] %s %s', options.method ?? 'GET', path)

    let response: Response
    try {
      response = await systemFetch(url, { ...options, headers })
    } catch (err) {
      log.error('[servicenow] Network error on %s — %s', path, err)
      throw new Error(`Failed to connect to ServiceNow at ${this.instanceUrl}. Check your network and instance URL.`)
    }

    // Handle 401 with OAuth token refresh
    if (response.status === 401 && this.authMethod === 'oauth') {
      log.info('[servicenow] 401 on %s — attempting token refresh', path)
      const refreshed = await this.refreshOAuthToken()
      if (refreshed) {
        headers['Authorization'] = this.getAuthHeader()
        try {
          response = await systemFetch(url, { ...options, headers })
        } catch (err) {
          throw new Error(`Failed to connect to ServiceNow after token refresh: ${err}`)
        }
      } else {
        // Refresh failed — mark disconnected
        log.error('[servicenow] Token refresh failed — marking as disconnected')
        store.set('servicenow', null)
        throw new Error('ServiceNow session expired and token refresh failed. Please reconnect.')
      }
    }

    if (response.status === 401) {
      throw new Error('Authentication failed. Please check your credentials and reconnect.')
    }
    if (response.status === 403) {
      throw new Error('Permission denied. Your ServiceNow account may lack the required access.')
    }
    if (response.status === 429) {
      throw new Error('Rate limited by ServiceNow. Please wait and try again.')
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`ServiceNow API error (${response.status}): ${body.slice(0, 500)}`)
    }

    return response
  }

  /** Attempt to refresh the OAuth access token using the stored refresh token. */
  private async refreshOAuthToken(): Promise<boolean> {
    const refreshToken = retrieveSecret('servicenow-refresh-token')
    const clientId = retrieveSecret('servicenow-client-id')
    const clientSecret = retrieveSecret('servicenow-client-secret')

    if (!refreshToken || !clientId) {
      log.warn('[servicenow] Cannot refresh token — missing refresh_token or client_id')
      return false
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      })

      const response = await systemFetch(`${this.instanceUrl}/oauth_token.do`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

      if (!response.ok) {
        log.error('[servicenow] Token refresh HTTP %d', response.status)
        return false
      }

      const data = (await response.json()) as OAuthTokenResponse
      storeSecret('servicenow-access-token', data.access_token)
      if (data.refresh_token) {
        storeSecret('servicenow-refresh-token', data.refresh_token)
      }
      log.info('[servicenow] Token refresh succeeded')
      return true
    } catch (err) {
      log.error('[servicenow] Token refresh error — %s', err)
      return false
    }
  }

  /** Exchange credentials for OAuth tokens via ROPC flow. */
  static async obtainOAuthTokens(
    instanceUrl: string,
    username: string,
    password: string,
    clientId: string,
    clientSecret?: string,
  ): Promise<OAuthTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      username,
      password,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    })

    const response = await systemFetch(`${instanceUrl}/oauth_token.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`OAuth token exchange failed (${response.status}): ${text.slice(0, 300)}`)
    }

    return (await response.json()) as OAuthTokenResponse
  }
}

// ── Cached client ───────────────────────────────────────────────────────────

let client: ServiceNowClient | null = null

function getClient(): ServiceNowClient {
  if (client) return client

  const sn = store.get('servicenow')
  if (!sn?.connected) {
    throw new Error('ServiceNow is not connected. Please connect via Configure > Integrations.')
  }

  client = new ServiceNowClient(sn.instanceUrl, sn.authMethod, sn.username)
  return client
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerServiceNowHandlers(ipcMain: IpcMain): void {

  // ── Connect ─────────────────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-connect', async (_e, args: ConnectArgs) => {
    log.info('[servicenow] connect: instanceUrl=%s, user=%s, authMethod=%s', args.instanceUrl, args.username, args.authMethod)
    try {
      const instanceUrl = ServiceNowClient.normalizeUrl(args.instanceUrl)

      // OAuth flow
      if (args.authMethod === 'oauth') {
        if (!args.clientId) {
          return { success: false, error: 'Client ID is required for OAuth authentication.' }
        }

        log.info('[servicenow] connect: Exchanging OAuth credentials')
        const tokens = await ServiceNowClient.obtainOAuthTokens(
          instanceUrl,
          args.username,
          args.password,
          args.clientId,
          args.clientSecret,
        )

        storeSecret('servicenow-access-token', tokens.access_token)
        storeSecret('servicenow-refresh-token', tokens.refresh_token)
        storeSecret('servicenow-client-id', args.clientId)
        if (args.clientSecret) {
          storeSecret('servicenow-client-secret', args.clientSecret)
        }
      } else {
        // Basic auth — store password
        storeSecret('servicenow-password', args.password)
      }

      // Validate connection by fetching user record
      const tempClient = new ServiceNowClient(instanceUrl, args.authMethod, args.username)
      const userPath = `/api/now/table/sys_user?sysparm_query=user_name=${encodeURIComponent(args.username)}&sysparm_limit=1&sysparm_fields=sys_id,first_name,last_name,user_name,email`
      const userResponse = await tempClient.request(userPath)
      const userData = (await userResponse.json()) as { result: Array<{ sys_id: string; first_name: string; last_name: string; user_name: string; email: string }> }

      if (!userData.result || userData.result.length === 0) {
        return { success: false, error: `User "${args.username}" not found in ServiceNow instance.` }
      }

      const user = userData.result[0]
      const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.user_name

      // Persist metadata
      store.set('servicenow', {
        instanceUrl,
        username: args.username,
        displayName,
        authMethod: args.authMethod,
        connected: true,
        connectedAt: Date.now(),
        userSysId: user.sys_id,
      })

      // Cache client
      client = tempClient
      log.info('[servicenow] connect: Success — user=%s (%s)', displayName, user.sys_id)

      return { success: true, displayName, userSysId: user.sys_id }
    } catch (err) {
      log.error('[servicenow] connect: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Disconnect ──────────────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-disconnect', () => {
    log.info('[servicenow] disconnect: Clearing all credentials and metadata')
    deleteSecret('servicenow-password')
    deleteSecret('servicenow-access-token')
    deleteSecret('servicenow-refresh-token')
    deleteSecret('servicenow-client-id')
    deleteSecret('servicenow-client-secret')
    store.set('servicenow', null)
    client = null
    return { success: true }
  })

  // ── Incidents: List ─────────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-incidents', async (_e, args?: IncidentListArgs) => {
    log.info('[servicenow] incidents: query=%s limit=%d offset=%d', args?.query ?? '', args?.limit ?? 20, args?.offset ?? 0)
    try {
      const c = getClient()
      const params = new URLSearchParams({
        sysparm_display_value: 'all',
        sysparm_fields: 'sys_id,number,short_description,description,state,urgency,impact,priority,assigned_to,assignment_group,caller_id,opened_at,resolved_at,category,subcategory',
        sysparm_limit: String(args?.limit ?? 20),
        sysparm_offset: String(args?.offset ?? 0),
      })
      if (args?.query) params.set('sysparm_query', args.query)

      const response = await c.request(`/api/now/table/incident?${params.toString()}`)
      const data = (await response.json()) as { result: Record<string, unknown>[] }

      log.info('[servicenow] incidents: Received %d records', data.result.length)
      return { success: true, incidents: data.result }
    } catch (err) {
      log.error('[servicenow] incidents: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Incidents: Detail ───────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-incident-detail', async (_e, args: { sysId: string }) => {
    log.info('[servicenow] incident-detail: sysId=%s', args.sysId)
    try {
      const c = getClient()
      const response = await c.request(`/api/now/table/incident/${encodeURIComponent(args.sysId)}?sysparm_display_value=all`)
      const data = (await response.json()) as { result: Record<string, unknown> }

      return { success: true, incident: data.result }
    } catch (err) {
      log.error('[servicenow] incident-detail: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Incidents: Create ───────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-incident-create', async (_e, args: IncidentCreateArgs) => {
    log.info('[servicenow] incident-create: shortDescription=%s', args.shortDescription)
    try {
      const c = getClient()
      const body: Record<string, string> = {
        short_description: args.shortDescription,
      }
      if (args.description) body.description = args.description
      if (args.urgency) body.urgency = args.urgency
      if (args.impact) body.impact = args.impact
      if (args.assignmentGroup) body.assignment_group = args.assignmentGroup
      if (args.category) body.category = args.category

      const response = await c.request('/api/now/table/incident', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = (await response.json()) as { result: Record<string, unknown> }

      log.info('[servicenow] incident-create: Created %s', data.result?.number ?? data.result?.sys_id)
      return { success: true, incident: data.result }
    } catch (err) {
      log.error('[servicenow] incident-create: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Incidents: Update ───────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-incident-update', async (_e, args: IncidentUpdateArgs) => {
    log.info('[servicenow] incident-update: sysId=%s fields=%s', args.sysId, Object.keys(args.fields).join(','))
    try {
      const c = getClient()
      const response = await c.request(`/api/now/table/incident/${encodeURIComponent(args.sysId)}`, {
        method: 'PATCH',
        body: JSON.stringify(args.fields),
      })
      const data = (await response.json()) as { result: Record<string, unknown> }

      return { success: true, incident: data.result }
    } catch (err) {
      log.error('[servicenow] incident-update: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Changes: List ───────────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-changes', async (_e, args?: ChangeListArgs) => {
    log.info('[servicenow] changes: query=%s limit=%d offset=%d', args?.query ?? '', args?.limit ?? 20, args?.offset ?? 0)
    try {
      const c = getClient()
      const params = new URLSearchParams({
        sysparm_display_value: 'all',
        sysparm_fields: 'sys_id,number,short_description,description,state,type,priority,risk,impact,assigned_to,assignment_group,requested_by,start_date,end_date,category',
        sysparm_limit: String(args?.limit ?? 20),
        sysparm_offset: String(args?.offset ?? 0),
      })
      if (args?.query) params.set('sysparm_query', args.query)

      const response = await c.request(`/api/now/table/change_request?${params.toString()}`)
      const data = (await response.json()) as { result: Record<string, unknown>[] }

      log.info('[servicenow] changes: Received %d records', data.result.length)
      return { success: true, changes: data.result }
    } catch (err) {
      log.error('[servicenow] changes: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Changes: Detail ─────────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-change-detail', async (_e, args: { sysId: string }) => {
    log.info('[servicenow] change-detail: sysId=%s', args.sysId)
    try {
      const c = getClient()
      const response = await c.request(`/api/now/table/change_request/${encodeURIComponent(args.sysId)}?sysparm_display_value=all`)
      const data = (await response.json()) as { result: Record<string, unknown> }

      return { success: true, change: data.result }
    } catch (err) {
      log.error('[servicenow] change-detail: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Service Catalog Items ───────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-catalog-items', async () => {
    log.info('[servicenow] catalog-items: Fetching service catalog')
    try {
      const c = getClient()
      const response = await c.request('/api/sn_sc/servicecatalog/items')
      const data = (await response.json()) as { result: Record<string, unknown>[] }

      log.info('[servicenow] catalog-items: Received %d items', data.result.length)
      return { success: true, items: data.result }
    } catch (err) {
      log.error('[servicenow] catalog-items: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Knowledge Base ──────────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-knowledge', async (_e, args?: KnowledgeArgs) => {
    log.info('[servicenow] knowledge: query=%s limit=%d', args?.query ?? '', args?.limit ?? 20)
    try {
      const c = getClient()
      const params = new URLSearchParams({
        sysparm_display_value: 'all',
        sysparm_fields: 'sys_id,number,short_description,text,topic,category,author,published',
        sysparm_limit: String(args?.limit ?? 20),
      })
      if (args?.query) params.set('sysparm_query', args.query)

      const response = await c.request(`/api/now/table/kb_knowledge?${params.toString()}`)
      const data = (await response.json()) as { result: Record<string, unknown>[] }

      log.info('[servicenow] knowledge: Received %d articles', data.result.length)
      return { success: true, articles: data.result }
    } catch (err) {
      log.error('[servicenow] knowledge: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── CMDB Search ─────────────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-cmdb-search', async (_e, args?: CmdbSearchArgs) => {
    const table = args?.className ?? 'cmdb_ci'
    log.info('[servicenow] cmdb-search: table=%s query=%s limit=%d', table, args?.query ?? '', args?.limit ?? 20)
    try {
      const c = getClient()
      const params = new URLSearchParams({
        sysparm_display_value: 'all',
        sysparm_fields: 'sys_id,name,sys_class_name,operational_status,environment,ip_address,fqdn,category,subcategory,assigned_to,support_group',
        sysparm_limit: String(args?.limit ?? 20),
      })
      if (args?.query) params.set('sysparm_query', args.query)

      const response = await c.request(`/api/now/table/${encodeURIComponent(table)}?${params.toString()}`)
      const data = (await response.json()) as { result: Record<string, unknown>[] }

      log.info('[servicenow] cmdb-search: Received %d CIs', data.result.length)
      return { success: true, items: data.result }
    } catch (err) {
      log.error('[servicenow] cmdb-search: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── User Info ───────────────────────────────────────────────────────────

  ipcMain.handle('integration:servicenow-user-info', () => {
    const sn = store.get('servicenow')
    if (!sn?.connected) {
      return { success: false, error: 'ServiceNow is not connected.' }
    }
    return {
      success: true,
      user: {
        instanceUrl: sn.instanceUrl,
        username: sn.username,
        displayName: sn.displayName,
        authMethod: sn.authMethod,
        connected: sn.connected,
        connectedAt: sn.connectedAt,
        userSysId: sn.userSysId,
      },
    }
  })
}
