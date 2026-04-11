import { useState, useEffect, useCallback } from 'react'
import type {
  IntegrationStatus,
  CustomIntegration,
} from '../../types/integrations'
import { useFeatureFlags } from '../../contexts/FeatureFlagContext'

// ── SVG Logo Components ──────────────────────────────────────────────────────

function GitHubLogo(): JSX.Element {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  )
}

function AtlassianLogo(): JSX.Element {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path d="M7.12 11.42a.46.46 0 0 0-.79.4l3.24 6.75a.56.56 0 0 0 1 0l3.87-8.1a.46.46 0 0 0-.42-.65H10.3a.55.55 0 0 0-.5.3l-2.68 1.3z" fill="#2684FF" opacity="0.8"/>
      <path d="M10.88 2.24a.46.46 0 0 0-.79.4c1.38 2.76 1.28 5.62-.27 8.27l-3.03 6.33a.56.56 0 0 0 .5.76h4.57a.56.56 0 0 0 .5-.3l5.3-11.06a.46.46 0 0 0-.42-.65h-3.68a.55.55 0 0 0-.5.3L10.88 2.24z" fill="#2684FF"/>
    </svg>
  )
}

function ServiceNowLogo(): JSX.Element {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#293E40"/>
      <circle cx="12" cy="12" r="3" fill="#81B5A1"/>
      <path d="M12 4.5C7.86 4.5 4.5 7.86 4.5 12S7.86 19.5 12 19.5 19.5 16.14 19.5 12 16.14 4.5 12 4.5zm0 13.2A5.7 5.7 0 1 1 17.7 12 5.71 5.71 0 0 1 12 17.7z" fill="#81B5A1"/>
    </svg>
  )
}

function BackstageLogo(): JSX.Element {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#36BAA2"/>
      <path d="M8 7h2v10H8V7zm3 0h1.5c2.5 0 4 1.3 4 3.2 0 1.4-.8 2.4-2 2.8L17 17h-2.3l-2.2-3.6H11V17h0V7zm1.5 1.5V12h.8c1.3 0 2.2-.6 2.2-1.8 0-1.1-.9-1.7-2.2-1.7h-.8z" fill="white"/>
    </svg>
  )
}

function PowerBILogo(): JSX.Element {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="2" width="5" height="20" rx="1.5" fill="#F2C811" opacity="0.5"/>
      <rect x="9.5" y="6" width="5" height="16" rx="1.5" fill="#F2C811" opacity="0.75"/>
      <rect x="16" y="10" width="5" height="12" rx="1.5" fill="#F2C811"/>
    </svg>
  )
}

function CustomAPILogo(): JSX.Element {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  )
}

// ── Shared Connection Card Component ─────────────────────────────────────────

interface CardProps {
  logo: JSX.Element
  name: string
  description: string
  dataDescription: string
  connected: boolean
  connectedLabel?: string
  connectedAt?: number
  onDisconnect: () => void
  children: React.ReactNode // The connection form content
  connectedContent?: React.ReactNode // Extra content shown when connected
}

