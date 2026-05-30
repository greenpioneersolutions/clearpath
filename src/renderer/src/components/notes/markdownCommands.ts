// Markdown formatting commands that operate on a CodeMirror EditorView.
// Each command builds a transaction so undo/redo and multi-cursor all work,
// then re-focuses the editor. Used by the Notes editor toolbar + shortcuts.
import { EditorView, EditorSelection } from '@uiw/react-codemirror'

/**
 * Wrap each selected range with `before`/`after` markers (e.g. `**` for bold).
 * With an empty selection it inserts the markers and drops the cursor between
 * them so the user can type immediately.
 */
export function wrapInline(view: EditorView, before: string, after: string = before): void {
  const changes = view.state.changeByRange((range) => {
    const text = view.state.sliceDoc(range.from, range.to)
    const insert = `${before}${text}${after}`
    const innerFrom = range.from + before.length
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(innerFrom, innerFrom + text.length),
    }
  })
  view.dispatch(view.state.update(changes, { scrollIntoView: true }))
  view.focus()
}

/**
 * Prepend a static prefix (e.g. `# `, `> `, `- `) to the start of every line
 * touched by the selection.
 */
export function prefixLines(view: EditorView, prefix: string): void {
  const { state } = view
  const seen = new Set<number>()
  const changes: { from: number; insert: string }[] = []
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue
      seen.add(n)
      changes.push({ from: state.doc.line(n).from, insert: prefix })
    }
  }
  view.dispatch(state.update({ changes }, { scrollIntoView: true }))
  view.focus()
}

/** Like prefixLines but numbers each line (`1. `, `2. `, …). */
export function numberLines(view: EditorView): void {
  const { state } = view
  const seen = new Set<number>()
  const changes: { from: number; insert: string }[] = []
  let i = 1
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue
      seen.add(n)
      changes.push({ from: state.doc.line(n).from, insert: `${i}. ` })
      i++
    }
  }
  view.dispatch(state.update({ changes }, { scrollIntoView: true }))
  view.focus()
}

/** Insert a `[text](url)` link, selecting the `url` placeholder for quick edit. */
export function insertLink(view: EditorView): void {
  const changes = view.state.changeByRange((range) => {
    const text = view.state.sliceDoc(range.from, range.to) || 'text'
    const insert = `[${text}](url)`
    const urlStart = range.from + 1 + text.length + 2 // after "[text]("
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(urlStart, urlStart + 'url'.length),
    }
  })
  view.dispatch(view.state.update(changes, { scrollIntoView: true }))
  view.focus()
}

/** Wrap the selection in a fenced code block on its own lines. */
export function insertCodeBlock(view: EditorView): void {
  const changes = view.state.changeByRange((range) => {
    const text = view.state.sliceDoc(range.from, range.to)
    const insert = `\`\`\`\n${text}\n\`\`\``
    const innerFrom = range.from + 4 // after "```\n"
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(innerFrom, innerFrom + text.length),
    }
  })
  view.dispatch(view.state.update(changes, { scrollIntoView: true }))
  view.focus()
}
