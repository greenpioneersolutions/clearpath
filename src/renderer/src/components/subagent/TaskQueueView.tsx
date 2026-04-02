import { useState, useEffect, useCallback, useRef } from 'react'
import type { QueuedTask } from '../../types/subagent'

const STATUS_COLORS: Record<string, string> = {
  pending:      'bg-gray-700 text-gray-300',
  running:      'bg-green-900/40 text-green-400',
  completed:    'bg-blue-900/40 text-blue-400',
  failed:       'bg-red-900/40 text-red-400',
  'rate-limited': 'bg-yellow-900/40 text-yellow-400',
}

interface Props {
  /** Placeholder — real queue integration would come from claude-code-queue CLI */
}

export default function TaskQueueView(_props: Props): JSX.Element {
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [tasks, setTasks] = useState<QueuedTask[]>([])
  const [paused, setPaused] = useState(false)
  const dragIndexRef = useRef<number | null>(null)

  // Check if claude-code-queue is installed
  useEffect(() => {
    void (async () => {
      const result = await window.electronAPI.invoke('subagent:check-queue-installed') as {
        installed: boolean
        path: string | null
      }
      setInstalled(result.installed)
    })()
  }, [])

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndexRef.current === null || dragIndexRef.current === index) return

    setTasks((prev) => {
      const next = [...prev]
      const [removed] = next.splice(dragIndexRef.current!, 1)
      next.splice(index, 0, removed)
      // Update priorities to match new order
      return next.map((t, i) => ({ ...t, priority: i + 1 }))
    })
    dragIndexRef.current = index
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
  }

  const retryTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'pending' as const } : t)),
    )
  }

  const skipTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  // Not installed — show install prompt
  if (installed === false) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Task Queue</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Queue integration requires claude-code-queue
          </p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </div>
          <h4 className="text-sm font-medium text-gray-300 mb-1">claude-code-queue not installed</h4>
          <p className="text-xs text-gray-500 mb-4">
            Install it to enable task queuing with priority management
          </p>
          <div className="bg-gray-900 rounded-lg px-4 py-2.5 text-left">
            <code className="text-sm text-green-400 font-mono select-all">
              npm install -g claude-code-queue
            </code>
          </div>
          <button
            onClick={() => void navigator.clipboard.writeText('npm install -g claude-code-queue')}
            className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Copy command
          </button>
        </div>
      </div>
    )
  }

  // Loading check
  if (installed === null) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
        Checking for claude-code-queue...
      </div>
    )
  }

  // Installed — show queue UI
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Task Queue</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} in queue
            {paused && ' (paused)'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPaused(!paused)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              paused
                ? 'bg-green-900/40 text-green-400 hover:bg-green-800/60'
                : 'bg-yellow-900/40 text-yellow-400 hover:bg-yellow-800/60'
            }`}
          >
            {paused ? 'Resume Queue' : 'Pause Queue'}
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-gray-800 border border-dashed border-gray-700 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-500">Queue is empty</p>
          <p className="text-xs text-gray-600 mt-1">
            Delegated tasks will appear here when queued
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 cursor-grab active:cursor-grabbing group"
            >
              {/* Drag handle */}
              <span className="text-gray-600 flex-shrink-0 select-none">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="9" cy="6" r="1.5" />
                  <circle cx="15" cy="6" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="18" r="1.5" />
                  <circle cx="15" cy="18" r="1.5" />
                </svg>
              </span>

              {/* Priority */}
              <span className="text-xs text-gray-500 w-6 text-center flex-shrink-0">
                #{task.priority}
              </span>

              {/* Task info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 truncate">{task.prompt}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                  <span>{task.cli}</span>
                  {task.model && <span>{task.model}</span>}
                  {task.estimatedTokens && (
                    <span>~{task.estimatedTokens.toLocaleString()} tokens</span>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${STATUS_COLORS[task.status]}`}>
                {task.status}
              </span>

              {/* Actions */}
              <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {task.status === 'failed' && (
                  <button
                    onClick={() => retryTask(task.id)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 px-1.5"
                  >
                    Retry
                  </button>
                )}
                <button
                  onClick={() => skipTask(task.id)}
                  className="text-xs text-gray-500 hover:text-red-400 px-1.5"
                >
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
