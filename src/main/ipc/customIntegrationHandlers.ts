import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { storeSecret, retrieveSecret, deleteSecret, hasSecret } from '../utils/credentialStore'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'

// ── Types ───────────────────────────────────────────────────────────────────

interface PaginationConfig {
  type: 'offset' | 'cursor' | 'page' | 'none'
  pageParam?: string
  limitParam?: string
  defaultLimit?: number
}

interface CustomEndpoint {
  id: string
  label: string
  path: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  pagination?: PaginationConfig
}

interface CustomIntegration {
  id: string
  name: string
  baseUrl: string
  authType: 'none' | 'api-key' | 'bearer' | 'basic' | 'oauth2-client-creds' | 'custom-header'
  auth: {
    apiKeyHeader?: string
    apiKeyLocation?: 'header' | 'query'
    basicUsername?: string
    oauth2TokenUrl?: string
    oauth2ClientId?: string
    oauth2Scopes?: string
    customHeaderName?: string
    tokenEnvVar?: string
  }
  endpoints: CustomEndpoint[]
  enabled: boolean
  createdAt: number
  lastTestedAt?: number
  lastTestSuccess?: boolean
  responseMapping?: {
    titleField?: string
    descriptionField?: string
    statusField?: string
    urlField?: string
  }
}

interface CustomIntegrationStoreSchema {
  integrations: CustomIntegration[]
}

// ── Store ───────────────────────────────────────────────────────────────────

const store = new Store<CustomIntegrationStoreSchema>({
  name: 'clear-path-custom-integrations',
  defaults: { integrations: [] },
  encryptionKey: getStoreEncryptionKey(),
})

// ── Secret key helpers ──────────────────────────────────────────────────────

type SecretType = 'token' | 'apikey' | 'password' | 'client-secret' | 'header-value'

function secretKey(integrationId: string, secretType: SecretType): string {
  return `custom-${integrationId}-${secretType}`
}

/** Determine the appropriate secret type for the integration's auth type. */
function secretTypeForAuth(authType: CustomIntegration['authType']): SecretType {
  switch (authType) {
    case 'api-key': return 'apikey'
    case 'bearer': return 'token'
    case 'basic': return 'password'
    case 'oauth2-client-creds': return 'client-secret'
    case 'custom-header': return 'header-value'
    default: return 'token'
  }
}

/** All possible secret types to clean up when deleting an integration. */
const ALL_SECRET_TYPES: SecretType[] = ['token', 'apikey', 'password', 'client-secret', 'header-value']

// ── OAuth2 Client Credentials token cache ───────────────────────────────────

interface OAuth2CachedToken {
  accessToken: string
  expiresAt: number
}

const oauth2TokenCache = new Map<string, OAuth2CachedToken>()