function IntegrationCard({
  logo, name, description, dataDescription,
  connected, connectedLabel, connectedAt,
  onDisconnect, children, connectedContent,
}: CardProps): JSX.Element {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          {logo}
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{name}</h3>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs text-gray-600">{connectedLabel ?? 'Connected'}</span>
            </div>
            <button onClick={onDisconnect}
              className="text-xs text-red-500 hover:text-red-400 transition-colors">Disconnect</button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Not connected</span>
        )}
      </div>

      <div className="px-5 py-4">
        {connected ? (
          <div className="space-y-3">
            {connectedContent}
            {connectedAt && (
              <div className="text-xs text-gray-400">
                Connected {new Date(connectedAt).toLocaleDateString()} · Data is fetched on-demand, nothing is cached or synced automatically
              </div>
            )}
          </div>
        ) : showForm ? (
          <div className="space-y-3">
            {children}
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >Cancel</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">{dataDescription}</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >Connect {name}</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── GitHub Card ──────────────────────────────────────────────────────────────

function GitHubCard({ status, onReload }: { status: IntegrationStatus['github']; onReload: () => void }): JSX.Element {
  const { flags, setFlag } = useFeatureFlags()
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    if (!token.trim()) { setError('Please enter a token'); return }
    setConnecting(true); setError('')
    const result = await window.electronAPI.invoke('integration:github-connect', { token: token.trim() }) as { success: boolean; error?: string }
    setConnecting(false)
    if (result.success) { setToken(''); onReload() }
    else setError(result.error ?? 'Connection failed')
  }

  const handleDisconnect = async () => {
    await window.electronAPI.invoke('integration:github-disconnect')
    onReload()
  }

  return (
    <IntegrationCard
      logo={<GitHubLogo />}
      name="GitHub"
      description="Pull requests, issues, and repository data"
      dataDescription="Connect GitHub to pull PRs, issues, and repo data directly into your AI sessions. The AI can review PRs, summarize issues, and work with real project context."
      connected={!!status?.connected}
      connectedLabel={status ? `Connected as ${status.username}` : undefined}
      connectedAt={status?.connectedAt}
      onDisconnect={() => void handleDisconnect()}
      connectedContent={
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            GitHub is connected. Try asking: <em className="text-gray-800">"Pull my recent PRs"</em> or <em className="text-gray-800">"Show open issues in owner/repo"</em>
          </p>
          {flags.enableExperimentalFeatures && (
            <div className="mt-2 pt-3 border-t border-gray-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">PR Scores</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Experimental</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Score and analyze pull requests with 0-100 ratings</p>
              </div>
              <button
                onClick={() => setFlag('showPrScores', !flags.showPrScores)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${flags.showPrScores ? 'bg-indigo-600' : 'bg-gray-300'}`}
                role="switch" aria-checked={flags.showPrScores}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${flags.showPrScores ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )}
        </div>
      }
    >
      <p className="text-sm text-gray-600">
        Enter a GitHub Personal Access Token (PAT) with <code className="bg-gray-100 px-1 rounded text-xs">repo</code> scope.
        Create one at <span className="text-indigo-600">github.com &rarr; Settings &rarr; Developer settings &rarr; Personal access tokens</span>.
      </p>
      <div className="flex gap-2">
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" autoFocus />
        <button onClick={() => void handleConnect()} disabled={connecting}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >{connecting ? 'Connecting...' : 'Connect'}</button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </IntegrationCard>
  )
}

// ── Atlassian Card ───────────────────────────────────────────────────────────

function AtlassianCard({ status, onReload }: { status: IntegrationStatus['atlassian']; onReload: () => void }): JSX.Element {
  const [siteUrl, setSiteUrl] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    if (!siteUrl.trim() || !email.trim() || !token.trim()) { setError('All fields are required'); return }
    setConnecting(true); setError('')
    const result = await window.electronAPI.invoke('integration:atlassian-connect', {
      siteUrl: siteUrl.trim(), email: email.trim(), token: token.trim(),
    }) as { success: boolean; error?: string }
    setConnecting(false)
    if (result.success) { setSiteUrl(''); setEmail(''); setToken(''); onReload() }
    else setError(result.error ?? 'Connection failed')
  }

  const handleDisconnect = async () => {
    await window.electronAPI.invoke('integration:atlassian-disconnect')
    onReload()
  }

  const products: string[] = []
  if (status?.jiraEnabled) products.push('Jira')
  if (status?.confluenceEnabled) products.push('Confluence')

  return (
    <IntegrationCard
      logo={<AtlassianLogo />}
      name="Atlassian"
      description="Jira issues, sprints, boards + Confluence pages and spaces"
      dataDescription="Connect your Atlassian account to access Jira projects, issues, sprints, and boards. If Confluence is available on your site, you'll also get access to spaces, pages, and wiki content."
      connected={!!status?.connected}
      connectedLabel={status ? `${status.displayName} · ${products.join(' + ') || 'Connected'}` : undefined}
      connectedAt={status?.connectedAt}
      onDisconnect={() => void handleDisconnect()}
      connectedContent={
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Atlassian is connected to <strong>{status?.siteUrl}</strong>.
            {status?.jiraEnabled && <> Try: <em className="text-gray-800">"Show my open Jira issues"</em> or <em className="text-gray-800">"What's in the current sprint?"</em></>}
          </p>
          <div className="flex gap-2">
            {status?.jiraEnabled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Jira</span>}
            {status?.confluenceEnabled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Confluence</span>}
          </div>
        </div>
      }
    >
      <p className="text-sm text-gray-600">
        Enter your Atlassian site URL, email, and API token.
        Create a token at <span className="text-indigo-600">id.atlassian.com &rarr; Security &rarr; API tokens</span>.
      </p>
      <div className="space-y-2">
        <input type="text" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="mycompany (or mycompany.atlassian.net)"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <div className="flex gap-2">
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
            placeholder="API token"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" autoFocus />
          <button onClick={() => void handleConnect()} disabled={connecting}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >{connecting ? 'Connecting...' : 'Connect'}</button>
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </IntegrationCard>
  )
}

// ── ServiceNow Card ──────────────────────────────────────────────────────────

function ServiceNowCard({ status, onReload }: { status: IntegrationStatus['servicenow']; onReload: () => void }): JSX.Element {
  const [instanceUrl, setInstanceUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authMethod, setAuthMethod] = useState<'basic' | 'oauth'>('basic')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    if (!instanceUrl.trim() || !username.trim() || !password.trim()) { setError('Instance URL, username, and password are required'); return }
    if (authMethod === 'oauth' && (!clientId.trim() || !clientSecret.trim())) { setError('Client ID and Client Secret are required for OAuth'); return }
    setConnecting(true); setError('')
    const result = await window.electronAPI.invoke('integration:servicenow-connect', {
      instanceUrl: instanceUrl.trim(), username: username.trim(), password: password.trim(),
      authMethod, clientId: clientId.trim() || undefined, clientSecret: clientSecret.trim() || undefined,
    }) as { success: boolean; error?: string }
    setConnecting(false)
    if (result.success) { setInstanceUrl(''); setUsername(''); setPassword(''); setClientId(''); setClientSecret(''); onReload() }
    else setError(result.error ?? 'Connection failed')
  }

  const handleDisconnect = async () => {
    await window.electronAPI.invoke('integration:servicenow-disconnect')
    onReload()
  }

  return (
    <IntegrationCard
      logo={<ServiceNowLogo />}
      name="ServiceNow"
      description="Incidents, change requests, CMDB, knowledge articles"
      dataDescription="Connect ServiceNow to access incidents, change requests, service catalog items, knowledge articles, and CMDB configuration items. Supports both OAuth and Basic authentication."
      connected={!!status?.connected}
      connectedLabel={status ? `${status.displayName} · ${status.instanceUrl}` : undefined}
      connectedAt={status?.connectedAt}
      onDisconnect={() => void handleDisconnect()}
      connectedContent={
        <p className="text-sm text-gray-600">
          ServiceNow is connected to <strong>{status?.instanceUrl}</strong>.
          Try: <em className="text-gray-800">"Show my open incidents"</em> or <em className="text-gray-800">"Search CMDB for server X"</em>
        </p>
      }
    >
      <p className="text-sm text-gray-600">
        Enter your ServiceNow instance URL and credentials.
        {authMethod === 'oauth' && ' For OAuth, you need a Client ID and Secret from your ServiceNow OAuth Application Registry.'}
      </p>
      <div className="space-y-2">
        <input type="text" value={instanceUrl} onChange={(e) => setInstanceUrl(e.target.value)}
          placeholder="mycompany (or mycompany.service-now.com)"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input type="radio" name="sn-auth" checked={authMethod === 'basic'} onChange={() => setAuthMethod('basic')} className="text-indigo-600" />
            Basic Auth
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input type="radio" name="sn-auth" checked={authMethod === 'oauth'} onChange={() => setAuthMethod('oauth')} className="text-indigo-600" />
            OAuth 2.0
          </label>
        </div>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        {authMethod === 'oauth' && (
          <>
            <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)}
              placeholder="OAuth Client ID"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
              placeholder="OAuth Client Secret"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </>
        )}
        <button onClick={() => void handleConnect()} disabled={connecting}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >{connecting ? 'Connecting...' : 'Connect'}</button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </IntegrationCard>
  )
}

// ── Backstage Card ───────────────────────────────────────────────────────────

function BackstageCard({ status, onReload }: { status: IntegrationStatus['backstage']; onReload: () => void }): JSX.Element {
  const [baseUrl, setBaseUrl] = useState('')
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    if (!baseUrl.trim() || !token.trim()) { setError('Base URL and token are required'); return }
    setConnecting(true); setError('')
    const result = await window.electronAPI.invoke('integration:backstage-connect', {
      baseUrl: baseUrl.trim(), token: token.trim(),
    }) as { success: boolean; error?: string }
    setConnecting(false)
    if (result.success) { setBaseUrl(''); setToken(''); onReload() }
    else setError(result.error ?? 'Connection failed')
  }

  const handleDisconnect = async () => {
    await window.electronAPI.invoke('integration:backstage-disconnect')
    onReload()
  }

  const caps = status?.capabilities
  const enabledPlugins: string[] = []
  if (caps?.catalog) enabledPlugins.push('Catalog')
  if (caps?.techdocs) enabledPlugins.push('TechDocs')
  if (caps?.scaffolder) enabledPlugins.push('Scaffolder')
  if (caps?.search) enabledPlugins.push('Search')
  if (caps?.kubernetes) enabledPlugins.push('Kubernetes')

  return (
    <IntegrationCard
      logo={<BackstageLogo />}
      name="Backstage"
      description="Software catalog, TechDocs, templates, and more"
      dataDescription="Connect your Backstage developer portal to browse the software catalog, search across services, view TechDocs, and explore templates. Backstage is self-hosted — provide your instance URL and an API token."
      connected={!!status?.connected}
      connectedLabel={status ? `Connected · ${status.baseUrl}` : undefined}
      connectedAt={status?.connectedAt}
      onDisconnect={() => void handleDisconnect()}
      connectedContent={
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Backstage is connected to <strong>{status?.baseUrl}</strong>.
            Try: <em className="text-gray-800">"List all services in the catalog"</em> or <em className="text-gray-800">"Search for API endpoints"</em>
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {enabledPlugins.map(p => (
              <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">{p}</span>
            ))}
          </div>
        </div>
      }
    >
      <p className="text-sm text-gray-600">
        Enter your Backstage instance URL and a bearer token. The token is typically a static API key
        or a JWT from your Backstage session. Ask your Backstage admin for an external access token.
      </p>
      <div className="space-y-2">
        <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://backstage.mycompany.com"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <div className="flex gap-2">
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
            placeholder="Bearer token"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" autoFocus />
          <button onClick={() => void handleConnect()} disabled={connecting}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >{connecting ? 'Connecting...' : 'Connect'}</button>
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </IntegrationCard>
  )
}

// ── Power BI Card ────────────────────────────────────────────────────────────

function PowerBICard({ status, onReload }: { status: IntegrationStatus['powerbi']; onReload: () => void }): JSX.Element {
  const [connecting, setConnecting] = useState(false)
  const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUri: string; message: string } | null>(null)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [clientId, setClientId] = useState('')
  const [tenantId, setTenantId] = useState('')

  const handleConnect = async () => {
    setConnecting(true); setError('')
    const result = await window.electronAPI.invoke('integration:powerbi-connect', {
      clientId: clientId.trim() || undefined,
      tenantId: tenantId.trim() || undefined,
    }) as { success: boolean; deviceCode?: { userCode: string; verificationUri: string; message: string }; error?: string }

    if (result.deviceCode) {
      setDeviceCode(result.deviceCode)
      // The auth will complete asynchronously — listen for the event
      const handler = (_event: unknown, data: { success: boolean; error?: string }) => {
        setConnecting(false)
        setDeviceCode(null)
        if (data.success) onReload()
        else setError(data.error ?? 'Authentication failed')
        window.electronAPI.off('integration:powerbi-auth-complete', handler)
      }
      window.electronAPI.on('integration:powerbi-auth-complete', handler)
    } else if (result.success) {
      setConnecting(false); onReload()
    } else {
      setConnecting(false)
      setError(result.error ?? 'Connection failed')
    }
  }

  const handleDisconnect = async () => {
    await window.electronAPI.invoke('integration:powerbi-disconnect')
    onReload()
  }

  return (
    <IntegrationCard
      logo={<PowerBILogo />}
      name="Power BI"
      description="Workspaces, datasets, reports, dashboards, and refresh history"
      dataDescription="Connect Power BI to browse workspaces, datasets, reports, and dashboards. View refresh history and dataset details. Sign in with your Microsoft work account."
      connected={!!status?.connected}
      connectedLabel={status ? `${status.userPrincipalName}` : undefined}
      connectedAt={status?.connectedAt}
      onDisconnect={() => void handleDisconnect()}
      connectedContent={
        <p className="text-sm text-gray-600">
          Power BI is connected. Try: <em className="text-gray-800">"Show my Power BI workspaces"</em> or <em className="text-gray-800">"List reports in workspace X"</em>
        </p>
      }
    >
      {deviceCode ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{deviceCode.message}</p>
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Enter this code at:</p>
            <a href={deviceCode.verificationUri} target="_blank" rel="noopener noreferrer"
              className="text-indigo-600 text-sm font-medium hover:underline">{deviceCode.verificationUri}</a>
            <p className="text-2xl font-mono font-bold text-gray-900 mt-2 tracking-widest">{deviceCode.userCode}</p>
          </div>
          <p className="text-xs text-gray-400">Waiting for authentication to complete...</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Sign in with your Microsoft work or school account. A device code will be shown
            for you to enter at microsoft.com/devicelogin.
          </p>
          {showAdvanced && (
            <div className="space-y-2 bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium">Advanced (optional)</p>
              <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)}
                placeholder="Custom Azure AD Client ID"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="text" value={tenantId} onChange={(e) => setTenantId(e.target.value)}
                placeholder="Tenant ID (leave blank for any org)"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
          <div className="flex items-center gap-3">
            <button onClick={() => void handleConnect()} disabled={connecting}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >{connecting ? 'Connecting...' : 'Sign in with Microsoft'}</button>
            <button onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >{showAdvanced ? 'Hide advanced' : 'Advanced'}</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </IntegrationCard>
  )
}

// ── Splunk Card ──────────────────────────────────────────────────────────────

function SplunkLogo(): JSX.Element {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="4" fill="#000000"/>
      <text x="12" y="15.5" textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="7" fill="#65A637">&gt;_</text>
      <path d="M5 18.5h14" stroke="#65A637" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function SplunkCard({ status, onReload }: { status: IntegrationStatus['splunk']; onReload: () => void }): JSX.Element {
  const [hostUrl, setHostUrl] = useState('')
  const [authMethod, setAuthMethod] = useState<'token' | 'basic'>('token')
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    if (!hostUrl.trim()) { setError('Host URL is required'); return }
    if (authMethod === 'token' && !token.trim()) { setError('Auth token is required'); return }
    if (authMethod === 'basic' && (!username.trim() || !password.trim())) { setError('Username and password are required'); return }
    setConnecting(true); setError('')
    const result = await window.electronAPI.invoke('integration:splunk-connect', {
      hostUrl: hostUrl.trim(), authMethod,
      token: token.trim() || undefined,
      username: username.trim() || undefined,
      password: password.trim() || undefined,
    }) as { success: boolean; error?: string }
    setConnecting(false)
    if (result.success) { setHostUrl(''); setToken(''); setUsername(''); setPassword(''); onReload() }
    else setError(result.error ?? 'Connection failed')
  }

  const handleDisconnect = async () => {
    await window.electronAPI.invoke('integration:splunk-disconnect')
    onReload()
  }

  return (
    <IntegrationCard
      logo={<SplunkLogo />}
      name="Splunk"
      description="Search jobs, saved searches, indexes, alerts, and dashboards"
      dataDescription="Connect Splunk to run SPL searches, browse saved searches, monitor indexes, view fired alerts, and list dashboards. Supports both auth token and username/password authentication."
      connected={!!status?.connected}
      connectedLabel={status ? `${status.username || 'Connected'} · ${status.hostUrl}` : undefined}
      connectedAt={status?.connectedAt}
      onDisconnect={() => void handleDisconnect()}
      connectedContent={
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Splunk is connected to <strong>{status?.hostUrl}</strong>.
            {status?.serverVersion && <span className="text-xs text-gray-400 ml-1">v{status.serverVersion}</span>}
            <br/>Try: <em className="text-gray-800">"Run a Splunk search for errors in the last hour"</em> or <em className="text-gray-800">"Show my Splunk saved searches"</em>
          </p>
        </div>
      }
    >
      <p className="text-sm text-gray-600">
        Enter your Splunk instance URL (management port, default 8089) and choose an authentication method.
      </p>
      <div className="space-y-2">
        <input type="text" value={hostUrl} onChange={(e) => setHostUrl(e.target.value)}
          placeholder="https://splunk.mycompany.com:8089"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input type="radio" name="splunk-auth" checked={authMethod === 'token'} onChange={() => setAuthMethod('token')} className="text-indigo-600" />
            Auth Token
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input type="radio" name="splunk-auth" checked={authMethod === 'basic'} onChange={() => setAuthMethod('basic')} className="text-indigo-600" />
            Username + Password
          </label>
        </div>
        {authMethod === 'token' ? (
          <div className="flex gap-2">
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
              placeholder="Splunk auth token"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" autoFocus />
            <button onClick={() => void handleConnect()} disabled={connecting}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >{connecting ? 'Connecting...' : 'Connect'}</button>
          </div>
        ) : (
          <div className="space-y-2">
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <div className="flex gap-2">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
                placeholder="Password"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button onClick={() => void handleConnect()} disabled={connecting}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >{connecting ? 'Connecting...' : 'Connect'}</button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </IntegrationCard>
  )
}

// ── Datadog Card ─────────────────────────────────────────────────────────────

function DatadogLogo(): JSX.Element {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="4" fill="#632CA6"/>
      <path d="M15.2 7.4c-.5-.4-1.1-.5-1.6-.3-.3.1-.5.3-.7.5l-1.2-.8c.1-.3.1-.7-.1-1-.3-.4-.8-.6-1.2-.4-.5.2-.7.7-.5 1.2.1.2.3.4.5.5l-.5 1.4c-.4 0-.8.1-1.1.4-.8.6-1 1.6-.6 2.5l-1 .8c-.3-.2-.7-.2-1 0-.4.3-.5.8-.2 1.2.3.4.8.5 1.2.2.2-.1.3-.3.3-.5l1.1-.8c.5.4 1.1.5 1.7.3.2-.1.4-.2.6-.4l1.9 1.3c-.1.3 0 .6.2.9.3.4.8.5 1.2.2.4-.3.5-.8.2-1.2-.2-.3-.5-.4-.8-.4l-1.8-1.3c.3-.6.3-1.3-.1-1.9l1-1.3c.2.1.4.1.6.1.5-.1.9-.5.9-1 0-.5-.3-.9-.8-1z" fill="white"/>
    </svg>
  )
}

const DATADOG_SITES = [
  { value: 'us1', label: 'US1 (datadoghq.com)' },
  { value: 'us3', label: 'US3 (us3.datadoghq.com)' },
  { value: 'us5', label: 'US5 (us5.datadoghq.com)' },
  { value: 'eu1', label: 'EU1 (datadoghq.eu)' },
  { value: 'ap1', label: 'AP1 (ap1.datadoghq.com)' },
  { value: 'gov', label: 'US1-FED (ddog-gov.com)' },
  { value: 'custom', label: 'Custom URL' },
]

function DatadogCard({ status, onReload }: { status: IntegrationStatus['datadog']; onReload: () => void }): JSX.Element {
  const [site, setSite] = useState('us1')
  const [customUrl, setCustomUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [appKey, setAppKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    if (!apiKey.trim() || !appKey.trim()) { setError('Both API Key and Application Key are required'); return }
    if (site === 'custom' && !customUrl.trim()) { setError('Custom URL is required'); return }
    setConnecting(true); setError('')
    const result = await window.electronAPI.invoke('integration:datadog-connect', {
      site, apiKey: apiKey.trim(), appKey: appKey.trim(),
      customUrl: site === 'custom' ? customUrl.trim() : undefined,
    }) as { success: boolean; error?: string }
    setConnecting(false)
    if (result.success) { setApiKey(''); setAppKey(''); setCustomUrl(''); onReload() }
    else setError(result.error ?? 'Connection failed')
  }

  const handleDisconnect = async () => {
    await window.electronAPI.invoke('integration:datadog-disconnect')
    onReload()
  }

  return (
    <IntegrationCard
      logo={<DatadogLogo />}
      name="Datadog"
      description="Monitors, dashboards, metrics, events, incidents, SLOs, hosts, and logs"
      dataDescription="Connect Datadog to monitor alerts, browse dashboards, query metrics, search logs, view incidents, and track SLOs. Requires an API key and Application key from your Datadog organization settings."
      connected={!!status?.connected}
      connectedLabel={status ? `Connected · ${status.site}` : undefined}
      connectedAt={status?.connectedAt}
      onDisconnect={() => void handleDisconnect()}
      connectedContent={
        <p className="text-sm text-gray-600">
          Datadog is connected (<strong>{status?.site}</strong>).
          Try: <em className="text-gray-800">"Show alerting Datadog monitors"</em> or <em className="text-gray-800">"Search Datadog logs for errors"</em>
        </p>
      }
    >
      <p className="text-sm text-gray-600">
        Enter your Datadog site, API key, and Application key.
        Create keys at <span className="text-indigo-600">Organization Settings &rarr; API Keys / Application Keys</span>.
      </p>
      <div className="space-y-2">
        <select value={site} onChange={(e) => setSite(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {DATADOG_SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {site === 'custom' && (
          <input type="text" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://api.custom-datadog.com"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        )}
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          placeholder="API Key"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <div className="flex gap-2">
          <input type="password" value={appKey} onChange={(e) => setAppKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
            placeholder="Application Key"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={() => void handleConnect()} disabled={connecting}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >{connecting ? 'Connecting...' : 'Connect'}</button>
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </IntegrationCard>
  )
}

// ── Custom Integration Card ──────────────────────────────────────────────────

function CustomIntegrationCards({ onReload }: { onReload: () => void }): JSX.Element {
  const [integrations, setIntegrations] = useState<CustomIntegration[]>([])
  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Editor state
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [authType, setAuthType] = useState<CustomIntegration['authType']>('bearer')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')

  const loadCustom = useCallback(async () => {
    const result = await window.electronAPI.invoke('integration:custom-list') as { success: boolean; integrations?: CustomIntegration[] }
    if (result.success && result.integrations) setIntegrations(result.integrations)
  }, [])

  useEffect(() => { void loadCustom() }, [loadCustom])

  const handleSave = async () => {
    if (!name.trim() || !baseUrl.trim()) { setError('Name and Base URL are required'); return }
    setError('')
    const integration: Partial<CustomIntegration> = {
      id: editingId ?? undefined,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      authType,
      auth: {},
      endpoints: [],
      enabled: true,
      createdAt: Date.now(),
    }
    await window.electronAPI.invoke('integration:custom-save', { integration, secret: secret.trim() || undefined })
    setShowEditor(false); setEditingId(null); setName(''); setBaseUrl(''); setSecret('')
    void loadCustom()
    onReload()
  }

  const handleDelete = async (id: string) => {
    await window.electronAPI.invoke('integration:custom-delete', { id })
    void loadCustom()
    onReload()
  }

  const handleTest = async (id: string) => {
    await window.electronAPI.invoke('integration:custom-test', { id })
    void loadCustom()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <CustomAPILogo />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Custom Integrations</h3>
            <p className="text-xs text-gray-500">Connect to any REST API</p>
          </div>
        </div>
        <button
          onClick={() => { setShowEditor(true); setEditingId(null); setName(''); setBaseUrl(''); setSecret(''); setAuthType('bearer') }}
          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
        >+ Add Custom</button>
      </div>

      <div className="px-5 py-4">
        {showEditor && (
          <div className="space-y-3 mb-4 pb-4 border-b border-gray-100">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Integration name (e.g., PagerDuty)"
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v2"
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-xs text-gray-600">Auth:</label>
              <select value={authType} onChange={(e) => setAuthType(e.target.value as CustomIntegration['authType'])}
                className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="api-key">API Key</option>
                <option value="basic">Basic Auth</option>
                <option value="custom-header">Custom Header</option>
              </select>
            </div>
            {authType !== 'none' && (
              <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)}
                placeholder={authType === 'basic' ? 'Password' : 'Token / API Key'}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            )}
            <div className="flex gap-2">
              <button onClick={() => void handleSave()}
                className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors">Save</button>
              <button onClick={() => setShowEditor(false)}
                className="px-3 py-1.5 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        {integrations.length === 0 && !showEditor ? (
          <p className="text-sm text-gray-500">No custom integrations configured. Click "+ Add Custom" to connect to any REST API.</p>
        ) : (
          <div className="space-y-2">
            {integrations.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${i.lastTestSuccess ? 'bg-green-400' : i.lastTestedAt ? 'bg-red-400' : 'bg-gray-300'}`} />
                  <span className="text-sm font-medium text-gray-800">{i.name}</span>
                  <span className="text-xs text-gray-400">{i.baseUrl}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{i.authType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => void handleTest(i.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-500 transition-colors">Test</button>
                  <button onClick={() => void handleDelete(i.id)}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main IntegrationsTab ─────────────────────────────────────────────────────

export default function IntegrationsTab(): JSX.Element {
  const [status, setStatus] = useState<IntegrationStatus>({
    github: null, atlassian: null, servicenow: null, backstage: null,
    powerbi: null, splunk: null, datadog: null,
  })

  const loadStatus = useCallback(async () => {
    const result = await window.electronAPI.invoke('integration:get-status') as IntegrationStatus
    setStatus(result)
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-sm text-gray-500 mt-0.5">Connect external services to pull data into your AI sessions</p>
      </div>

      {/* Source control */}
      <GitHubCard status={status.github} onReload={loadStatus} />

      {/* Project management & knowledge */}
      <AtlassianCard status={status.atlassian} onReload={loadStatus} />
      <ServiceNowCard status={status.servicenow} onReload={loadStatus} />

      {/* Developer portals & analytics */}
      <BackstageCard status={status.backstage} onReload={loadStatus} />
      <PowerBICard status={status.powerbi} onReload={loadStatus} />

      {/* Observability */}
      <SplunkCard status={status.splunk} onReload={loadStatus} />
      <DatadogCard status={status.datadog} onReload={loadStatus} />

      {/* Custom — always last */}
      <CustomIntegrationCards onReload={loadStatus} />
    </div>
  )
}
