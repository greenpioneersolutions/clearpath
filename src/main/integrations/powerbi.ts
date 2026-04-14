import type { IpcMain, WebContents } from 'electron'
import { BrowserWindow } from 'electron'
import Store from 'electron-store'
import { storeSecret, retrieveSecret, deleteSecret, hasSecret } from '../utils/credentialStore'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'
import { systemFetch } from '../utils/electronFetch'

// ── Types ───────────────────────────────────────────────────────────────────

interface PowerBIMetadata {
  userPrincipalName: string
  tenantId: string
  connected: boolean
  connectedAt: number
  clientId: string
}

interface PowerBIStoreSchema {
  powerbi: PowerBIMetadata | null
}

interface PowerBIWorkspace {
  id: string
  name: string
  isReadOnly: boolean
  type: string
}

interface PowerBIDataset {
  id: string
  name: string
  configuredBy: string
  isRefreshable: boolean
  isOnPremGatewayRequired: boolean
  webUrl: string
}

interface PowerBIReport {
  id: string
  name: string
  datasetId: string
  reportType: string
  webUrl: string
  embedUrl: string
}

interface PowerBIDashboard {
  id: string
  displayName: string
  isReadOnly: boolean
  webUrl: string
  embedUrl: string
}

interface PowerBITile {
  id: string
  title: string
  reportId: string
  datasetId: string
  embedUrl: string
}

interface PowerBIRefresh {
  id: number
  refreshType: string
  startTime: string
  endTime: string
  status: string
  requestId: string
}

interface PowerBIDataflow {
  objectId: string
  name: string
  description: string
  configuredBy: string
  modifiedBy: string
  modifiedDateTime: string
}

interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  message: string
}

// ── Constants ───────────────────────────────────────────────────────────────

const POWER_BI_API_BASE = 'https://api.powerbi.com/v1.0/myorg'

const POWER_BI_SCOPES = [
  'https://analysis.windows.net/powerbi/api/.default',
  'offline_access',
]

// Placeholder Azure AD client ID. Users can override this via the clientId
// argument to integration:powerbi-connect, or by registering their own
// Azure AD app (public client, Mobile & Desktop redirect URI).
const DEFAULT_CLIENT_ID = 'YOUR_AZURE_CLIENT_ID'

const MSAL_CACHE_KEY = 'powerbi-msal-cache'

// ── Store ───────────────────────────────────────────────────────────────────

const store = new Store<PowerBIStoreSchema>({
  name: 'clear-path-integrations',
  defaults: { powerbi: null },
  encryptionKey: getStoreEncryptionKey(),
})

// ── MSAL helpers ────────────────────────────────────────────────────────────

// Lazily imported to avoid crashing if @azure/msal-node is not installed.
// We use `require()` behind a try/catch at runtime. Type safety is achieved
// via a minimal interface that mirrors the subset of MSAL we actually use.

interface MSALTokenCacheInterface {
  getAllAccounts(): Promise<MSALAccountInfo[]>
  deserialize(data: string): Promise<void>
  serialize(): Promise<string>
}

interface MSALAccountInfo {
  homeAccountId: string
  username: string
  tenantId: string
}

interface MSALDeviceCodeCallbackParams {
  userCode: string
  verificationUri: string
  message: string
}

interface MSALAuthResult {
  accessToken: string
  account: MSALAccountInfo | null
}

interface MSALAppInterface {
  acquireTokenByDeviceCode(request: {
    scopes: string[]
    deviceCodeCallback: (response: MSALDeviceCodeCallbackParams) => void
  }): Promise<MSALAuthResult | null>
  acquireTokenSilent(request: {
    account: MSALAccountInfo
    scopes: string[]
  }): Promise<MSALAuthResult | null>
  getTokenCache(): MSALTokenCacheInterface
}

interface MSALModule {
  PublicClientApplication: new (config: {
    auth: { clientId: string; authority: string }
  }) => MSALAppInterface
}

let msalApp: MSALAppInterface | null = null
let msalModule: MSALModule | null = null

async function getMSAL(): Promise<MSALModule> {
  if (msalModule) return msalModule
  try {
    // Dynamic require — works whether @azure/msal-node is installed or not.
    // Using require() avoids TS2307 when the module is not installed at build time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    msalModule = require('@azure/msal-node') as MSALModule
    return msalModule
  } catch (err) {
    throw new Error(
      'The @azure/msal-node package is required for Power BI integration. ' +
      'Install it with: npm install @azure/msal-node'
    )
  }
}

