import { useNavigate } from 'react-router-dom'

interface Props {
  // Kept for back-compat with the old Tools tab signature. Both props are now unused —
  // MCP management has moved to Connect → MCP Servers.
  cli?: 'copilot' | 'claude'
  workingDirectory?: string
}

/**
 * Redirect stub: MCP management has moved to Connect → MCP Servers. This
 * component is retained so any lingering caller (deep link, test, stale tab
 * state) still renders softly with a route to the new home. Safe to delete in
 * a follow-up sweep once telemetry shows it's no longer hit.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function McpManager(_props: Props): JSX.Element {
  const navigate = useNavigate()

  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center">
      <svg
        className="w-12 h-12 text-gray-300 mx-auto mb-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
        />
      </svg>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">
        MCP management has moved to Connect.
      </h3>
      <p className="text-xs text-gray-500 mb-4 max-w-md mx-auto">
        Add and manage MCP servers for both CoPilot and Claude Code in one place.
      </p>
      <button
        onClick={() => navigate('/connect?tab=mcp')}
        className="px-4 py-2 bg-[#5B4FC4] text-white text-sm font-medium rounded-lg hover:bg-[#4a41a8] transition-colors"
      >
        Go to Connect
      </button>
    </div>
  )
}
