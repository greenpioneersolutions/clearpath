import { getScoreColor, getScoreLabel } from '../../types/prScores'

export default function ScoreBadge({ score }: { score: number }): JSX.Element {
  const color = getScoreColor(score)
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: color }}
      title={`${Math.round(score)} - ${getScoreLabel(score)}`}
    >
      {Math.round(score)}
      <span className="sr-only"> - {getScoreLabel(score)}</span>
    </span>
  )
}
