#!/usr/bin/env node
/**
 * ClearPath permission hook for GitHub Copilot CLI (bundled resource).
 *
 * Registered as a `preToolUse` hook — unlike `permissionRequest` (which only
 * gets `{sessionId, cwd, toolName}`), preToolUse receives the full `toolArgs`
 * (the URL for fetch, the path for write, the command for shell), which we need
 * both to show a meaningful approval prompt and to record session activity.
 *
 * Copilot writes the tool request as JSON on stdin; we forward it to ClearPath's
 * PermissionBroker over loopback HTTP and print the decision on stdout:
 *   { "permissionDecision": "allow" | "deny", "permissionDecisionReason": "..." }
 * (We also emit `behavior` for compatibility if Copilot reads it as a
 * permissionRequest hook.)
 *
 * Config via env: BROKER_URL, BROKER_TOKEN, BROKER_SESSION.
 */

const BROKER_URL = process.env.BROKER_URL || ''
const BROKER_TOKEN = process.env.BROKER_TOKEN || ''
const BROKER_SESSION = process.env.BROKER_SESSION || ''

function out(decision, reason) {
  const payload = { permissionDecision: decision, behavior: decision }
  if (reason && decision === 'deny') { payload.permissionDecisionReason = reason; payload.message = reason }
  process.stdout.write(JSON.stringify(payload))
  // The JSON field is authoritative, but also signal deny via a non-zero exit
  // (hook convention: exit 2 = block) so a deny is fail-closed even if the
  // runner only inspects the exit code. allow → 0.
  process.exit(decision === 'deny' ? 2 : 0)
}

async function main() {
  let raw = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) raw += chunk

  let req = {}
  try { req = raw.trim() ? JSON.parse(raw) : {} } catch { /* tolerate */ }

  // Copilot encodes the tool arguments as a JSON STRING (e.g. toolArgs:
  // '{"path":"/Users/…/OUT.md","content":"…"}'), so parse it into a real object
  // before sending — otherwise the broker sees the whole JSON blob (or file
  // content) instead of the path/url.
  const parseArgs = (v) => {
    if (v && typeof v === 'object') return v
    if (typeof v === 'string' && v.trim()) {
      try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : { value: v } } catch { return { value: v } }
    }
    return undefined
  }
  const args = parseArgs(req.toolArgs) || parseArgs(req.arguments) || parseArgs(req.input) || {}

  // Cap string sizes so a big file `content` field can't blow the broker's body
  // limit (→ spurious deny). We only need the path/url/command, never the bytes.
  const cap = (v, depth = 0) => {
    if (typeof v === 'string') return v.length > 2000 ? v.slice(0, 2000) : v
    if (Array.isArray(v)) return depth > 3 ? [] : v.slice(0, 20).map((x) => cap(x, depth + 1))
    if (v && typeof v === 'object') { const r = {}; for (const [k, val] of Object.entries(v)) r[k] = cap(val, depth + 1); return r }
    return v
  }

  // This hook lives in the user's global ~/.copilot/settings.json, so it also
  // runs for the user's OWN terminal `copilot` sessions. Those have no broker
  // env — for them we are a no-op pass-through (allow) so we never break or gate
  // normal Copilot usage. Only ClearPath-spawned sessions carry the broker env.
  if (!BROKER_URL || !BROKER_TOKEN || !BROKER_SESSION) {
    out('allow')
    return
  }

  try {
    const res = await fetch(`${BROKER_URL}/permission`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: BROKER_TOKEN,
        sessionId: BROKER_SESSION,
        cli: 'copilot',
        toolName: req.toolName ?? req.tool ?? '',
        // Send the parsed (and size-capped) args — path/url/command live here —
        // plus cwd for context. Don't spread the raw req: its stringified
        // toolArgs would otherwise be mistaken for the target.
        input: cap({ cwd: req.cwd, ...args }),
      }),
    })
    const data = await res.json()
    if (data.decision === 'allow') out('allow')
    else out('deny', data.reason || 'denied by ClearPath policy')
  } catch (err) {
    out('deny', `permission broker unreachable: ${err?.message || err}`)
  }
}

void main()
