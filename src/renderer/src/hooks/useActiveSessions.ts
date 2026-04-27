import { useEffect, useState, useCallback, useRef } from 'react'
import type { SessionInfo } from '../types/ipc'

export type SessionStatus = 'idle' | 'processing' | 'awaiting-permission' | 'error'

export interface UseActiveSessions {
  sessions: SessionInfo[]
  statusById: Record<string, SessionStatus>
}

/**
 * Tracks the live set of running sessions and their per-session activity
 * status. The renderer needs this for the global ActiveSessionsBanner so
 * the bar reflects what the CLI is actually doing in real time.
 *
 * Strategy:
 *  - Refetch `cli:list-sessions` whenever any cli:* lifecycle event fires.
 *  - Maintain a separate `statusById` map updated synchronously so chips
 *    can pulse before the next refetch round-trip completes.
 *  - Poll every 5s as a backstop in case main emits a session-start-style
 *    event we don't subscribe to (no such IPC event exists today, but the
 *    poll ensures new sessions still appear without an extra event).
 */
export function useActiveSessions(): UseActiveSessions {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [statusById, setStatusById] = useState<Record<string, SessionStatus>>({})
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const list = (await window.electronAPI.invoke('cli:list-sessions')) as SessionInfo[] | null
      if (!mountedRef.current) return
      const running = (Array.isArray(list) ? list : []).filter((s) => s.status === 'running')
      setSessions(running)
      setStatusById((prev) => {
        const runningIds = new Set(running.map((s) => s.sessionId))
        const next: Record<string, SessionStatus> = {}
        for (const id of Object.keys(prev)) {
          if (runningIds.has(id)) next[id] = prev[id]
        }
        for (const s of running) {
          if (!(s.sessionId in next)) next[s.sessionId] = 'idle'
        }
        return next
      })
    } catch {
      if (!mountedRef.current) return
      setSessions([])
      setStatusById({})
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refresh()

    const setStatus = (sessionId: string, status: SessionStatus) => {
      setStatusById((prev) => ({ ...prev, [sessionId]: status }))
    }

    const onTurnStart = ({ sessionId }: { sessionId: string }) => {
      setStatus(sessionId, 'processing')
      void refresh()
    }
    const onTurnEnd = ({ sessionId }: { sessionId: string }) => {
      setStatus(sessionId, 'idle')
      void refresh()
    }
    const onPermission = ({ sessionId }: { sessionId: string }) => {
      setStatus(sessionId, 'awaiting-permission')
      void refresh()
    }
    const onError = ({ sessionId }: { sessionId: string }) => {
      setStatus(sessionId, 'error')
      void refresh()
    }
    const onExit = (_data: unknown) => {
      void refresh()
    }

    const cleanup = [
      window.electronAPI.on('cli:turn-start', onTurnStart as (data: unknown) => void),
      window.electronAPI.on('cli:turn-end', onTurnEnd as (data: unknown) => void),
      window.electronAPI.on('cli:permission-request', onPermission as (data: unknown) => void),
      window.electronAPI.on('cli:error', onError as (data: unknown) => void),
      window.electronAPI.on('cli:exit', onExit),
    ]

    const interval = setInterval(() => {
      void refresh()
    }, 5000)

    return () => {
      mountedRef.current = false
      cleanup.forEach((fn) => fn())
      clearInterval(interval)
    }
  }, [refresh])

  return { sessions, statusById }
}
