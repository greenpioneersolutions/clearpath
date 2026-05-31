#!/usr/bin/env node
/**
 * ClearPath permission hook for GitHub Copilot CLI (bundled resource).
 *
 * Registered as a `permissionRequest` hook (the hook GitHub documents for CLI
 * pipe/`-p` mode where no interactive prompt is available). Copilot writes the
 * tool request as JSON on stdin; we forward it to ClearPath's PermissionBroker
 * over loopback HTTP and print the decision as JSON on stdout:
 *   { "behavior": "allow" | "deny", "message": "..." }
 *
 * Config via env: BROKER_URL, BROKER_TOKEN, BROKER_SESSION.
 */

const BROKER_URL = process.env.BROKER_URL || ''
const BROKER_TOKEN = process.env.BROKER_TOKEN || ''
const BROKER_SESSION = process.env.BROKER_SESSION || ''

function out(behavior, message) {
  process.stdout.write(JSON.stringify(message ? { behavior, message } : { behavior }))
  process.exit(behavior === 'allow' ? 0 : 0) // exit 0; behavior carries the decision
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
        // permissionRequest input carries no args; pass what we have for matching.
        input: req.toolArgs ?? req.arguments ?? { cwd: req.cwd },
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
