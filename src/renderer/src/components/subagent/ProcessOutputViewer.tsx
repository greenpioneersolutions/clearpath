import { useEffect, useRef, useState, useCallback } from 'react'
import type { ParsedOutput } from '../../types/ipc'
import OutputDisplay, { type OutputMessage } from '../OutputDisplay'

interface Props {
  subAgentId: string
  /** If true, this is a standalone pop-out window view. */
  isPopout?: boolean
}

export default function ProcessOutputViewer({ subAgentId, isPopout }: Props): JSX.Element {
  const [messages, setMessages] = useState<OutputMessage[]>([])
  const [loading, setLoading] = useState(true)
  const counterRef = useRef(0)

  // Load existing output log
  useEffect(() => {
    void (async () => {
      const raw = await window.electronAPI.invoke('subagent:get-output', { id: subAgentId })
      const log: ParsedOutput[] = Array.isArray(raw) ? raw as ParsedOutput[] : []
      const msgs: OutputMessage[] = log.map((output, i) => ({
        id: String(i),
        output,
      }))
      counterRef.current = msgs.length
      setMessages(msgs)
      setLoading(false)
    })()
  }, [subAgentId])

  // Listen for new output
  useEffect(() => {
    const off = window.electronAPI.on(
      'subagent:output',
      (data: { id: string; output: ParsedOutput }) => {
        if (data.id !== subAgentId) return
        const msg: OutputMessage = {
          id: String(counterRef.current++),
          output: data.output,
        }
        setMessages((prev) => [...prev, msg])
      },
    )
    return off
  }, [subAgentId])

  const handlePermissionResponse = useCallback(
    (response: 'y' | 'n') => {
      void window.electronAPI.invoke('subagent:resume', {
        id: subAgentId,
        prompt: response,
      })
    },
    [subAgentId],
  )

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
        Loading output...
      </div>
    )
  }

  return (
    <div className={isPopout ? 'h-screen' : 'h-80'}>
      <OutputDisplay messages={messages} onPermissionResponse={handlePermissionResponse} />
    </div>
  )
}
