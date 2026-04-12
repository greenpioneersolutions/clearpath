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
  favorites?: string[]
  repoWeightOverrides?: Record<string, Partial<ScoringWeights>>
  teamMapping?: Record<string, string>
  aiReviewModel?: string
  autoRefreshOnTurnEnd?: boolean
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

export interface ScoringWeights {
  cycleTime: number
  pickupTime: number
  reviewerCount: number
  ciPassRate: number
  changeRequestRatio: number
  idleTime: number
  linesChanged: number
  revertRate: number
  fileRisk: number
  testHygiene: number
  securityPatterns: number
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  cycleTime: 0.20, pickupTime: 0.15, reviewerCount: 0.10,
  ciPassRate: 0.15, changeRequestRatio: 0.10, idleTime: 0.10,
  linesChanged: 0.10, revertRate: 0.10, fileRisk: 0.05,
  testHygiene: 0.03, securityPatterns: 0.02,
}

export const SCORING_WEIGHT_DESCRIPTIONS: Record<keyof ScoringWeights, string> = {
  cycleTime: 'Time from PR creation to merge. Faster merges score higher.',
  pickupTime: 'Time until the first review. Quick pickups score higher.',
  reviewerCount: 'Number of unique reviewers. More reviewers (up to 3) score higher.',
  ciPassRate: 'Percentage of CI checks that passed.',
  changeRequestRatio: 'Proportion of reviews requesting changes. Fewer change requests score higher.',
  idleTime: 'Time the PR sat idle with no activity.',
  linesChanged: 'Total lines added + deleted. Smaller PRs score higher.',
  revertRate: 'Proportion of commits that are reverts.',
  fileRisk: 'Risk score based on files touched (auth, env, migrations, etc.).',
  testHygiene: 'Ratio of test file changes to source file changes.',
  securityPatterns: 'Count of security-sensitive patterns detected.',
}

export interface PrFilters {
  author: string | null
  labels: string[]
  state: 'all' | 'open' | 'closed' | 'merged'
  dateFrom: string | null
  dateTo: string | null
  search: string
}

export const DEFAULT_PR_FILTERS: PrFilters = {
  author: null,
  labels: [],
  state: 'all',
  dateFrom: null,
  dateTo: null,
  search: '',
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
