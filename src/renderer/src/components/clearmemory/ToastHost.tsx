import { useEffect, useState } from 'react'
import { toast, type ToastItem } from '../../lib/toast'

/**
 * Ephemeral top-right toast stack. Mount once per page — Slice C mounts it
 * in `<ClearMemory />`. Intentionally lightweight; the persisted notification
 * inbox (NotificationBell) is for things the user needs to return to later.
 */
export default function ToastHost(): JSX.Element {
  const [stack, setStack] = useState<readonly ToastItem[]>([])

  useEffect(() => toast.subscribe(setStack), [])

  if (stack.length === 0) return <></>

  return (
    <div
      className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-[min(360px,90vw)] pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {stack.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg shadow-lg border px-3 py-2 text-sm flex items-start gap-2 bg-gray-800 ${
            t.level === 'error'
              ? 'border-red-700/60 text-red-100'
              : t.level === 'success'
                ? 'border-teal-700/60 text-teal-100'
                : 'border-gray-700 text-gray-100'
          }`}
        >
          <span className="flex-1 break-words">{t.message}</span>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-xs text-gray-400 hover:text-gray-200 shrink-0"
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
