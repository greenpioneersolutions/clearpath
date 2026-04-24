import { useCallback, useEffect, useState } from 'react'

export interface McpExternalChange {
  path: string
  cli: 'copilot' | 'claude'
  scope: 'global' | 'project'
}

/**
 * Subscribes to the `mcp:external-changes-detected` main-process event and
 * surfaces the detected changes to callers. Also exposes `adopt` / `overwrite`
 * helpers that trigger the corresponding `mcp:sync-now` flow and clear the
 * local banner state.
 */
export function useMcpExternalChanges() {
  const [changes, setChanges] = useState<McpExternalChange[]>([])

  useEffect(() => {
    const unsubscribe = window.electronAPI.on('mcp:external-changes-detected', (payload: unknown) => {
      if (Array.isArray(payload)) {
        setChanges(payload as McpExternalChange[])
      }
    })
    return () => {
      try {
        if (typeof unsubscribe === 'function') unsubscribe()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const clear = useCallback(() => setChanges([]), [])

  const adopt = useCallback(async () => {
    await window.electronAPI.invoke('mcp:sync-now', { reimport: true })
    clear()
  }, [clear])

  const overwrite = useCallback(async () => {
    await window.electronAPI.invoke('mcp:sync-now')
    clear()
  }, [clear])

  return { changes, adopt, overwrite, clear }
}
