import { useState, useMemo } from 'react'
import { usePrScores } from '../../contexts/PrScoresContext'
import type { PrScoresConfig, ScoringWeights } from '../../types/prScores'
import { DEFAULT_SCORING_WEIGHTS, SCORING_WEIGHT_DESCRIPTIONS } from '../../types/prScores'
import ScoreWeightSlider from './ScoreWeightSlider'

export default function SettingsTab(): JSX.Element {
  const { config, saveConfig, favorites } = usePrScores()
  const [draft, setDraft] = useState<PrScoresConfig>({ ...config })
  const [saved, setSaved] = useState(false)

  // Weight state
  const [globalWeights, setGlobalWeights] = useState<ScoringWeights>(() => {
    // Merge defaults with anything in repoWeightOverrides.__global (if we stored it)
    return { ...DEFAULT_SCORING_WEIGHTS }
  })

  // Per-repo overrides
  const [selectedOverrideRepo, setSelectedOverrideRepo] = useState<string>('')
  const [repoOverrides, setRepoOverrides] = useState<Record<string, Partial<ScoringWeights>>>(
    () => draft.repoWeightOverrides ?? {}
  )
  const [overrideUseDefault, setOverrideUseDefault] = useState<Record<string, boolean>>(() => {
    // Track which keys use default per selected repo
    const defaults: Record<string, boolean> = {}
    for (const key of Object.keys(DEFAULT_SCORING_WEIGHTS)) {
      defaults[key] = true
    }
    return defaults
  })

  // Team mapping
  const [teamMappingText, setTeamMappingText] = useState(() => {
    return draft.teamMapping ? JSON.stringify(draft.teamMapping, null, 2) : ''
  })
  const [teamMappingError, setTeamMappingError] = useState<string | null>(null)

  // Total weight calculation
  const totalWeight = useMemo(() => {
    return Object.values(globalWeights).reduce((sum, v) => sum + v, 0)
  }, [globalWeights])

  // The default scorecard sums to ~1.10 (core metrics = 1.0, file analysis bonuses = 0.10).
  // This is intentional — file analysis metrics are bonus points that can push scores above 100.
  // Only warn if the user changes weights significantly away from the default sum.
  const defaultSum = Object.values(DEFAULT_SCORING_WEIGHTS).reduce((s, v) => s + v, 0)
  const weightDeviation = Math.abs(totalWeight - defaultSum)

  // When selecting an override repo, load its values
  const handleSelectOverrideRepo = (repo: string) => {
    setSelectedOverrideRepo(repo)
    if (!repo) return
    const existing = repoOverrides[repo] ?? {}
    const defaults: Record<string, boolean> = {}
    for (const key of Object.keys(DEFAULT_SCORING_WEIGHTS)) {
      defaults[key] = !(key in existing)
    }
    setOverrideUseDefault(defaults)
  }

  const handleOverrideWeightChange = (key: keyof ScoringWeights, value: number) => {
    if (!selectedOverrideRepo) return
    setRepoOverrides((prev) => ({
      ...prev,
      [selectedOverrideRepo]: {
        ...prev[selectedOverrideRepo],
        [key]: value,
      },
    }))
  }

  const handleOverrideToggleDefault = (key: string, useDefault: boolean) => {
    setOverrideUseDefault((prev) => ({ ...prev, [key]: useDefault }))
    if (useDefault && selectedOverrideRepo) {
      setRepoOverrides((prev) => {
        const repoOvr = { ...prev[selectedOverrideRepo] }
        delete repoOvr[key as keyof ScoringWeights]
        return { ...prev, [selectedOverrideRepo]: repoOvr }
      })
    }
  }

  const handleParseTeamMapping = () => {
    if (!teamMappingText.trim()) {
      setTeamMappingError(null)
      setDraft((prev) => ({ ...prev, teamMapping: undefined }))
      return
    }
    try {
      const parsed = JSON.parse(teamMappingText) as Record<string, string>
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setTeamMappingError('Must be a JSON object: { "author": "team" }')
        return
      }
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k !== 'string' || typeof v !== 'string') {
          setTeamMappingError('All keys and values must be strings')
          return
        }
      }
      setTeamMappingError(null)
      setDraft((prev) => ({ ...prev, teamMapping: parsed }))
    } catch {
      setTeamMappingError('Invalid JSON')
    }
  }

  const handleSave = async () => {
    const updated: PrScoresConfig = {
      ...draft,
      repoWeightOverrides: Object.keys(repoOverrides).length > 0 ? repoOverrides : undefined,
    }
    await saveConfig(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleReset = () => {
    setDraft({ ...config })
    setGlobalWeights({ ...DEFAULT_SCORING_WEIGHTS })
    setRepoOverrides(config.repoWeightOverrides ?? {})
    setTeamMappingText(config.teamMapping ? JSON.stringify(config.teamMapping, null, 2) : '')
    setTeamMappingError(null)
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">PR Scores Configuration</h3>
        <p className="text-xs text-gray-500 mt-0.5">Configure how pull requests are scored and analyzed.</p>
      </div>

      {/* ── Scoring Weights ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-800">Scoring Weights</h4>
            <p className="text-[11px] text-gray-500 mt-0.5">Adjust how much each metric contributes to the overall score.</p>
          </div>
          <div className={`text-xs font-mono px-2 py-1 rounded ${
            weightDeviation > 0.05
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            Total: {totalWeight.toFixed(2)}
            {weightDeviation > 0.05 && (
              <span className="ml-1 text-amber-600">(default: {defaultSum.toFixed(2)})</span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {(Object.keys(DEFAULT_SCORING_WEIGHTS) as (keyof ScoringWeights)[]).map((key) => (
            <ScoreWeightSlider
              key={key}
              label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
              description={SCORING_WEIGHT_DESCRIPTIONS[key]}
              value={globalWeights[key]}
              onChange={(v) => setGlobalWeights((prev) => ({ ...prev, [key]: v }))}
            />
          ))}
        </div>
      </div>

      {/* ── Per-Repo Overrides ───────────────────────────────────────────── */}
      {favorites.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
          <div>
            <h4 className="text-sm font-semibold text-gray-800">Per-Repo Weight Overrides</h4>
            <p className="text-[11px] text-gray-500 mt-0.5">Customize scoring weights for specific repositories.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Repository</label>
            <select
              value={selectedOverrideRepo}
              onChange={(e) => handleSelectOverrideRepo(e.target.value)}
              className="w-full max-w-md px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">Select a favorited repository...</option>
              {favorites.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {selectedOverrideRepo && (
            <div className="space-y-4 pt-2 border-t border-gray-100">
              {(Object.keys(DEFAULT_SCORING_WEIGHTS) as (keyof ScoringWeights)[]).map((key) => {
                const useDefault = overrideUseDefault[key] ?? true
                const currentVal = useDefault
                  ? globalWeights[key]
                  : (repoOverrides[selectedOverrideRepo]?.[key] ?? globalWeights[key])
                return (
                  <div key={key} className={useDefault ? 'opacity-50' : ''}>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useDefault}
                          onChange={(e) => handleOverrideToggleDefault(key, e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Use default
                      </label>
                    </div>
                    <ScoreWeightSlider
                      label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                      description={SCORING_WEIGHT_DESCRIPTIONS[key]}
                      value={currentVal}
                      onChange={(v) => {
                        if (!useDefault) handleOverrideWeightChange(key, v)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
        <h4 className="text-sm font-semibold text-gray-800">Filters</h4>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Default Time Range (days)</label>
          <input
            type="number"
            value={draft.defaultTimeRangeDays}
            onChange={(e) => setDraft({ ...draft, defaultTimeRangeDays: parseInt(e.target.value) || 30 })}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-[10px] text-gray-400 mt-1">How far back to look when fetching PRs for scoring.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Label Filters (comma-separated)</label>
          <input
            type="text"
            value={draft.labelFilters.join(', ')}
            onChange={(e) => setDraft({ ...draft, labelFilters: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. bug, feature"
          />
          <p className="text-[10px] text-gray-400 mt-1">Only score PRs with these labels. Leave empty for all PRs.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Exclude Labels (comma-separated)</label>
          <input
            type="text"
            value={draft.excludeLabels.join(', ')}
            onChange={(e) => setDraft({ ...draft, excludeLabels: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. wip, do-not-merge"
          />
          <p className="text-[10px] text-gray-400 mt-1">Skip PRs with these labels when scoring.</p>
        </div>
      </div>

      {/* ── Analysis ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-semibold text-gray-800">Analysis</h4>

        <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.includeCodeAnalysis}
            onChange={(e) => setDraft({ ...draft, includeCodeAnalysis: e.target.checked })}
            className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="font-medium">Include Code Analysis</span>
            <p className="text-[11px] text-gray-500 mt-0.5">Analyze file-level risk, test hygiene, and security patterns.</p>
          </div>
        </label>

        <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.enableAiReview}
            onChange={(e) => setDraft({ ...draft, enableAiReview: e.target.checked })}
            className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="font-medium">Enable AI Review</span>
            <p className="text-[11px] text-gray-500 mt-0.5">Show the AI Review button on scored PRs to generate detailed reviews.</p>
          </div>
        </label>

        {draft.enableAiReview && (
          <div className="ml-8">
            <label className="block text-xs font-medium text-gray-600 mb-1">AI Review Model</label>
            <input
              type="text"
              value={draft.aiReviewModel ?? ''}
              onChange={(e) => setDraft({ ...draft, aiReviewModel: e.target.value || undefined })}
              className="w-full max-w-xs px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. claude-sonnet-4.5"
            />
          </div>
        )}

        <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.autoRefreshOnTurnEnd ?? false}
            onChange={(e) => setDraft({ ...draft, autoRefreshOnTurnEnd: e.target.checked })}
            className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="font-medium">Auto-Refresh on Turn End</span>
            <p className="text-[11px] text-gray-500 mt-0.5">Automatically refresh scores when an AI turn finishes in an active session.</p>
          </div>
        </label>
      </div>

      {/* ── Team Mapping ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-800">Team Mapping</h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Map GitHub usernames to teams for grouped author analytics.
          </p>
        </div>

        <div>
          <textarea
            value={teamMappingText}
            onChange={(e) => setTeamMappingText(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            placeholder={`{\n  "octocat": "Platform",\n  "hubot": "Frontend"\n}`}
          />
          {teamMappingError && (
            <p className="text-xs text-red-600 mt-1">{teamMappingError}</p>
          )}
          <button
            onClick={handleParseTeamMapping}
            className="mt-2 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            Validate & Apply
          </button>
        </div>
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pb-6">
        <button
          onClick={() => void handleSave()}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Save Configuration
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          Reset
        </button>
        {saved && (
          <span className="text-xs text-green-600 font-medium">Saved!</span>
        )}
      </div>
    </div>
  )
}
