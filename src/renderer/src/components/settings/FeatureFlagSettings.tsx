import { useFeatureFlags, type FeatureFlags } from '../../contexts/FeatureFlagContext'
import { getStageInfo } from '../../lib/progressiveDisclosure'
import { BUILD_FLAGS, EXPERIMENTAL_FLAG_KEYS } from '../../../../shared/featureFlags.generated'

const COMPILED_OUT: ReadonlySet<keyof FeatureFlags> = new Set(
  EXPERIMENTAL_FLAG_KEYS.filter((k) => !BUILD_FLAGS[k]),
)

// ── Flag groups for organized display ────────────────────────────────────────

interface FlagGroup {
  label: string
  flags: Array<{ key: keyof FeatureFlags; label: string; description: string }>
}

const FLAG_GROUPS: FlagGroup[] = [
  {
    label: 'Home Page',
    flags: [
      { key: 'showHomeHub', label: 'Simple Home', description: 'Clean action hub with 4 options (default). Turn off for the widget dashboard.' },
    ],
  },
  {
    label: 'Main Navigation',
    flags: [
      { key: 'showDashboard', label: 'Dashboard', description: 'Home page with widgets' },
      { key: 'showWork', label: 'Work', description: 'Sessions, agents, tools, templates' },
      { key: 'showInsights', label: 'Insights', description: 'Analytics, cost, compliance' },
      { key: 'showConfigure', label: 'Configure', description: 'Settings, policies, integrations' },
      { key: 'showLearn', label: 'Learning Center', description: 'Guided learning tracks' },
    ],
  },
  {
    label: 'Configure Sections',
    flags: [
      { key: 'showSetupWizard', label: 'Setup Wizard', description: 'Guided first-run setup' },
      { key: 'showSettings', label: 'Settings', description: 'CLI flags, models, budget' },
      { key: 'showPolicies', label: 'Policies', description: 'Governance rules and presets' },
      { key: 'showIntegrations', label: 'Integrations', description: 'GitHub and external services' },
      { key: 'showMemory', label: 'Memory', description: 'Notes, CLAUDE.md, context files' },
      { key: 'showClearMemory', label: 'Clear Memory', description: 'Cross-session AI memory engine. Runs locally. ~700 MB disk + ~600 MB model download on first enable.' },
      { key: 'showSkillsManagement', label: 'Skills Management', description: 'Create, edit, manage skills' },
      { key: 'showSessionWizard', label: 'Session Wizard Config', description: 'Customize wizard options' },
      { key: 'showWorkspaces', label: 'Workspaces', description: 'Multi-repo management' },
      { key: 'showTeamHub', label: 'Team Hub', description: 'Config sharing, marketplace' },
      { key: 'showScheduler', label: 'Scheduler', description: 'Scheduled tasks' },
    ],
  },
  {
    label: 'Work Page Features',
    flags: [
      { key: 'showComposer', label: 'Composer', description: 'Multi-step workflow builder' },
      { key: 'showSubAgents', label: 'Sub-Agents', description: 'Background agent delegation' },
      { key: 'showTemplates', label: 'Templates', description: 'Prompt template library' },
      { key: 'showKnowledgeBase', label: 'Knowledge Base', description: 'Auto-generated project docs' },
      { key: 'showVoice', label: 'Voice', description: 'Voice input and commands' },
    ],
  },
  {
    label: 'Session Features',
    flags: [
      { key: 'showUseContext', label: 'Use Context', description: 'Memory/agent/skill context in wizard' },
      { key: 'showAgentSelection', label: 'Agent Selection', description: 'Pick agents per session' },
      { key: 'showCostTracking', label: 'Cost Tracking', description: 'Per-turn cost estimates' },
      { key: 'showComplianceLogs', label: 'Compliance Logs', description: 'Audit trail and security' },
    ],
  },
  {
    label: 'Settings Sub-features',
    flags: [
      { key: 'showDataManagement', label: 'Data Management', description: 'Storage, reset, compact' },
      { key: 'showBudgetLimits', label: 'Budget & Limits', description: 'Spending controls' },
      { key: 'showPlugins', label: 'Plugins', description: 'Plugin management' },
      { key: 'showEnvVars', label: 'Environment Variables', description: 'Custom env vars' },
      { key: 'showWebhooks', label: 'Webhooks', description: 'External notification hooks' },
    ],
  },
  {
    label: 'Experimental Features',
    flags: [
      { key: 'enableExperimentalFeatures', label: 'Experimental Features', description: 'Master toggle for all experimental features' },
      { key: 'showPrScores', label: 'PR Scores', description: 'Pull request scoring and analytics (requires GitHub integration)' },
      { key: 'prScoresAiReview', label: 'PR Scores AI Review', description: 'Enable AI-powered PR code review via connected CLI' },
      { key: 'showEfficiencyCoach', label: 'Efficiency Coach', description: 'Cost and efficiency insights extension surface.' },
      { key: 'showBackstageExplorer', label: 'Backstage Explorer', description: 'Backstage entity browser experimental page.' },
      { key: 'showMcpServers', label: 'MCP Servers', description: 'MCP server catalog, registry, secrets, and sync (under Connect).' },
    ],
  },
  {
    label: 'Backends (SDK adapters)',
    flags: [
      { key: 'enableClaudeSdk', label: 'Claude SDK backend', description: 'Drive Claude sessions through @anthropic-ai/claude-agent-sdk using ANTHROPIC_API_KEY — no claude CLI binary required.' },
      { key: 'enableCopilotSdk', label: 'Copilot SDK backend', description: 'Drive Copilot sessions through copilot --acp (Agent Client Protocol) over stdio. Still requires the copilot CLI to be installed locally.' },
    ],
  },
]

