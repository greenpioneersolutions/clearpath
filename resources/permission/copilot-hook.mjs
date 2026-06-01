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
  process.exit(0) // exit 0; the decision field carries allow/deny
}

async function main() {
  let raw = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) raw += chunk

  let req = {}
  try { req = raw.trim() ? JSON.parse(raw) : {} } catch { /* tolerate */ }

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
        // Copilot's preToolUse arg shape isn't fixed, so forward the FULL request
        // (toolArgs flattened in) and let the broker's extractCommand find the
        // path/url wherever it lives. Falls back to whatever we were given.
        input: {
          ...req,
          ...(req.toolArgs && typeof req.toolArgs === 'object' ? req.toolArgs : {}),
          ...(req.arguments && typeof req.arguments === 'object' ? req.arguments : {}),
        },
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
