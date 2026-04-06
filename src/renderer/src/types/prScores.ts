// ── PR Scores Types ─────────────────────────────────────────────────────────

export interface PrScoreBreakdown {
  cycleTimeHours: { raw: number; normalized: number; weighted: number }
  pickupTimeHours: { raw: number; normalized: number; weighted: number }
  ciPassRate: { raw: number; normalized: number; weighted: number }
  reviewerCount: { raw: number; normalized: number; weighted: number }
  linesChanged: { raw: number; normalized: number; weighted: number }
  [key: string]: { raw: number; normalized: number; weighted: number }
}

export interface PrScoreResult {
  id: string
  repoFullName: string
  prNumber: number
  title: string
  author: string
  state: string
  score: number
  breakdown: PrScoreBreakdown
  fileAnalysis?: FileAnalysisResult
  scoredAt: number
}

export interface FileAnalysisResult {
  riskScore: number
  reviewDepthSignal: 'simple' | 'complex' | 'critical'
  testHygiene: Record<string, unknown>
  securityPatterns: Record<string, unknown>
  codePatterns: Record<string, unknown>
  scopeSpread: Record<string, unknown>
}

export interface RepoMetrics {
  repoFullName: string
  mergeRate: number
  reviewCoverage: number
  buildSuccessRate: number
  stalePrCount: number
  prBacklog: number
  outsizedPrRatio: number
  cycleTime: { median: number; p95: number }
  pickupTime: { median: number; p95: number }
  repoScore: number
  authorMetrics: AuthorMetric[]
  snapshotAt: number
}

export interface AuthorMetric {
  author: string
  prCount: number
  averageScore: number
  avgCycleTime: number
  totalLinesChanged: number
}

export interface PrScoresConfig {
  defaultTimeRangeDays: number
  labelFilters: string[]
  excludeLabels: string[]
  includeCodeAnalysis: boolean
  enableAiReview: boolean
}

export interface ScoreDelta {
  metric: string
  current: number
  previous: number
  delta: number
  direction: 'up' | 'down' | 'flat'
}

export interface GitHubRepo {
  id: number
  name: string
  fullName: string
  description: string | null
  private: boolean
  url: string
  pushedAt: string
  language: string | null
  defaultBranch: string
}

export interface GitHubPR {
  number: number
  title: string
  state: string
  author: string
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  url: string
  body: string | null
  head: string
  base: string
  draft: boolean
  additions: number
  deletions: number
  changedFiles: number
  labels: string[]
  reviewers: string[]
}

export const DEFAULT_PR_SCORES_CONFIG: PrScoresConfig = {
  defaultTimeRangeDays: 30,
  labelFilters: [],
  excludeLabels: [],
  includeCodeAnalysis: false,
  enableAiReview: false,
}

/** Score color thresholds */
export function getScoreColor(score: number): string {
  if (score >= 75) return '#10b981' // green
  if (score >= 60) return '#f59e0b' // yellow
  if (score >= 40) return '#f97316' // orange
  return '#ef4444' // red
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Needs Attention'
}