// ── Component ────────────────────────────────────────────────────────────────

export default function FeatureFlagSettings(): JSX.Element {
  const { flags, activePresetId, presets, setFlag, applyPreset, resetFlags, progressionStage, sessionCount, locked } = useFeatureFlags()

  const enabledCount = Object.values(flags).filter(Boolean).length
  const totalCount = Object.keys(flags).length
  const isProgressive = activePresetId === 'progressive'
  const stageInfo = isProgressive && progressionStage ? getStageInfo(sessionCount) : null

  return (
    <div className="space-y-6">
      {/* Locked-mode banner — replaces interactive controls when CLEARPATH_FLAGS_LOCKED=1 */}
      {locked && (
        <div className="border border-amber-300 bg-amber-50 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-700 mt-0.5" aria-hidden>🔒</span>
            <div>
              <p className="text-sm font-semibold text-amber-900">Flags are locked to features.json defaults</p>
              <p className="text-xs text-amber-800 mt-0.5">
                This build was produced with <code className="text-[10px] bg-amber-100 px-1 py-0.5 rounded">CLEARPATH_FLAGS_LOCKED=1</code>. Toggles, presets, and stored overrides are inert. Off-by-default flags are hidden — they aren't reachable in this build. Rebuild without the flag (or run <code className="text-[10px] bg-amber-100 px-1 py-0.5 rounded">npm run dev</code>) to edit.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progressive Disclosure card — opt-in mode that auto-adjusts visible features */}
      {!locked && (
      <div className={`border rounded-xl p-4 ${isProgressive ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">Auto-reveal features as you grow</span>
              {isProgressive && stageInfo && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-medium">
                  {stageInfo.label} — {sessionCount} session{sessionCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {isProgressive && stageInfo
                ? stageInfo.description
                : 'Start simple and unlock features as you complete more sessions. Recommended for new users.'}
            </p>
          </div>
          <button
            onClick={() => applyPreset(isProgressive ? 'all-on' : 'progressive')}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
              isProgressive ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
            role="switch"
            aria-checked={isProgressive}
            aria-label="Toggle progressive disclosure"
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              isProgressive ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>
      )}

      {/* Presets — hidden in locked mode (no overrides allowed) */}
      {!locked && presets.length > 0 && (
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Quick Presets</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {presets.map((preset) => (
            <button key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className={`text-left p-3 rounded-xl border transition-all ${
                activePresetId === preset.id
                  ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              <span className="text-xs font-semibold text-gray-800">{preset.name}</span>
              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{preset.description}</p>
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Summary */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
        <span className="text-xs text-gray-600">{enabledCount} of {totalCount} features enabled</span>
        {!locked && (
          <button onClick={resetFlags}
            className="text-xs text-indigo-600 hover:text-indigo-500 font-medium">
            Enable All
          </button>
        )}
      </div>

      {/* Flag groups */}
      <div className="space-y-6">
        {FLAG_GROUPS.map((group) => {
          // In locked mode, hide flags whose effective value is false — they
          // aren't reachable in the running app and shouldn't show up as
          // configurable here. Compiled-out experimental flags are also
          // hidden in locked mode (they're already false).
          const visibleFlags = locked ? group.flags.filter(({ key }) => flags[key]) : group.flags
          if (visibleFlags.length === 0) return null
          return (
          <div key={group.label}>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{group.label}</h3>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {visibleFlags.map(({ key, label, description }) => {
                const compiledOut = COMPILED_OUT.has(key)
                const readOnly = locked || compiledOut
                return (
                <div key={key} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className={`text-sm ${compiledOut ? 'text-gray-400' : 'text-gray-800'}`}>{label}</span>
                    <p className="text-[10px] text-gray-400">
                      {description}
                      {compiledOut && (
                        <span className="ml-1 italic">— not included in this build</span>
                      )}
                      {locked && !compiledOut && (
                        <span className="ml-1 italic">— locked to features.json</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => { if (!readOnly) setFlag(key, !flags[key]) }}
                    disabled={readOnly}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      readOnly
                        ? (flags[key] ? 'bg-indigo-300 cursor-not-allowed' : 'bg-gray-200 cursor-not-allowed')
                        : flags[key] ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                    role="switch"
                    aria-checked={flags[key]}
                    aria-disabled={readOnly}
                    aria-label={`Toggle ${label}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      flags[key] ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
                )
              })}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
