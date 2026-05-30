import { useMemo, useState } from 'react'
import hljs from 'highlight.js'
import { toast } from '../../lib/toast'

// ── Shared code block ────────────────────────────────────────────────────────
// Read-only, syntax-highlighted rendering for any fenced code block in chat.
// Highlighting runs *inside* this component (after react-markdown + sanitize),
// so we keep clean access to the raw text and never feed highlight markup back
// through the sanitizer. highlight.js escapes the code it tokenizes, so the
// dangerouslySetInnerHTML below only ever contains escaped text + hljs spans.

export interface CodeBlockProps {
  code: string
  lang?: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Highlight `code` for `lang`; fall back to auto-detect, then plain escaping. */
export function highlightCode(code: string, lang?: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch {
      /* fall through */
    }
  }
  try {
    return hljs.highlightAuto(code).value
  } catch {
    return escapeHtml(code)
  }
}

/** A small hover-revealed copy button shared by the code/JSON blocks. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const handle = (): void => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => toast.error('Couldn’t copy'),
    )
  }
  return (
    <button
      type="button"
      onClick={handle}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
      title={`${label} to clipboard`}
    >
      {copied ? (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Copied
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          {label}
        </>
      )}
    </button>
  )
}

export default function CodeBlock({ code, lang }: CodeBlockProps): JSX.Element {
  const body = code.replace(/\n$/, '')
  const html = useMemo(() => highlightCode(body, lang), [body, lang])

  return (
    <div className="code-block group/code my-2">
      <div className="code-block__bar">
        <span className="code-block__lang">{(lang || 'code').toUpperCase()}</span>
        <span className="opacity-0 group-hover/code:opacity-100 transition-opacity">
          <CopyButton text={body} />
        </span>
      </div>
      <pre className="code-block__pre">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}
