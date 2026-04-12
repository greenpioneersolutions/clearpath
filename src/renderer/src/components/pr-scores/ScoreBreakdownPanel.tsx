import { BREAKDOWN_LABELS, timeAgo } from '../../contexts/PrScoresContext'
import type { PrScoreResult } from '../../types/prScores'
import { getScoreColor, getScoreLabel } from '../../types/prScores'
import StatCard from './StatCard'

interface ScoreBreakdownPanelProps {
  score: PrScoreResult
}

export default function ScoreBreakdownPanel({ score }: ScoreBreakdownPanelProps): JSX.Element {
  const breakdownEntries = Object.entries(score.breakdown)

  return (
    <div className="space-y-5">
      {/* Score header */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">
            #{score.prNumber} {score.title}
          </h4>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>by {score.author}</span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              score.state === 'open'
                ? 'bg-green-50 text-green-700'
                : score.state === 'closed'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-purple-50 text-purple-700'
            }`}>
              {score.state}
            </span>
          </div>
        </div>

        {/* Large score circle */}
        <div className="text-center flex-shrink-0">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm"
            style={{ backgroundColor: getScoreColor(score.score) }}
          >
            {Math.round(score.score)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1 font-medium">{getScoreLabel(score.score)}</p>
        </div>
      </div>

      {/* Full breakdown grid */}
      <div>
        <h5 className="text-xs font-semibold text-gray-700 mb-3">Score Breakdown</h5>
        <div className="space-y-3">
          {breakdownEntries.map(([key, val]) => {
            const label = BREAKDOWN_LABELS[key] || key
            const barWidth = Math.min(val.normalized * 100, 100)
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-700 font-medium">{label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-400">
                      Raw: {typeof val.raw === 'number' ? val.raw.toFixed(1) : val.raw}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Norm: {(val.normalized * 100).toFixed(0)}%
                    </span>
                    <span className="text-xs font-semibold text-gray-900">
                      {val.weighted.toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: getScoreColor(val.normalized * 100),
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* File analysis */}
      {score.fileAnalysis && (
        <div>
          <h5 className="text-xs font-semibold text-gray-700 mb-2">File Analysis</h5>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Risk Score"
              value={String(Math.round(score.fileAnalysis.riskScore))}
            />
            <StatCard
              label="Review Depth"
              value={score.fileAnalysis.reviewDepthSignal}
            />
            <StatCard
              label="Test Hygiene"
              value={
                score.fileAnalysis.testHygiene && typeof score.fileAnalysis.testHygiene === 'object'
                  ? Object.keys(score.fileAnalysis.testHygiene).length > 0
                    ? `${Object.keys(score.fileAnalysis.testHygiene).length} signals`
                    : 'None'
                  : 'N/A'
              }
            />
          </div>
        </div>
      )}

      {/* Scored timestamp */}
      <p className="text-[10px] text-gray-400 text-right">
        Scored {timeAgo(score.scoredAt)}
      </p>
    </div>
  )
}