async function acquireOAuth2ClientCredentialsToken(integration: CustomIntegration): Promise<string> {
  const { id, auth } = integration

  // Check cache first
  const cached = oauth2TokenCache.get(id)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    log.debug('[custom-integration] Using cached OAuth2 token for "%s"', integration.name)
    return cached.accessToken
  }

  if (!auth.oauth2TokenUrl) {
    throw new Error('OAuth2 token URL is not configured.')
  }
  if (!auth.oauth2ClientId) {
    throw new Error('OAuth2 client ID is not configured.')
  }

  const clientSecret = resolveSecret(integration, 'client-secret')
  if (!clientSecret) {
    throw new Error('OAuth2 client secret is not stored. Please save credentials for this integration.')
  }

  log.info('[custom-integration] Acquiring OAuth2 client credentials token for "%s"', integration.name)

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: auth.oauth2ClientId,
    client_secret: clientSecret,
  })
  if (auth.oauth2Scopes) {
    params.set('scope', auth.oauth2Scopes)
  }

  const response = await fetch(auth.oauth2TokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OAuth2 token request failed (${response.status}): ${body || response.statusText}`)
  }

  const data = (await response.json()) as { access_token: string; expires_in?: number }
  const expiresIn = data.expires_in ?? 3600

  oauth2TokenCache.set(id, {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  })

  return data.access_token
}

// ── Auth resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the secret value for an integration.
 * If tokenEnvVar is set, looks up the value from credentialStore under env-{varName}.
 * Otherwise, retrieves from the integration's own secret key.
 */
function resolveSecret(integration: CustomIntegration, overrideType?: SecretType): string {
  if (integration.auth.tokenEnvVar) {
    const envKey = `env-${integration.auth.tokenEnvVar}`
    const envValue = retrieveSecret(envKey)
    if (envValue) {
      log.debug('[custom-integration] Resolved secret from env var "%s" for "%s"', integration.auth.tokenEnvVar, integration.name)
      return envValue
    }
    log.warn('[custom-integration] tokenEnvVar "%s" configured but no value found in credentialStore', integration.auth.tokenEnvVar)
  }

  const sType = overrideType ?? secretTypeForAuth(integration.authType)
  return retrieveSecret(secretKey(integration.id, sType))
}

/**
 * Build auth headers/query params for a request based on the integration's auth type.
 * Returns { headers, queryParams } to be merged into the request.
 */
async function buildAuth(
  integration: CustomIntegration
): Promise<{ headers: Record<string, string>; queryParams: Record<string, string> }> {
  const headers: Record<string, string> = {}
  const queryParams: Record<string, string> = {}

  switch (integration.authType) {
    case 'none':
      break

    case 'api-key': {
      const apiKey = resolveSecret(integration)
      if (!apiKey) {
        throw new Error('API key not found. Please save credentials for this integration.')
      }
      const headerName = integration.auth.apiKeyHeader || 'X-API-Key'
      const location = integration.auth.apiKeyLocation || 'header'
      if (location === 'query') {
        queryParams[headerName] = apiKey
      } else {
        headers[headerName] = apiKey
      }
      break
    }

    case 'bearer': {
      const token = resolveSecret(integration)
      if (!token) {
        throw new Error('Bearer token not found. Please save credentials for this integration.')
      }
      headers['Authorization'] = `Bearer ${token}`
      break
    }

    case 'basic': {
      const password = resolveSecret(integration)
      if (!password) {
        throw new Error('Password not found. Please save credentials for this integration.')
      }
      const username = integration.auth.basicUsername || ''
      const encoded = Buffer.from(`${username}:${password}`).toString('base64')
      headers['Authorization'] = `Basic ${encoded}`
      break
    }

    case 'oauth2-client-creds': {
      const accessToken = await acquireOAuth2ClientCredentialsToken(integration)
      headers['Authorization'] = `Bearer ${accessToken}`
      break
    }

    case 'custom-header': {
      const value = resolveSecret(integration)
      if (!value) {
        throw new Error('Custom header value not found. Please save credentials for this integration.')
      }
      const headerName = integration.auth.customHeaderName || 'X-Custom-Auth'
      headers[headerName] = value
      break
    }
  }

  return { headers, queryParams }
}

// ── Request execution ───────────────────────────────────────────────────────

async function executeRequest(
  integration: CustomIntegration,
  endpoint: CustomEndpoint,
  page?: number
): Promise<{ statusCode: number; headers: Record<string, string>; data: unknown }> {
  const { headers: authHeaders, queryParams: authQuery } = await buildAuth(integration)

  // Build URL
  let baseUrl = integration.baseUrl.replace(/\/+$/, '')
  let path = endpoint.path.startsWith('/') ? endpoint.path : `/${endpoint.path}`

  const url = new URL(`${baseUrl}${path}`)

  // Apply auth query params
  for (const [key, value] of Object.entries(authQuery)) {
    url.searchParams.set(key, value)
  }

  // Apply pagination query params
  if (endpoint.pagination && endpoint.pagination.type !== 'none' && page !== undefined) {
    const pType = endpoint.pagination.type
    const pageParam = endpoint.pagination.pageParam || (pType === 'offset' ? 'offset' : 'page')
    const limitParam = endpoint.pagination.limitParam || 'limit'
    const defaultLimit = endpoint.pagination.defaultLimit || 25

    if (pType === 'offset') {
      url.searchParams.set(pageParam, String(page * defaultLimit))
      url.searchParams.set(limitParam, String(defaultLimit))
    } else if (pType === 'page') {
      url.searchParams.set(pageParam, String(page))
      url.searchParams.set(limitParam, String(defaultLimit))
    } else if (pType === 'cursor') {
      // Cursor-based pagination: page param is the cursor value itself
      if (page > 0) {
        url.searchParams.set(pageParam, String(page))
      }
      url.searchParams.set(limitParam, String(defaultLimit))
    }
  }

  // Build headers
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...authHeaders,
    ...(endpoint.headers ?? {}),
  }

  // Build request options
  const requestInit: RequestInit = {
    method: endpoint.method,
    headers: requestHeaders,
  }

  if (endpoint.method === 'POST' && endpoint.body) {
    requestInit.body = endpoint.body
    if (!requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json'
    }
  }

  log.debug('[custom-integration] %s %s', endpoint.method, url.toString())

  const response = await fetch(url.toString(), requestInit)

  // Extract response headers as plain object
  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })

  let data: unknown
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    data = await response.json()
  } else {
    data = await response.text()
  }

  return {
    statusCode: response.status,
    headers: responseHeaders,
    data,
  }
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerCustomIntegrationHandlers(ipcMain: IpcMain): void {

  // ── List ────────────────────────────────────────────────────────────────

  ipcMain.handle('integration:custom-list', () => {
    log.info('[custom-integration] custom-list: Fetching all integrations')
    const integrations = store.get('integrations')

    return {
      success: true,
      integrations: integrations.map((int) => ({
        id: int.id,
        name: int.name,
        baseUrl: int.baseUrl,
        authType: int.authType,
        endpointCount: int.endpoints.length,
        enabled: int.enabled,
        createdAt: int.createdAt,
        lastTestedAt: int.lastTestedAt,
        lastTestSuccess: int.lastTestSuccess,
        hasCredentials: hasSecret(secretKey(int.id, secretTypeForAuth(int.authType))),
        responseMapping: int.responseMapping,
      })),
    }
  })

  // ── Get ─────────────────────────────────────────────────────────────────

  ipcMain.handle('integration:custom-get', (_e, args: { id: string }) => {
    log.info('[custom-integration] custom-get: id=%s', args.id)
    const integrations = store.get('integrations')
    const integration = integrations.find((int) => int.id === args.id)

    if (!integration) {
      log.warn('[custom-integration] custom-get: Integration not found: %s', args.id)
      return { success: false, error: `Integration not found: ${args.id}` }
    }

    return {
      success: true,
      integration: {
        ...integration,
        hasCredentials: hasSecret(secretKey(integration.id, secretTypeForAuth(integration.authType))),
      },
    }
  })

  // ── Save (Upsert) ──────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:custom-save',
    (_e, args: { integration: CustomIntegration; secret?: string }) => {
      const { integration, secret } = args
      log.info('[custom-integration] custom-save: id=%s name="%s"', integration.id, integration.name)

      const integrations = store.get('integrations')
      const existingIndex = integrations.findIndex((int) => int.id === integration.id)

      if (existingIndex >= 0) {
        // Update existing
        integrations[existingIndex] = integration
        log.info('[custom-integration] custom-save: Updated existing integration "%s"', integration.name)
      } else {
        // Create new
        integrations.push(integration)
        log.info('[custom-integration] custom-save: Created new integration "%s"', integration.name)
      }

      store.set('integrations', integrations)

      // Store secret if provided
      if (secret) {
        const sType = secretTypeForAuth(integration.authType)
        const sKey = secretKey(integration.id, sType)
        storeSecret(sKey, secret)
        log.info('[custom-integration] custom-save: Stored secret type "%s" for "%s"', sType, integration.name)
      }

      return { success: true }
    }
  )

  // ── Delete ──────────────────────────────────────────────────────────────

  ipcMain.handle('integration:custom-delete', (_e, args: { id: string }) => {
    log.info('[custom-integration] custom-delete: id=%s', args.id)
    const integrations = store.get('integrations')
    const filtered = integrations.filter((int) => int.id !== args.id)

    if (filtered.length === integrations.length) {
      log.warn('[custom-integration] custom-delete: Integration not found: %s', args.id)
      return { success: false, error: `Integration not found: ${args.id}` }
    }

    store.set('integrations', filtered)

    // Clean up all associated secrets
    for (const sType of ALL_SECRET_TYPES) {
      const sKey = secretKey(args.id, sType)
      if (hasSecret(sKey)) {
        deleteSecret(sKey)
        log.debug('[custom-integration] custom-delete: Deleted secret "%s"', sKey)
      }
    }

    // Clear any cached OAuth2 tokens
    oauth2TokenCache.delete(args.id)

    log.info('[custom-integration] custom-delete: Deleted integration %s', args.id)
    return { success: true }
  })

  // ── Test ────────────────────────────────────────────────────────────────

  ipcMain.handle('integration:custom-test', async (_e, args: { id: string }) => {
    log.info('[custom-integration] custom-test: id=%s', args.id)
    const integrations = store.get('integrations')
    const integration = integrations.find((int) => int.id === args.id)

    if (!integration) {
      return { success: false, error: `Integration not found: ${args.id}` }
    }

    if (integration.endpoints.length === 0) {
      return { success: false, error: 'No endpoints configured. Add at least one endpoint before testing.' }
    }

    const endpoint = integration.endpoints[0]

    try {
      const result = await executeRequest(integration, endpoint)

      // Update test metadata
      const idx = integrations.findIndex((int) => int.id === args.id)
      if (idx >= 0) {
        integrations[idx].lastTestedAt = Date.now()
        integrations[idx].lastTestSuccess = result.statusCode >= 200 && result.statusCode < 300
        store.set('integrations', integrations)
      }

      // Truncate response preview for large responses
      let preview = result.data
      if (typeof preview === 'object') {
        const json = JSON.stringify(preview, null, 2)
        preview = json.length > 2000 ? json.slice(0, 2000) + '\n... (truncated)' : json
      } else if (typeof preview === 'string' && preview.length > 2000) {
        preview = preview.slice(0, 2000) + '\n... (truncated)'
      }

      log.info(
        '[custom-integration] custom-test: %s %d for "%s"',
        result.statusCode >= 200 && result.statusCode < 300 ? 'OK' : 'FAIL',
        result.statusCode,
        integration.name
      )

      return {
        success: result.statusCode >= 200 && result.statusCode < 300,
        statusCode: result.statusCode,
        preview,
      }
    } catch (err) {
      log.error('[custom-integration] custom-test: Failed for "%s" — %s', integration.name, err)

      // Update test metadata on failure
      const idx = integrations.findIndex((int) => int.id === args.id)
      if (idx >= 0) {
        integrations[idx].lastTestedAt = Date.now()
        integrations[idx].lastTestSuccess = false
        store.set('integrations', integrations)
      }

      return { success: false, error: String(err) }
    }
  })

  // ── Fetch ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:custom-fetch',
    async (_e, args: { id: string; endpointId: string; page?: number }) => {
      log.info(
        '[custom-integration] custom-fetch: id=%s endpointId=%s page=%s',
        args.id,
        args.endpointId,
        args.page ?? 'none'
      )
      const integrations = store.get('integrations')
      const integration = integrations.find((int) => int.id === args.id)

      if (!integration) {
        return { success: false, error: `Integration not found: ${args.id}` }
      }

      if (!integration.enabled) {
        return { success: false, error: `Integration "${integration.name}" is disabled.` }
      }

      const endpoint = integration.endpoints.find((ep) => ep.id === args.endpointId)
      if (!endpoint) {
        return { success: false, error: `Endpoint not found: ${args.endpointId}` }
      }

      try {
        const result = await executeRequest(integration, endpoint, args.page)

        return {
          success: result.statusCode >= 200 && result.statusCode < 300,
          data: result.data,
          statusCode: result.statusCode,
          headers: result.headers,
        }
      } catch (err) {
        log.error(
          '[custom-integration] custom-fetch: Failed for "%s" endpoint "%s" — %s',
          integration.name,
          endpoint.label,
          err
        )
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Duplicate ───────────────────────────────────────────────────────────

  ipcMain.handle('integration:custom-duplicate', (_e, args: { id: string }) => {
    log.info('[custom-integration] custom-duplicate: id=%s', args.id)
    const integrations = store.get('integrations')
    const source = integrations.find((int) => int.id === args.id)

    if (!source) {
      return { success: false, error: `Integration not found: ${args.id}` }
    }

    const newId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const duplicate: CustomIntegration = {
      ...structuredClone(source),
      id: newId,
      name: `${source.name} (Copy)`,
      createdAt: Date.now(),
      lastTestedAt: undefined,
      lastTestSuccess: undefined,
    }

    // Generate new IDs for endpoints too
    duplicate.endpoints = duplicate.endpoints.map((ep) => ({
      ...ep,
      id: `ep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }))

    integrations.push(duplicate)
    store.set('integrations', integrations)

    // NOTE: Secrets are intentionally NOT copied for security
    log.info(
      '[custom-integration] custom-duplicate: Duplicated "%s" as "%s" (id=%s). Secrets NOT copied.',
      source.name,
      duplicate.name,
      newId
    )

    return { success: true, integration: duplicate }
  })
}
