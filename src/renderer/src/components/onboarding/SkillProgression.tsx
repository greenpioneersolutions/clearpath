import { useState, useEffect } from 'react'

type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert'

interface FeatureItem {
  key: string
  label: string
  description: string
  level: SkillLevel
}

const FEATURES: FeatureItem[] = [
  { key: 'basicPrompts', label: 'Send Prompts', description: 'Send messages to a CLI session', level: 'beginner' },
  { key: 'slashCommands', label: 'Slash Commands', description: 'Use /compact, /model, /clear etc.', level: 'beginner' },
  { key: 'sessionResume', label: 'Resume Sessions', description: 'Continue a previous session', level: 'beginner' },
  { key: 'agentToggle', label: 'Toggle Agents', description: 'Enable/disable built-in agents', level: 'intermediate' },
  { key: 'permissionConfig', label: 'Configure Permissions', description: 'Set permission modes and tool rules', level: 'intermediate' },
  { key: 'templateUse', label: 'Use Templates', description: 'Use a prompt template', level: 'intermediate' },
  { key: 'customAgent', label: 'Custom Agents', description: 'Create your own agent definitions', level: 'advanced' },
  { key: 'mcpServer', label: 'MCP Servers', description: 'Configure Model Context Protocol servers', level: 'advanced' },
  { key: 'budgetConfig', label: 'Budget Controls', description: 'Set spending limits and alerts', level: 'advanced' },
  { key: 'subAgentDelegate', label: 'Delegate Tasks', description: 'Spawn background sub-agent processes', level: 'expert' },
  { key: 'fleetCoordination', label: 'Fleet Coordination', description: 'Coordinate multiple agents with /fleet', level: 'expert' },
  { key: 'configProfile', label: 'Config Profiles', description: 'Save and load configuration profiles', level: 'expert' },
]

const LEVELS: { level: SkillLevel; label: string; color: string; min: number }[] = [
  { level: 'beginner', label: 'Beginner', color: 'bg-green-500', min: 0 },
  { level: 'intermediate', label: 'Intermediate', color: 'bg-blue-500', min: 3 },
  { level: 'advanced', label: 'Advanced', color: 'bg-purple-500', min: 6 },
  { level: 'expert', label: 'Expert', color: 'bg-amber-500', min: 9 },
]

interface Props {
  featureUsage: Record<string, boolean>
  currentLevel: SkillLevel
  progress: number
  total: number
}

export default function SkillProgression({ featureUsage, currentLevel, progress, total }: Props): JSX.Element {
  const pct = (progress / total) * 100
  const currentLevelInfo = LEVELS.find((l) => l.level === currentLevel) ?? LEVELS[0]

  const byLevel = (level: SkillLevel) => FEATURES.filter((f) => f.level === level)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Skill Progression</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Track which features you've tried and level up
        </p>
      </div>

      {/* Level indicator */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full text-white font-bold ${currentLevelInfo.color}`}>
              {currentLevelInfo.label}
            </span>
            <span className="text-sm text-gray-600">{progress} / {total} features explored</span>
          </div>
          <span className="text-sm font-mono text-gray-800">{pct.toFixed(0)}%</span>
        </div>

        {/* Progress bar with level markers */}
        <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${currentLevelInfo.color}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between mt-1">
          {LEVELS.map((l) => (
            <span key={l.level} className={`text-xs ${progress >= l.min ? 'text-gray-700' : 'text-gray-400'}`}>
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Feature checklist by level */}
      {LEVELS.map((level) => {
        const features = byLevel(level.level)
        return (
          <div key={level.level}>
            <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
              currentLevel === level.level ? 'text-indigo-600' : 'text-gray-400'
            }`}>
              {level.label}
            </h4>
            <div className="space-y-1">
              {features.map((f) => {
                const done = featureUsage[f.key]
                return (
                  <div key={f.key} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                    done ? 'bg-green-50' : 'bg-white'
                  }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      done ? 'bg-green-500 text-white' : 'bg-gray-200'
                    }`}>
                      {done && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <span className={`text-sm ${done ? 'text-green-700' : 'text-gray-700'}`}>{f.label}</span>
                      <span className="text-xs text-gray-400 ml-2">{f.description}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
