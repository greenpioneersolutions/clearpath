import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { getIntegrationContextProviders, fetchIntegrationContext } from '../integrations/contextProviderRegistry'
import type { ExtensionRegistry } from '../extensions/ExtensionRegistry'
import { log } from '../utils/logger'

// ── Context Source Handlers ──────────────────────────────────────────────────
// Unified API for listing and fetching context from both extensions and
// built-in integrations. Extensions declare contextProviders in their manifest;
// integrations register them in the contextProviderRegistry.

const integrationStore = new Store({
  name: 'clear-path-integrations',
  encryptionKey: getStoreEncryptionKey(),
  defaults: { connections: {} },
})

export function registerContextSourceHandlers(
  ipcMain: IpcMain,
  extensionRegistry: ExtensionRegistry,
): void {
  // ── List all available context providers ────────────────────────────────
  ipcMain.handle('context-sources:list', async () => {
    const providers: Array<{
      id: string
      label: string
      description: string
      icon: string
      source: 'extension' | 'integration'
      sourceId: string
      sourceName: string
      parameters: unknown[]
      handler: string
      examples: string[]
      maxTokenEstimate?: number
      connected: boolean
    }> = []

    // 1. Extension-contributed context providers
    const enabledExts = extensionRegistry.listEnabled()
    for (const ext of enabledExts) {
      const cps = ext.manifest.contributes?.contextProviders
      if (!cps) continue

      for (const cp of cps) {
        providers.push({
          id: `ext:${ext.manifest.id}:${cp.id}`,
          label: cp.label,
          description: cp.description,
          icon: cp.icon,
          source: 'extension',
          sourceId: ext.manifest.id,
          sourceName: ext.manifest.name,
          parameters: cp.parameters,
          handler: cp.handler,
          examples: cp.examples,
          maxTokenEstimate: cp.maxTokenEstimate,
          connected: true, // Extension is enabled = connected
        })
      }
    }

    // 2. Built-in integration context providers
    const integrationProviders = getIntegrationContextProviders()
    const connections = integrationStore.get('connections', {}) as Record<string, { connected?: boolean }>

    for (const ip of integrationProviders) {
      const conn = connections[ip.integrationKey]
      const connected = conn?.connected === true

      providers.push({
        id: `int:${ip.id}`,
        label: ip.label,
        description: ip.description,
        icon: ip.icon,
        source: 'integration',
        sourceId: ip.integrationKey,
        sourceName: ip.integrationKey.charAt(0).toUpperCase() + ip.integrationKey.slice(1),
        parameters: ip.parameters,
        handler: ip.id,
        examples: ip.examples,
        maxTokenEstimate: ip.maxTokenEstimate,
        connected,
      })
    }

    return providers
  })

  // ── Fetch context from a single provider ───────────────────────────────
  ipcMain.handle(
    'context-sources:fetch',
    async (_event, args: { providerId: string; params: Record<string, string> }) => {
      return fetchContextSource(args.providerId, args.params, extensionRegistry)
    },
  )

  // ── Fetch context from multiple providers in parallel ──────────────────
  ipcMain.handle(
    'context-sources:fetch-multi',
    async (
      _event,
      args: Array<{ providerId: string; params: Record<string, string> }>,
    ) => {
      const results = await Promise.all(
        args.map((a) => fetchContextSource(a.providerId, a.params, extensionRegistry)),
      )
      return results
    },
  )
}

async function fetchContextSource(
  providerId: string,
  params: Record<string, string>,
  extensionRegistry: ExtensionRegistry,
): Promise<{
  success: boolean
  providerId: string
  context: string
  tokenEstimate: number
  error?: string
  metadata?: { itemCount?: number; truncated?: boolean }
}> {
  try {
    // Extension context provider: ext:<extensionId>:<providerId>
    if (providerId.startsWith('ext:')) {
      const parts = providerId.split(':')
      const extensionId = parts[1]
      const ext = extensionRegistry.get(extensionId)
      if (!ext || !ext.enabled) {
        return { success: false, providerId, context: '', tokenEstimate: 0, error: 'Extension not enabled' }
      }

      const cp = ext.manifest.contributes?.contextProviders?.find((c) => c.id === parts.slice(2).join(':'))
      if (!cp) {
        return { success: false, providerId, context: '', tokenEstimate: 0, error: 'Context provider not found' }
      }

      // Call the extension's handler via ipcMain
      const { ipcMain } = require('electron')
      const result = await new Promise<unknown>((resolve, reject) => {
        const handler = (ipcMain as unknown as { _invokeHandlers?: Map<string, Function> })._invokeHandlers?.get(cp.handler)
        if (handler) {
          Promise.resolve(handler({}, params)).then(resolve).catch(reject)
        } else {
          reject(new Error(`Extension handler not registered: ${cp.handler}`))
        }
      }) as { success?: boolean; context?: string; tokenEstimate?: number; metadata?: unknown }

      const context = result?.context ?? (typeof result === 'string' ? result : JSON.stringify(result))
      const tokenEstimate = result?.tokenEstimate ?? Math.ceil(context.length / 4)

      return {
        success: result?.success !== false,
        providerId,
        context,
        tokenEstimate,
        metadata: result?.metadata as { itemCount?: number; truncated?: boolean } | undefined,
      }
    }

    // Integration context provider: int:<providerId>
    if (providerId.startsWith('int:')) {
      const intProviderId = providerId.slice(4)
      const result = await fetchIntegrationContext(intProviderId, params)
      return { ...result, providerId }
    }

    return { success: false, providerId, context: '', tokenEstimate: 0, error: 'Unknown provider type' }
  } catch (err) {
    log.error('[context-sources] Fetch failed for "%s": %s', providerId, err)
    return { success: false, providerId, context: '', tokenEstimate: 0, error: String(err) }
  }
}
