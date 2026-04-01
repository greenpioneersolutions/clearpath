import { useEffect, useRef } from 'react'
import type { ParsedOutput } from '../types/ipc'

export interface OutputMessage {
  id: string
  output: ParsedOutput
}

interface Props {
  messages: OutputMessage[]
  onPermissionResponse: (response: 'y' | 'n') => void
}

export default function OutputDisplay({ messages, onPermissionResponse }: Props): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-0.5 font-mono text-sm bg-gray-950">
      {messages.length === 0 && (
        <p className="text-gray-600 text-center mt-16">Session started — type a message below</p>
      )}
      {messages.map((msg) => (
        <OutputLine key={msg.id} output={msg.output} onPermissionResponse={onPermissionResponse} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function OutputLine({
  output,
  onPermissionResponse,
}: {
  output: ParsedOutput
  onPermissionResponse: (r: 'y' | 'n') => void
}): JSX.Element {
  switch (output.type) {
    case 'text':
      if (!output.content) return <></>
      return (
        <pre className="text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
          {output.content}
        </pre>
      )

    case 'thinking':
      if (!output.content) return <></>
      return (
        <pre className="text-gray-500 italic text-xs whitespace-pre-wrap leading-relaxed">
          {'[thinking] '}
          {output.content}
        </pre>
      )

    case 'error':
      return (
        <pre className="text-red-400 whitespace-pre-wrap leading-relaxed">{output.content}</pre>
      )

    case 'status':
      return (
        <span className="block text-gray-600 text-xs leading-relaxed">{output.content}</span>
      )

    case 'tool-use':
      return <ToolUseCard output={output} />

    case 'permission-request':
      return <PermissionCard content={output.content} onResponse={onPermissionResponse} />

    default:
      return (
        <pre className="text-gray-200 whitespace-pre-wrap leading-relaxed">{output.content}</pre>
      )
  }
}

function ToolUseCard({ output }: { output: ParsedOutput }): JSX.Element {
  return (
    <details className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 my-1 group">
      <summary className="text-blue-400 cursor-pointer select-none flex items-center gap-2 list-none">
        <span className="text-gray-500 group-open:rotate-90 transition-transform inline-block">▶</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-blue-300">Tool</span>
        <span className="text-blue-400">{output.content || 'tool-use'}</span>
      </summary>
      {output.metadata && (
        <pre className="mt-2 text-xs text-gray-400 overflow-x-auto max-h-48">
          {JSON.stringify(output.metadata, null, 2)}
        </pre>
      )}
    </details>
  )
}

function PermissionCard({
  content,
  onResponse,
}: {
  content: string
  onResponse: (r: 'y' | 'n') => void
}): JSX.Element {
  return (
    <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg px-4 py-3 my-2">
      <p className="text-yellow-300 text-sm mb-3">{content}</p>
      <div className="flex gap-2">
        <button
          onClick={() => onResponse('y')}
          className="px-3 py-1 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded transition-colors"
        >
          Allow (y)
        </button>
        <button
          onClick={() => onResponse('n')}
          className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs font-medium rounded transition-colors"
        >
          Deny (n)
        </button>
      </div>
    </div>
  )
}