async function buildMSALApp(clientId: string, tenantId?: string): Promise<MSALAppInterface> {
  const msal = await getMSAL()
  const authority = tenantId
    ? `https://login.microsoftonline.com/${tenantId}`
    : 'https://login.microsoftonline.com/organizations'

  const app = new msal.PublicClientApplication({
    auth: {
      clientId,
      authority,
    },
  })

  // Restore cached tokens from credentialStore if available
  const cachedData = retrieveSecret(MSAL_CACHE_KEY)
  if (cachedData) {
    try {
      const tokenCache = app.getTokenCache()
      await tokenCache.deserialize(cachedData)
      log.debug('[powerbi] Restored MSAL token cache from credentialStore')
    } catch (err) {
      log.warn('[powerbi] Failed to deserialize MSAL cache — starting fresh: %s', err)
    }
  }

  return app
}

async function persistMSALCache(app: MSALAppInterface): Promise<void> {
  try {
    const tokenCache = app.getTokenCache()
    const serialized = await tokenCache.serialize()
    storeSecret(MSAL_CACHE_KEY, serialized)
    log.debug('[powerbi] Persisted MSAL token cache to credentialStore')
  } catch (err) {
    log.warn('[powerbi] Failed to persist MSAL cache: %s', err)
  }
}

async function getAccessToken(): Promise<string> {
  if (!msalApp) {
    throw new Error('Power BI is not connected. Please connect first via Configure > Integrations.')
  }

  const accounts = await msalApp.getTokenCache().getAllAccounts()
  if (accounts.length === 0) {
    throw new Error('No Power BI accounts found in cache. Please reconnect.')
  }

  try {
    const result = await msalApp.acquireTokenSilent({
      account: accounts[0],
      scopes: POWER_BI_SCOPES,
    })

    if (!result?.accessToken) {
      throw new Error('Silent token acquisition returned no access token.')
    }

    // Persist the refreshed cache
    await persistMSALCache(msalApp)

    return result.accessToken
  } catch (err) {
    log.error('[powerbi] Silent token acquisition failed — user may need to reconnect: %s', err)
    throw new Error(
      'Power BI session expired or was revoked. Please disconnect and reconnect in Configure > Integrations.'
    )
  }
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function powerBIFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken()
  const url = `${POWER_BI_API_BASE}${path}`

  log.debug('[powerbi] GET %s', url)
  const response = await systemFetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    log.error('[powerbi] API error %d for %s: %s', response.status, path, body)
    throw new Error(`Power BI API error ${response.status}: ${body || response.statusText}`)
  }

  return response.json() as Promise<T>
}

