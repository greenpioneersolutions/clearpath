import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import NotificationBell from './notifications/NotificationBell'
import { useFeatureFlags, type FeatureFlags } from '../contexts/FeatureFlagContext'
import { useBranding } from '../contexts/BrandingContext'

interface Workspace {
  id: string
  name: string
}

const NAV_ITEMS: Array<{ to: string; label: string; flagKey?: keyof FeatureFlags; requiredFlags?: (keyof FeatureFlags)[]; icon: JSX.Element }> = [
  {
    to: '/',
    label: 'Home',
    flagKey: 'showDashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/work',
    label: 'Work',
    flagKey: 'showWork',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    to: '/insights',
    label: 'Insights',
    flagKey: 'showInsights',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    to: '/pr-scores',
    label: 'PR Scores',
    requiredFlags: ['enableExperimentalFeatures', 'showPrScores'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
  },
]

const CONFIGURE_ITEM = {
  to: '/configure',
  label: 'Configure',
  icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

export default function Sidebar(): JSX.Element {
  const { flags } = useFeatureFlags()
  const { brand } = useBranding()
  const [collapsed, setCollapsed] = useState(false)
  const [policyName, setPolicyName] = useState('Standard')
  const [copilotOk, setCopilotOk] = useState(false)
  const [claudeOk, setClaudeOk] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWsId, setActiveWsId] = useState<string | null>(null)
  const [learnPct, setLearnPct] = useState(0)
  const [learnDismissed, setLearnDismissed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const refreshStatus = async () => {
    const [policy, installed, wsList, wsActive, learnProgress] = await Promise.all([
      window.electronAPI.invoke('policy:get-active') as Promise<{ presetName: string }>,
      window.electronAPI.invoke('cli:check-installed') as Promise<{ copilot: boolean; claude: boolean }>,
      window.electronAPI.invoke('workspace:list') as Promise<Workspace[]>,
      window.electronAPI.invoke('workspace:get-active') as Promise<string | null>,
      window.electronAPI.invoke('learn:get-progress') as Promise<{ percentage: number; dismissed: boolean }>,
    ])
    setPolicyName(policy.presetName)
    setCopilotOk(installed.copilot)
    setClaudeOk(installed.claude)
    setWorkspaces(wsList)
    setActiveWsId(wsActive)
    setLearnPct(learnProgress.percentage)
    setLearnDismissed(learnProgress.dismissed)
  }

  // Re-fetch on route change and on custom 'sidebar:refresh' event
  useEffect(() => { void refreshStatus() }, [location.pathname])

  useEffect(() => {
    const handler = () => void refreshStatus()
    window.addEventListener('sidebar:refresh', handler)
    return () => window.removeEventListener('sidebar:refresh', handler)
  }, [])

  const handleWsChange = (id: string) => {
    setActiveWsId(id || null)
    void window.electronAPI.invoke('workspace:set-active', { id: id || null })
  }

  const linkClass = ({ isActive }: { isActive: boolean }): string =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'text-white shadow-lg'
        : 'hover:text-white'
    } ${collapsed ? 'justify-center' : ''}`

  // Inline style for active/inactive states (brand-driven)
  const linkStyle = (isActive: boolean): React.CSSProperties =>
    isActive
      ? { backgroundColor: brand.colorNavActive, boxShadow: `0 4px 12px ${brand.colorNavActive}33` }
      : { color: brand.colorSidebarText }

  return (
    <aside role="navigation" aria-label="Main navigation"
      className={`${collapsed ? 'w-16' : 'w-52'} flex flex-col h-screen transition-all duration-200 flex-shrink-0`}
      style={{ backgroundColor: brand.colorSidebarBg }}>

      {/* ── Header: Logo + Bell ──────────────────────────────────────────── */}
      <div className={`px-3 pt-4 pb-2 ${collapsed ? 'text-center' : ''}`}>
        <div className="flex items-center justify-between">
          {collapsed ? (
            /* Collapsed: icon only */
            brand.useCustomLogo && brand.customLogoDataUrl ? (
              <img src={brand.customLogoDataUrl} alt={brand.appName} className="mx-auto w-8 h-8 rounded-lg object-contain" />
            ) : (
              <div className="mx-auto w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: brand.colorPrimary }}>
                <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="13" stroke="#fff" strokeWidth="1" opacity="0.15"/>
                  <g opacity="0.35">
                    <line x1="20" y1="7" x2="20" y2="10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="20" y1="30" x2="20" y2="33" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="7" y1="20" x2="10" y2="20" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="30" y1="20" x2="33" y2="20" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                  </g>
                  <path d="M20 20 L30 10" fill="none" stroke={brand.colorAccentLight} strokeWidth="1.5" strokeLinecap="round" opacity="0.85"/>
                  <g transform="translate(20,20) rotate(-45)">
                    <polygon points="0,-11 2.5,-2 0,-4 -2.5,-2" fill="#fff"/>
                  </g>
                  <circle cx="20" cy="20" r="3" fill={brand.colorPrimary} stroke="#fff" strokeWidth="1.5"/>
                  <circle cx="20" cy="20" r="1.5" fill={brand.colorAccentLight}/>
                  <circle cx="31" cy="9" r="2" fill={brand.colorAccentLight}/>
                </svg>
              </div>
            )
          ) : (
            /* Expanded: icon + wordmark */
            <div className="flex items-center gap-2">
              {brand.useCustomLogo && brand.customLogoDataUrl ? (
                <img src={brand.customLogoDataUrl} alt={brand.appName} className="w-8 h-8 rounded-lg object-contain flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: brand.colorPrimary }}>
                  <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="13" stroke="#fff" strokeWidth="1" opacity="0.15"/>
                    <g opacity="0.35">
                      <line x1="20" y1="7" x2="20" y2="10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="20" y1="30" x2="20" y2="33" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="7" y1="20" x2="10" y2="20" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="30" y1="20" x2="33" y2="20" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
                    </g>
                    <path d="M20 20 L30 10" fill="none" stroke={brand.colorAccentLight} strokeWidth="1.5" strokeLinecap="round" opacity="0.85"/>
                    <g transform="translate(20,20) rotate(-45)">
                      <polygon points="0,-11 2.5,-2 0,-4 -2.5,-2" fill="#fff"/>
                    </g>
                    <circle cx="20" cy="20" r="3" fill={brand.colorPrimary} stroke="#fff" strokeWidth="1.5"/>
                    <circle cx="20" cy="20" r="1.5" fill={brand.colorAccentLight}/>
                    <circle cx="31" cy="9" r="2" fill={brand.colorAccentLight}/>
                  </svg>
                </div>
              )}
              <div className="font-semibold text-sm tracking-tight">
                <span className="text-white">{brand.wordmarkParts[0]}</span>
                <span style={{ color: brand.colorSecondary }}>{brand.wordmarkParts[1]}</span>
                <span style={{ color: brand.colorAccent }}>{brand.wordmarkParts[2]}</span>
              </div>
            </div>
          )}
          {!collapsed && <NotificationBell />}
        </div>
      </div>

      {/* ── Status strip: CLI dots + Policy + Workspace ──────────────────── */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-1.5">
          {/* CLI Backend Switcher */}
          <div className="flex rounded-lg bg-gray-800 p-0.5">
            <button
              onClick={() => { /* active backend preference could be stored */ }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                copilotOk ? 'bg-gray-700 text-white' : 'text-gray-500'
              }`}
              title={copilotOk ? 'Copilot connected' : 'Copilot not found'}
              aria-label={copilotOk ? 'Copilot: connected' : 'Copilot: not connected'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${copilotOk ? 'bg-green-400' : 'bg-red-400/60'}`} />
              Copilot
            </button>
            <button
              onClick={() => { /* switch backend */ }}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                claudeOk ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-600'
              }`}
              title={claudeOk ? 'Claude connected' : 'Claude not found'}
              aria-label={claudeOk ? 'Claude: connected' : 'Claude: not connected'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${claudeOk ? 'bg-green-400' : 'bg-red-400/60'}`} />
              Claude
            </button>
          </div>

          {/* Policy badge */}
          <button
            onClick={() => navigate('/configure')}
            className="w-full text-left px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 transition-colors"
            title="Active policy — click to configure"
          >
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Policy</span>
            <span className="block text-xs text-gray-300 truncate">{policyName}</span>
          </button>

          {/* Workspace selector */}
          {workspaces.length > 0 && (
            <select
              value={activeWsId ?? ''}
              onChange={(e) => handleWsChange(e.target.value)}
              className="w-full text-xs bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">No workspace</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="mx-3 border-t" style={{ borderColor: `${brand.colorSidebarText}22` }} />

      {/* ── Nav items ────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 py-3 space-y-1" aria-label="Primary">
        {NAV_ITEMS.filter((item) => {
          if (item.requiredFlags) return item.requiredFlags.every((f) => flags[f])
          if (item.flagKey) return flags[item.flagKey]
          return true
        }).map((item, idx) => (
          <div key={item.to}>
            <NavLink to={item.to} end={item.to === '/'} className={linkClass} style={({ isActive }) => linkStyle(isActive)}>
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </NavLink>

            {/* Conditional Learn nav — between Work (idx 1) and Insights (idx 2) */}
            {idx === 1 && flags.showLearn && !learnDismissed && learnPct < 100 && (
              <NavLink to="/learn" className={linkClass} style={({ isActive }) => linkStyle(isActive)}>
                {/* Graduation cap with progress ring */}
                <div className="relative w-5 h-5 flex-shrink-0">
                  <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="8" fill="none" stroke="#374151" strokeWidth="1.5" />
                    <circle cx="10" cy="10" r="8" fill="none"
                      stroke={learnPct >= 100 ? '#22c55e' : '#6366f1'}
                      strokeWidth="1.5" strokeLinecap="round"
                      strokeDasharray={`${learnPct * 0.503} 50.3`} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9px]">🎓</span>
                </div>
                {!collapsed && (
                  <span className="flex items-center gap-1.5">
                    Learn
                    <span className="text-[9px] text-gray-500">{learnPct}%</span>
                  </span>
                )}
              </NavLink>
            )}
          </div>
        ))}
      </nav>

      {/* ── Configure (pinned to bottom) ─────────────────────────────────── */}
      {flags.showConfigure && (
        <div className="px-2 pb-1">
          <div className="mx-1 border-t mb-2" style={{ borderColor: `${brand.colorSidebarText}22` }} />
          <NavLink to={CONFIGURE_ITEM.to} className={linkClass} style={({ isActive }) => linkStyle(isActive)}>
            {CONFIGURE_ITEM.icon}
            {!collapsed && <span>{CONFIGURE_ITEM.label}</span>}
          </NavLink>
        </div>
      )}

      {/* ── Collapse toggle ──────────────────────────────────────────────── */}
      <div className="px-2 pb-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-400 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <svg className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {!collapsed && <span className="text-[11px]">Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
