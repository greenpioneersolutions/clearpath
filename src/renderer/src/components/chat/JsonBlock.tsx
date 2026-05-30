import { useMemo, useState } from 'react'
import CodeBlock, { CopyButton } from './CodeBlock'

// ── Rich JSON renderer ───────────────────────────────────────────────────────
// Parses a JSON string and renders a brand-colored, collapsible tree. Parsing
// also *normalizes* whitespace (we render from the parsed value, never the raw
// bytes), so however ugly the model's spacing was, the output is clean. If the
// text doesn't parse (e.g. a truncated stream), we fall back to a plain
// highlighted code block so nothing ever blanks out.

export interface JsonBlockProps {
  raw: string
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

const INDENT_REM = 1.1

function JsonScalar({ value }: { value: null | boolean | number | string }): JSX.Element {
  if (value === null) return <span className="json-literal">null</span>
  switch (typeof value) {
    case 'string':
      return <span className="json-string">&quot;{value}&quot;</span>
    case 'number':
      return <span className="json-number">{String(value)}</span>
    case 'boolean':
      return <span className="json-literal">{String(value)}</span>
    default:
      return <span>{String(value)}</span>
  }
}

interface NodeProps {
  keyName?: string
  value: Json
  depth: number
  trailingComma: boolean
  /** undefined → use default (open); true/false → forced by expand/collapse-all */
  openOverride?: boolean
}

function JsonNode({ keyName, value, depth, trailingComma, openOverride }: NodeProps): JSX.Element {
  const isContainer = value !== null && typeof value === 'object'
  // Root stays open; otherwise honor an expand/collapse-all override, else open.
  const [open, setOpen] = useState(depth === 0 ? true : (openOverride ?? true))
  const pad = { paddingLeft: `${depth * INDENT_REM}rem` }

  const keyPrefix =
    keyName !== undefined ? (
      <>
        <span className="json-key">&quot;{keyName}&quot;</span>
        <span className="json-punc">: </span>
      </>
    ) : null

  if (!isContainer) {
    return (
      <div className="json-row" style={pad}>
        {keyPrefix}
        <JsonScalar value={value as null | boolean | number | string} />
        {trailingComma && <span className="json-punc">,</span>}
      </div>
    )
  }

  const isArray = Array.isArray(value)
  const entries: [string | undefined, Json][] = isArray
    ? (value as Json[]).map((v) => [undefined, v])
    : Object.entries(value as { [k: string]: Json })
  const openB = isArray ? '[' : '{'
  const closeB = isArray ? ']' : '}'
  const count = entries.length

  if (count === 0) {
    return (
      <div className="json-row" style={pad}>
        {keyPrefix}
        <span className="json-punc">{openB}{closeB}</span>
        {trailingComma && <span className="json-punc">,</span>}
      </div>
    )
  }

  const summary = isArray ? `${count} ${count === 1 ? 'item' : 'items'}` : `${count} ${count === 1 ? 'key' : 'keys'}`

  return (
    <div>
      <div className="json-row json-row--toggle" style={pad}>
        <button
          type="button"
          className="json-toggle"
          aria-expanded={open}
          aria-label={open ? 'Collapse' : 'Expand'}
          onClick={() => setOpen((o) => !o)}
        >
          <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {keyPrefix}
        <span className="json-punc">{openB}</span>
        {!open && (
          <>
            <span className="json-summary"> {summary} </span>
            <span className="json-punc">{closeB}</span>
            {trailingComma && <span className="json-punc">,</span>}
          </>
        )}
      </div>
      {open && (
        <>
          {entries.map(([k, v], i) => (
            <JsonNode
              key={k ?? i}
              keyName={k}
              value={v}
              depth={depth + 1}
              trailingComma={i < count - 1}
              openOverride={openOverride}
            />
          ))}
          <div className="json-row" style={pad}>
            <span className="json-punc">{closeB}</span>
            {trailingComma && <span className="json-punc">,</span>}
          </div>
        </>
      )}
    </div>
  )
}

export default function JsonBlock({ raw }: JsonBlockProps): JSX.Element {
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(raw) as Json }
    } catch {
      return { ok: false as const, value: null }
    }
  }, [raw])

  const [view, setView] = useState<'pretty' | 'raw'>('pretty')
  // Bumping `nonce` remounts the tree so per-node open state resets to override.
  const [override, setOverride] = useState<boolean | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const pretty = useMemo(() => JSON.stringify(parsed.value, null, 2), [parsed.value])

  if (!parsed.ok) {
    // Not valid JSON (e.g. truncated mid-stream) — degrade gracefully.
    return <CodeBlock code={raw} lang="json" />
  }

  const expandAll = (): void => {
    setOverride(true)
    setNonce((n) => n + 1)
  }
  const collapseAll = (): void => {
    setOverride(false)
    setNonce((n) => n + 1)
  }

  return (
    <div className="json-block group/json my-2">
      <div className="json-block__bar">
        <span className="json-block__chip">JSON</span>
        <div className="flex items-center gap-1">
          {view === 'pretty' && (
            <>
              <button type="button" className="json-block__btn" onClick={expandAll} title="Expand all">Expand all</button>
              <button type="button" className="json-block__btn" onClick={collapseAll} title="Collapse all">Collapse all</button>
            </>
          )}
          <button
            type="button"
            className="json-block__btn"
            onClick={() => setView((v) => (v === 'pretty' ? 'raw' : 'pretty'))}
            title={view === 'pretty' ? 'Show raw text' : 'Show tree'}
          >
            {view === 'pretty' ? 'Raw' : 'Pretty'}
          </button>
          <CopyButton text={pretty} />
        </div>
      </div>
      {view === 'pretty' ? (
        <div className="json-block__body">
          <JsonNode key={nonce} value={parsed.value} depth={0} trailingComma={false} openOverride={override} />
        </div>
      ) : (
        <CodeBlock code={pretty} lang="json" />
      )}
    </div>
  )
}