function sendToAllRenderers(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    const wc: WebContents = win.webContents
    wc.send(channel, data)
  }
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerPowerBIHandlers(ipcMain: IpcMain): void {

  // Restore MSAL app from persisted state on startup
  const meta = store.get('powerbi')
  if (meta?.connected && meta.clientId) {
    buildMSALApp(meta.clientId, meta.tenantId)
      .then((app) => {
        msalApp = app
        log.info('[powerbi] Restored MSAL app for user "%s"', meta.userPrincipalName)
      })
      .catch((err) => {
        log.warn('[powerbi] Failed to restore MSAL app on startup: %s', err)
      })
  }

  // ── Connect (Device Code Flow) ──────────────────────────────────────────

  ipcMain.handle(
    'integration:powerbi-connect',
    async (_e, args?: { clientId?: string; tenantId?: string }) => {
      const clientId = args?.clientId || DEFAULT_CLIENT_ID
      const tenantId = args?.tenantId

      log.info(
        '[powerbi] powerbi-connect: Starting device code flow (clientId=%s, tenantId=%s)',
        clientId.slice(0, 8) + '...',
        tenantId ?? 'organizations'
      )

      try {
        const app = await buildMSALApp(clientId, tenantId)

        // acquireTokenByDeviceCode is async and long-running.
        // We return the device code info immediately via IPC push,
        // then complete auth in the background.
        let deviceCodeSent = false

        const tokenPromise = app.acquireTokenByDeviceCode({
          scopes: POWER_BI_SCOPES,
          deviceCodeCallback: (response: MSALDeviceCodeCallbackParams) => {
            log.info('[powerbi] Device code received: %s', response.message)
            deviceCodeSent = true

            // Push device code to renderer so the user can authenticate
            sendToAllRenderers('integration:powerbi-device-code', {
              userCode: response.userCode,
              verificationUri: response.verificationUri,
              message: response.message,
            })
          },
        })

        // Return immediately so the renderer can show the device code.
        // The actual auth completion happens asynchronously below.
        // We use setImmediate to allow the handle to return first.
        const handleAuthCompletion = async (): Promise<void> => {
          try {
            const result = await tokenPromise

            if (!result?.account) {
              throw new Error('Device code flow completed but no account was returned.')
            }

            // Persist MSAL cache
            msalApp = app
            await persistMSALCache(app)

            // Validate by calling the Power BI API
            const token = result.accessToken
            log.info('[powerbi] Validating Power BI access...')
            const validateResponse = await systemFetch(`${POWER_BI_API_BASE}/groups`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
              },
            })

            if (!validateResponse.ok) {
              const body = await validateResponse.text().catch(() => '')
              throw new Error(
                `Power BI API validation failed (${validateResponse.status}): ${body || validateResponse.statusText}`
              )
            }

            // Store metadata
            const metadata: PowerBIMetadata = {
              userPrincipalName: result.account.username || result.account.homeAccountId,
              tenantId: result.account.tenantId || tenantId || '',
              connected: true,
              connectedAt: Date.now(),
              clientId,
            }
            store.set('powerbi', metadata)

            log.info('[powerbi] Connected as "%s"', metadata.userPrincipalName)

            sendToAllRenderers('integration:powerbi-auth-complete', {
              success: true,
              userPrincipalName: metadata.userPrincipalName,
            })
          } catch (err) {
            log.error('[powerbi] Device code auth completion failed: %s', err)
            sendToAllRenderers('integration:powerbi-auth-complete', {
              success: false,
              error: String(err),
            })
          }
        }

        // Kick off async completion handler
        setImmediate(() => {
          handleAuthCompletion().catch((err) => {
            log.error('[powerbi] Unhandled error in auth completion: %s', err)
          })
        })

        // Return device code info (may not be available yet if callback hasn't fired)
        // The renderer should listen for the 'integration:powerbi-device-code' push event
        return {
          success: true,
          pending: true,
          message: 'Device code flow initiated. Watch for the integration:powerbi-device-code event.',
        }
      } catch (err) {
        log.error('[powerbi] powerbi-connect: Failed — %s', err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Disconnect ──────────────────────────────────────────────────────────

  ipcMain.handle('integration:powerbi-disconnect', () => {
    log.info('[powerbi] powerbi-disconnect: Clearing MSAL cache and connection state')
    deleteSecret(MSAL_CACHE_KEY)
    store.set('powerbi', null)
    msalApp = null
    return { success: true }
  })

  // ── Workspaces (Groups) ─────────────────────────────────────────────────

  ipcMain.handle('integration:powerbi-workspaces', async () => {
    log.info('[powerbi] powerbi-workspaces: Fetching workspaces')
    try {
      const data = await powerBIFetch<{ value: PowerBIWorkspace[] }>('/groups')
      log.info('[powerbi] powerbi-workspaces: Received %d workspaces', data.value.length)
      return {
        success: true,
        workspaces: data.value.map((w) => ({
          id: w.id,
          name: w.name,
          isReadOnly: w.isReadOnly,
          type: w.type,
        })),
      }
    } catch (err) {
      log.error('[powerbi] powerbi-workspaces: Failed — %s', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Datasets ────────────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:powerbi-datasets',
    async (_e, args: { groupId: string }) => {
      log.info('[powerbi] powerbi-datasets: groupId=%s', args.groupId)
      try {
        const data = await powerBIFetch<{ value: PowerBIDataset[] }>(
          `/groups/${encodeURIComponent(args.groupId)}/datasets`
        )
        log.info('[powerbi] powerbi-datasets: Received %d datasets', data.value.length)
        return {
          success: true,
          datasets: data.value.map((d) => ({
            id: d.id,
            name: d.name,
            configuredBy: d.configuredBy,
            isRefreshable: d.isRefreshable,
            isOnPremGatewayRequired: d.isOnPremGatewayRequired,
            webUrl: d.webUrl,
          })),
        }
      } catch (err) {
        log.error('[powerbi] powerbi-datasets: Failed — %s', err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Reports ─────────────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:powerbi-reports',
    async (_e, args: { groupId: string }) => {
      log.info('[powerbi] powerbi-reports: groupId=%s', args.groupId)
      try {
        const data = await powerBIFetch<{ value: PowerBIReport[] }>(
          `/groups/${encodeURIComponent(args.groupId)}/reports`
        )
        log.info('[powerbi] powerbi-reports: Received %d reports', data.value.length)
        return {
          success: true,
          reports: data.value.map((r) => ({
            id: r.id,
            name: r.name,
            datasetId: r.datasetId,
            reportType: r.reportType,
            webUrl: r.webUrl,
            embedUrl: r.embedUrl,
          })),
        }
      } catch (err) {
        log.error('[powerbi] powerbi-reports: Failed — %s', err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Dashboards ──────────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:powerbi-dashboards',
    async (_e, args: { groupId: string }) => {
      log.info('[powerbi] powerbi-dashboards: groupId=%s', args.groupId)
      try {
        const data = await powerBIFetch<{ value: PowerBIDashboard[] }>(
          `/groups/${encodeURIComponent(args.groupId)}/dashboards`
        )
        log.info('[powerbi] powerbi-dashboards: Received %d dashboards', data.value.length)
        return {
          success: true,
          dashboards: data.value.map((d) => ({
            id: d.id,
            displayName: d.displayName,
            isReadOnly: d.isReadOnly,
            webUrl: d.webUrl,
            embedUrl: d.embedUrl,
          })),
        }
      } catch (err) {
        log.error('[powerbi] powerbi-dashboards: Failed — %s', err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Tiles ───────────────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:powerbi-tiles',
    async (_e, args: { groupId: string; dashboardId: string }) => {
      log.info('[powerbi] powerbi-tiles: groupId=%s dashboardId=%s', args.groupId, args.dashboardId)
      try {
        const data = await powerBIFetch<{ value: PowerBITile[] }>(
          `/groups/${encodeURIComponent(args.groupId)}/dashboards/${encodeURIComponent(args.dashboardId)}/tiles`
        )
        log.info('[powerbi] powerbi-tiles: Received %d tiles', data.value.length)
        return {
          success: true,
          tiles: data.value.map((t) => ({
            id: t.id,
            title: t.title,
            reportId: t.reportId,
            datasetId: t.datasetId,
            embedUrl: t.embedUrl,
          })),
        }
      } catch (err) {
        log.error('[powerbi] powerbi-tiles: Failed — %s', err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Refresh History ─────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:powerbi-refresh-history',
    async (_e, args: { groupId: string; datasetId: string }) => {
      log.info('[powerbi] powerbi-refresh-history: groupId=%s datasetId=%s', args.groupId, args.datasetId)
      try {
        const data = await powerBIFetch<{ value: PowerBIRefresh[] }>(
          `/groups/${encodeURIComponent(args.groupId)}/datasets/${encodeURIComponent(args.datasetId)}/refreshes`
        )
        log.info('[powerbi] powerbi-refresh-history: Received %d refresh records', data.value.length)
        return {
          success: true,
          refreshes: data.value.map((r) => ({
            id: r.id,
            refreshType: r.refreshType,
            startTime: r.startTime,
            endTime: r.endTime,
            status: r.status,
            requestId: r.requestId,
          })),
        }
      } catch (err) {
        log.error('[powerbi] powerbi-refresh-history: Failed — %s', err)
        return { success: false, error: String(err) }
      }
    }
  )

  // ── Dataflows ───────────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:powerbi-dataflows',
    async (_e, args: { groupId: string }) => {
      log.info('[powerbi] powerbi-dataflows: groupId=%s', args.groupId)
      try {
        const data = await powerBIFetch<{ value: PowerBIDataflow[] }>(
          `/groups/${encodeURIComponent(args.groupId)}/dataflows`
        )
        log.info('[powerbi] powerbi-dataflows: Received %d dataflows', data.value.length)
        return {
          success: true,
          dataflows: data.value.map((d) => ({
            objectId: d.objectId,
            name: d.name,
            description: d.description,
            configuredBy: d.configuredBy,
            modifiedBy: d.modifiedBy,
            modifiedDateTime: d.modifiedDateTime,
          })),
        }
      } catch (err) {
        log.error('[powerbi] powerbi-dataflows: Failed — %s', err)
        return { success: false, error: String(err) }
      }
    }
  )
}
