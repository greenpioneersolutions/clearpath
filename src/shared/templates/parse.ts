// ── Prompt Templates — parsing, normalization, hydration ──────────────────────
// The single source of truth for the `{{VARIABLE}}` grammar. Both main
// (built-ins, templates:save, getAllTemplates) and renderer (TemplateForm,
// TemplateEditor, TemplateLauncher) import from here so the regex + substitution
// logic exists in exactly one place. Dependency-free.

import {
  VARIABLE_TYPES,
  MULTI_CAPABLE_VARIABLE_TYPES,
  type TemplateVariable,
  type VariableType,
} from './types'

/**
 * Matches `{{NAME}}`, `{{NAME:type}}`, and `{{NAME:select:a|b|c}}`.
 *   group 1 — NAME      (UPPER_SNAKE)
 *   group 2 — type      (optional, lowercase)
 *   group 3 — options   (optional, only after a 2nd colon; for `select`)
 *
 * Superset of the legacy `/\{\{([A-Z_][A-Z0-9_]*)\}\}/g` — a bare `{{NAME}}`
 * still matches with groups 2/3 undefined.
 */
const TOKEN_SOURCE = '\\{\\{([A-Z_][A-Z0-9_]*)(?::([a-z]+)(?::([^}]*))?)?\\}\\}'

/** Fresh instance each call — a shared global-flagged regex carries lastIndex. */
function tokenRe(): RegExp {
  return new RegExp(TOKEN_SOURCE, 'g')
}

function isVariableType(value: string): value is VariableType {
  return (VARIABLE_TYPES as readonly string[]).includes(value)
}

/**
 * Apply the type-consistency rules that hold regardless of where a variable
 * came from (body parse or stored structured metadata):
 *   • unknown type            → 'text'
 *   • 'select' with no options → 'text' (a zero-option dropdown can never be
 *     satisfied and would lock the Send button)
 *   • 'multiple' only honored for genuinely multi-valued types
 */
function sanitizeVariable(v: TemplateVariable): TemplateVariable {
  let type: VariableType = isVariableType(v.type) ? v.type : 'text'
  let options = v.options?.map((o) => o.trim()).filter(Boolean)

  if (type === 'select' && (!options || options.length === 0)) {
    type = 'text'
    options = undefined
  }
  if (type !== 'select') options = undefined

  const multiple = MULTI_CAPABLE_VARIABLE_TYPES.includes(type) ? v.multiple : undefined

  return {
    name: v.name,
    type,
    ...(v.label ? { label: v.label } : {}),
    ...(v.required !== undefined ? { required: v.required } : {}),
    ...(multiple ? { multiple: true } : {}),
    ...(options ? { options } : {}),
    ...(v.default ? { default: v.default } : {}),
  }
}

/**
 * Extract the structured variables a body declares. Body is the source of
 * truth for name / type / select-options. De-duped by name — the FIRST
 * occurrence wins on type/options (later occurrences of the same name reuse the
 * same single input and are replaced together at hydrate time).
 */
export function parseTemplateBody(body: string): TemplateVariable[] {
  const re = tokenRe()
  const seen = new Map<string, TemplateVariable>()
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const name = m[1]
    if (seen.has(name)) continue
    const rawType = m[2]
    const options = m[3] !== undefined ? m[3].split('|') : undefined
    seen.set(
      name,
      sanitizeVariable({
        name,
        type: (rawType ?? 'text') as VariableType,
        options,
      }),
    )
  }
  return [...seen.values()]
}

/**
 * Coerce an unknown stored value (legacy `string[]` OR `TemplateVariable[]`)
 * into a clean `TemplateVariable[]`. Used as a defensive read-path upgrade so
 * no consumer ever sees the legacy shape.
 */
export function normalizeVariables(raw: unknown): TemplateVariable[] {
  if (!Array.isArray(raw)) return []
  const out: TemplateVariable[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      // Legacy: a bare placeholder name. Plain text, required by default
      // (preserves the original "fill everything" behavior).
      if (item) out.push({ name: item, type: 'text', required: true })
    } else if (item && typeof item === 'object' && typeof (item as TemplateVariable).name === 'string') {
      const v = item as TemplateVariable
      out.push(sanitizeVariable({ ...v, type: (v.type ?? 'text') as VariableType }))
    }
  }
  return out
}

/**
 * Merge body-derived structure with stored/authored metadata. Body wins on
 * name / type / options (structure); the overlay wins on label / required /
 * multiple / default (the things the body can't express). Overlay entries
 * whose name no longer appears in the body are dropped.
 */
export function mergeVariables(
  fromBody: TemplateVariable[],
  overlay: TemplateVariable[],
): TemplateVariable[] {
  const byName = new Map(overlay.map((v) => [v.name, v]))
  return fromBody.map((b) => {
    const o = byName.get(b.name)
    if (!o) return b
    return sanitizeVariable({
      name: b.name,
      type: b.type,
      options: b.options,
      label: o.label,
      required: o.required,
      multiple: o.multiple,
      default: o.default,
    })
  })
}

/** A variable must be filled unless it is explicitly marked optional. */
export function isRequired(v: TemplateVariable): boolean {
  return v.required !== false
}

// ── Hydration ─────────────────────────────────────────────────────────────────

// Framing sentinels used by the launch/send pipeline to delimit context blocks
// from the user's request. Substituted variable values must not be able to
// forge these and hijack the model's section boundaries.
const FRAMING_SENTINELS: [RegExp, string][] = [
  [/user request:/gi, 'user request​:'],
  [/---\s*context/gi, '-​-- context'],
]

function sanitizeValue(value: string): string {
  let v = value
  for (const [re, replacement] of FRAMING_SENTINELS) v = v.replace(re, replacement)
  return v
}

/**
 * Substitute filled values into the body. Filled tokens are replaced with the
 * (sentinel-sanitized) value; unfilled tokens collapse to a bare `{{NAME}}`
 * with any `:type` suffix stripped, so previews and partially-filled prompts
 * stay readable.
 */
export function hydrate(body: string, values: Record<string, string>): string {
  return body.replace(tokenRe(), (_full, name: string) => {
    const val = values[name]
    if (val == null || val.trim() === '') return `{{${name}}}`
    return sanitizeValue(val)
  })
}

/**
 * Rewrite every token for `name` to carry the given type (and select options).
 * Used by the structured editor so changing a variable's type in the UI updates
 * the inline `{{NAME:type}}` annotation in the body (the source of truth).
 */
export function writeVariableAnnotation(
  body: string,
  name: string,
  type: VariableType,
  options?: string[],
): string {
  const ann =
    type === 'text'
      ? `{{${name}}}`
      : type === 'select' && options && options.length > 0
        ? `{{${name}:select:${options.join('|')}}}`
        : `{{${name}:${type}}}`
  // Match {{NAME}}, {{NAME:type}}, {{NAME:select:...}} for this exact name.
  const re = new RegExp(`\\{\\{${name}(?::[a-z]+(?::[^}]*)?)?\\}\\}`, 'g')
  return body.replace(re, ann)
}

/**
 * Remove the tokens for the given variable names entirely (used for
 * config-type variables, which configure the session rather than appearing in
 * the prompt text). Collapses any whitespace/blank lines the removal leaves.
 */
export function stripVariableTokens(body: string, names: string[]): string {
  if (names.length === 0) return body
  const drop = new Set(names)
  return body
    .replace(tokenRe(), (full, name: string) => (drop.has(name) ? '' : full))
    // Tidy up: collapse runs of spaces and blank lines left by removals.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
}
