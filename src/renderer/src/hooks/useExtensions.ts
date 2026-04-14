import { useState, useEffect, useCallback } from 'react'

/** Mirrors the InstalledExtension type from the main process. */
export interface InstalledExtension {
  manifest: {
    id: string
    name: string
    version: string
    description: string
    author: string
    icon?: string
    minAppVersion?: string
    main?: string
    renderer?: string
    permissions: string[]
    allowedDomains?: string[]
    contributes?: {
      navigation?: Array<{
        id: string
        path: string
        label: string
        icon: string
        position?: string
        featureGate?: string[]
      }>
      panels?: Array<{
        id: string
        slot: string
        label: string
        component: string
      }>
      widgets?: Array<{
        id: string
        name: string
        description: string
        defaultSize: { w: number; h: number }
        component: string
      }>
      featureFlags?: string[]
      tabs?: Array<{
        id: string
        page: string
        label: string
        component: string
        position?: 'start' | 'end' | number
      }>
      sidebarWidgets?: Array<{
        id: string
        label: string
        component: string
        position?: 'status' | 'bottom'
      }>
      sessionHooks?: Array<{
        event: 'session:started' | 'session:stopped' | 'turn:started' | 'turn:ended'
        handler: string
      }>
      contextProviders?: Array<{
        id: string
        label: string
        description: string
        icon: string
        parameters: Array<{
          id: string
          label: string
          type: 'text' | 'repo-picker' | 'project-picker' | 'select'
          required?: boolean
          options?: Array<{ value: string; label: string }>
          placeholder?: string
        }>
        handler: string
        examples: string[]
        maxTokenEstimate?: number
      }>
    }
    requires?: Array<{
      integration: string
      label: string
      message: string
    }>
    ipcNamespace?: string
    ipcChannels?: string[]
    storageQuota?: number
  }
  installPath: string
  source: 'bundled' | 'user'
  enabled: boolean
  installedAt: number
  manifestHash: string
  grantedPermissions: string[]
  deniedPermissions: string[]
  errorCount: number
  lastError: string | null
}

export interface RequirementCheckResult {
  met: boolean
  results: Array<{
    integration: string
    label: string
    message: string
    met: boolean
  }>
}

interface UseExtensionsResult {
  extensions: InstalledExtension[]
  enabledExtensions: InstalledExtension[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  toggle: (extensionId: string, enabled: boolean) => Promise<void>
  uninstall: (extensionId: string) => Promise<void>
  install: () => Promise<InstalledExtension | null>
  updatePermissions: (extensionId: string, granted: string[], denied: string[]) => Promise<void>
  checkRequirements: (extensionId: string) => Promise<RequirementCheckResult>
}

/**
 * Hook that provides the extension list and management operations.
 * Components use this to access extension data reactively.
 */
export function useExtensions(): UseExtensionsResult {
  const [extensions, setExtensions] = useState<InstalledExtension[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const result = await window.electronAPI.invoke('extension:list') as {
        success: boolean
        data?: InstalledExtension[]
        error?: string
      }
      if (result.success && result.data) {
        setExtensions(result.data)
        setError(null)
      } else {
        setError(result.error ?? 'Failed to load extensions')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const toggle = useCallback(async (extensionId: string, enabled: boolean) => {
    const result = await window.electronAPI.invoke('extension:toggle', { extensionId, enabled }) as {
      success: boolean
      error?: string
    }
    if (!result.success) throw new Error(result.error)
    await refresh()
  }, [refresh])

  const uninstall = useCallback(async (extensionId: string) => {
    const result = await window.electronAPI.invoke('extension:uninstall', { extensionId }) as {
      success: boolean
      error?: string
    }
    if (!result.success) throw new Error(result.error)
    await refresh()
  }, [refresh])

  const install = useCallback(async (): Promise<InstalledExtension | null> => {
    const result = await window.electronAPI.invoke('extension:install') as {
      success: boolean
      data?: InstalledExtension
      error?: string
    }
    if (!result.success && result.error !== 'Installation cancelled') {
      throw new Error(result.error)
    }
    await refresh()
    return result.data ?? null
  }, [refresh])

  const updatePermissions = useCallback(
    async (extensionId: string, granted: string[], denied: string[]) => {
      const result = await window.electronAPI.invoke('extension:update-permissions', {
        extensionId,
        granted,
        denied,
      }) as { success: boolean; error?: string }
      if (!result.success) throw new Error(result.error)
      await refresh()
    },
    [refresh],
  )

  const checkRequirements = useCallback(async (extensionId: string): Promise<RequirementCheckResult> => {
    try {
      const result = await window.electronAPI.invoke('extension:check-requirements', { extensionId }) as {
        success: boolean
        data?: RequirementCheckResult
        error?: string
      }
      if (result.success && result.data) return result.data
      return { met: true, results: [] }
    } catch {
      return { met: true, results: [] }
    }
  }, [])

  const enabledExtensions = extensions.filter((e) => e.enabled)

  return {
    extensions,
    enabledExtensions,
    loading,
    error,
    refresh,
    toggle,
    uninstall,
    install,
    updatePermissions,
    checkRequirements,
  }
}
