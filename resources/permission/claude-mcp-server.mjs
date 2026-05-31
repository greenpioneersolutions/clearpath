#!/usr/bin/env node
/**
 * ClearPath permission MCP server (bundled resource).
 *
 * A minimal MCP stdio server exposing a single `permission_prompt` tool that
 * Claude Code calls via `--permission-prompt-tool mcp__clearpath_permission__permission_prompt`.
 * For each tool the agent wants to run, Claude calls this tool with
 * `{ tool_name, input }`; we forward it to ClearPath's PermissionBroker over
 * loopback HTTP and return `{ behavior: "allow"|"deny", updatedInput|message }`.
 *
 * Transport: newline-delimited JSON-RPC 2.0 on stdin/stdout (MCP stdio).
 * Config via env: BROKER_URL, BROKER_TOKEN, BROKER_SESSION.
 */

const BROKER_URL = process.env.BROKER_URL || ''
const BROKER_TOKEN = process.env.BROKER_TOKEN || ''
const BROKER_SESSION = process.env.BROKER_SESSION || ''
const PROTOCOL_VERSION = '2024-11-05'

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}
function reply(id, result) { send({ jsonrpc: '2.0', id, result }) }
function replyError(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }) }

async function askBroker(toolName, input) {
  if (!BROKER_URL || !BROKER_TOKEN || !BROKER_SESSION) {
    return { behavior: 'deny', message: 'permission broker not configured' }
  }
  try {
    const res = await fetch(`${BROKER_URL}/permission`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: BROKER_TOKEN,
        sessionId: BROKER_SESSION,
        cli: 'claude',
        toolName,
        input,
      }),
    })
    const data = await res.json()
    if (data.decision === 'allow') return { behavior: 'allow', updatedInput: input }
    return { behavior: 'deny', message: data.reason || 'denied by ClearPath policy' }
  } catch (err) {
    return { behavior: 'deny', message: `permission broker unreachable: ${err?.message || err}` }
  }
}

const TOOL = {
  name: 'permission_prompt',
  description: 'ClearPath tool-permission gate. Returns allow/deny for a requested tool call.',
  inputSchema: {
    type: 'object',
    properties: {
      tool_name: { type: 'string' },
      input: { type: 'object' },
    },
    required: ['tool_name'],
  },
}

async function handle(req) {
  const { id, method, params } = req
  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'clearpath_permission', version: '1.0.0' },
      })
      return
    case 'tools/list':
      reply(id, { tools: [TOOL] })
      return
    case 'tools/call': {
      const name = params?.name
      if (name !== 'permission_prompt') { replyError(id, -32601, `unknown tool: ${name}`); return }
      const args = params?.arguments || {}
      const decision = await askBroker(args.tool_name ?? '', args.input ?? {})
      // The permission-prompt-tool contract: the tool RESULT text is the JSON
      // permission payload Claude consumes.
      reply(id, { content: [{ type: 'text', text: JSON.stringify(decision) }] })
      return
    }
    case 'ping':
      reply(id, {})
      return
    default:
      // Notifications (no id) get no response; unknown requests get an error.
      if (id !== undefined && id !== null) replyError(id, -32601, `method not found: ${method}`)
  }
}

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    void handle(msg)
  }
})
process.stdin.on('end', () => process.exit(0))
