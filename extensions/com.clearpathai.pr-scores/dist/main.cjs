'use strict'

const { randomUUID } = require('crypto')

// ── Helpers ──────────────────────────────────────────────────────────────────

// Cache the pull-request-score package (ESM-only, so require() won't work).
const _dynamicImport = new Function('mod', 'return import(mod)')
let _prScorePkg = null
async function getPrScorePackage() {
  if (!_prScorePkg) {
    _prScorePkg = await _dynamicImport('pull-request-score')
  }
  return _prScorePkg
}

const DEFAULT_CONFIG = {
  defaultTimeRangeDays: 30,
  labelFilters: [],
  excludeLabels: [],
  includeCodeAnalysis: false,
  enableAiReview: false,
}

function pruneScoresForRepo(scores, repoFullName, max) {
  const repoScores = scores.filter((s) => s.repoFullName === repoFullName)
  if (repoScores.length <= max) return scores
  repoScores.sort((a, b) => a.scoredAt - b.scoredAt)
  const toRemove = new Set(repoScores.slice(0, repoScores.length - max).map((s) => s.id))
  return scores.filter((s) => !toRemove.has(s.id))
}

// ── Extension Lifecycle ──────────────────────────────────────────────────────

async function activate(ctx) {
  ctx.log.info('PR Scores extension activating...')

  // Initialize default config if not set
  if (!ctx.store.get('config')) {
    ctx.store.set('config', DEFAULT_CONFIG)
  }
  if (!ctx.store.get('scores')) {
    ctx.store.set('scores', [])
  }
  if (!ctx.store.get('repoSnapshots')) {
    ctx.store.set('repoSnapshots', [])
  }

  /** Get GitHub token through host credential proxy */
  async function getGitHubToken() {
    const token = await ctx.invoke('integration:get-github-token')
    if (!token) throw new Error('GitHub token not configured. Connect GitHub in Configure > Integrations.')
    return token
  }

  // ── 1. Get config ───────────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:get-config', async () => {
    return ctx.store.get('config', DEFAULT_CONFIG)
  })

  // ── 2. Set config ───────────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:set-config', async (_e, args) => {
    const current = ctx.store.get('config', DEFAULT_CONFIG)
    const merged = { ...current, ...args }
    ctx.store.set('config', merged)
    return merged
  })

  // ── 3. Collect PRs ──────────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:collect-prs', async (_e, args) => {
    try {
      const auth = await getGitHubToken()
      const { collectPullRequests } = await getPrScorePackage()
      const config = ctx.store.get('config', DEFAULT_CONFIG)
      const since = args.since ?? new Date(Date.now() - config.defaultTimeRangeDays * 86400000).toISOString()
      const prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since, auth })
      return { success: true, prs }
    } catch (err) {
      return { success: false, error: String(err.message ?? err) }
    }
  })

  // ── 4. Score single PR ──────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:score-pr', async (_e, args) => {
    ctx.log.info('Scoring %s/%s #%d', args.owner, args.repo, args.prNumber)
    try {
      const auth = await getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, scorePr, collectPrFiles, analyzePrFiles } = pkg

      const prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since: '1970-01-01T00:00:00Z', auth })
      const pr = prs.find((p) => p.number === args.prNumber)
      if (!pr) {
        return { success: false, error: `PR #${args.prNumber} not found in ${args.owner}/${args.repo}` }
      }

      const scored = scorePr(pr)
      let fileAnalysis

      if (args.includeFileAnalysis) {
        const files = await collectPrFiles({ owner: args.owner, repo: args.repo, prNumber: args.prNumber, auth })
        fileAnalysis = analyzePrFiles(files)
      }

      const repoFullName = `${args.owner}/${args.repo}`
      const record = {
        id: randomUUID(),
        repoFullName,
        prNumber: scored.prNumber,
        title: scored.title,
        author: scored.author ?? 'unknown',
        state: pr.state,
        score: scored.score,
        breakdown: scored.breakdown,
        fileAnalysis,
        scoredAt: Date.now(),
      }

      let scores = ctx.store.get('scores', [])
      scores = scores.filter((s) => !(s.repoFullName === repoFullName && s.prNumber === args.prNumber))
      scores.push(record)
      scores = pruneScoresForRepo(scores, repoFullName, 1000)
      ctx.store.set('scores', scores)

      return { success: true, score: record }
    } catch (err) {
      ctx.log.error('score-pr failed: %s', err.message ?? err)
      return { success: false, error: String(err.message ?? err) }
    }
  })

  // ── 5. Score all PRs ────────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:score-all', async (_e, args) => {
    ctx.log.info('Batch scoring %s/%s', args.owner, args.repo)
    try {
      const auth = await getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, scorePr } = pkg

      const config = ctx.store.get('config', DEFAULT_CONFIG)
      const since = args.since ?? new Date(Date.now() - config.defaultTimeRangeDays * 86400000).toISOString()
      let prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since, auth })

      if (prs.length > 100) prs = prs.slice(0, 100)

      const repoFullName = `${args.owner}/${args.repo}`
      const results = []

      for (const pr of prs) {
        const scored = scorePr(pr)
        results.push({
          id: randomUUID(),
          repoFullName,
          prNumber: scored.prNumber,
          title: scored.title,
          author: scored.author ?? 'unknown',
          state: pr.state,
          score: scored.score,
          breakdown: scored.breakdown,
          scoredAt: Date.now(),
        })
      }

      let scores = ctx.store.get('scores', [])
      const scoredNumbers = new Set(results.map((r) => r.prNumber))
      scores = scores.filter((s) => !(s.repoFullName === repoFullName && scoredNumbers.has(s.prNumber)))
      scores.push(...results)
      scores = pruneScoresForRepo(scores, repoFullName, 1000)
      ctx.store.set('scores', scores)

      return { success: true, scores: results }
    } catch (err) {
      ctx.log.error('score-all failed: %s', err.message ?? err)
      return { success: false, error: String(err.message ?? err) }
    }
  })

  // ── 6. Get cached scores ────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:get-scores', async (_e, args) => {
    const allScores = ctx.store.get('scores', [])
    let repoScores = allScores.filter((s) => s.repoFullName === args.repoFullName)
    repoScores.sort((a, b) => b.scoredAt - a.scoredAt)
    if (args.limit && args.limit > 0) repoScores = repoScores.slice(0, args.limit)
    return repoScores
  })

  // ── 7. Get single score detail ──────────────────────────────────────────

  ctx.registerHandler('pr-scores:get-score-detail', async (_e, args) => {
    const scores = ctx.store.get('scores', [])
    return scores.find((s) => s.repoFullName === args.repoFullName && s.prNumber === args.prNumber) ?? null
  })

  // ── 8. Calculate metrics ────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:calculate-metrics', async (_e, args) => {
    try {
      const auth = await getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, calculateMetrics, scoreMetrics, calculateAuthorMetrics, defaultScorecard } = pkg

      const config = ctx.store.get('config', DEFAULT_CONFIG)
      const since = args.since ?? new Date(Date.now() - config.defaultTimeRangeDays * 86400000).toISOString()
      const prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since, auth })

      const metrics = calculateMetrics(prs)
      const repoScore = scoreMetrics(metrics, defaultScorecard)
      const authorMetrics = calculateAuthorMetrics(prs)

      const repoFullName = `${args.owner}/${args.repo}`
      const snapshot = { repoFullName, metrics, repoScore, authorMetrics, snapshotAt: Date.now() }

      const snapshots = ctx.store.get('repoSnapshots', []).filter((s) => s.repoFullName !== repoFullName)
      snapshots.push(snapshot)
      ctx.store.set('repoSnapshots', snapshots)

      return { success: true, snapshot }
    } catch (err) {
      return { success: false, error: String(err.message ?? err) }
    }
  })

  // ── 9. Get cached repo metrics ──────────────────────────────────────────

  ctx.registerHandler('pr-scores:get-repo-metrics', async (_e, args) => {
    const snapshots = ctx.store.get('repoSnapshots', [])
    return snapshots.find((s) => s.repoFullName === args.repoFullName) ?? null
  })

  // ── 10. Compute deltas ──────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:compute-deltas', async (_e, args) => {
    try {
      const auth = await getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, calculateMetrics, computeDeltas } = pkg

      const config = ctx.store.get('config', DEFAULT_CONFIG)
      const periodDays = args.periodDays ?? config.defaultTimeRangeDays
      const periodMs = periodDays * 86400000

      const now = Date.now()
      const currentSince = new Date(now - periodMs).toISOString()
      const previousSince = new Date(now - periodMs * 2).toISOString()
      const previousUntil = new Date(now - periodMs).toISOString()

      const currentPrs = await collectPullRequests({ owner: args.owner, repo: args.repo, since: currentSince, auth })
      const allPreviousPrs = await collectPullRequests({ owner: args.owner, repo: args.repo, since: previousSince, auth })
      const previousPrs = allPreviousPrs.filter((pr) => pr.createdAt && new Date(pr.createdAt).toISOString() < previousUntil)

      const currentMetrics = calculateMetrics(currentPrs)
      const previousMetrics = calculateMetrics(previousPrs)
      const deltas = computeDeltas(currentMetrics, previousMetrics)

      return { success: true, deltas, currentMetrics, previousMetrics, periodDays }
    } catch (err) {
      return { success: false, error: String(err.message ?? err) }
    }
  })

  // ── 11. Build AI review context ─────────────────────────────────────────

  ctx.registerHandler('pr-scores:build-ai-context', async (_e, args) => {
    try {
      // If prNumber is provided, build single-PR review context (used by AI Review button)
      if (args.prNumber) {
        const auth = await getGitHubToken()
        const pkg = await getPrScorePackage()
        const { collectPullRequests, collectPrFiles, analyzePrFiles, buildAiReviewContext } = pkg

        const prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since: '1970-01-01T00:00:00Z', auth })
        const pr = prs.find((p) => p.number === args.prNumber)
        if (!pr) return { success: false, error: `PR #${args.prNumber} not found` }

        const files = await collectPrFiles({ owner: args.owner, repo: args.repo, prNumber: args.prNumber, auth })
        const analysis = analyzePrFiles(files)
        const reviewContext = buildAiReviewContext(pr, files, analysis)

        return { success: true, context: reviewContext }
      }

      // No prNumber — build repo-level context for Context Source Tagging
      const repoFullName = `${args.owner}/${args.repo}`
      const config = ctx.store.get('config', DEFAULT_CONFIG)

      // Get cached scores
      const allScores = ctx.store.get('scores', [])
      const repoScores = allScores
        .filter((s) => s.repoFullName === repoFullName)
        .sort((a, b) => b.scoredAt - a.scoredAt)

      // Get cached repo metrics
      const snapshots = ctx.store.get('repoSnapshots', [])
      const snapshot = snapshots.find((s) => s.repoFullName === repoFullName)

      // Build formatted markdown context
      const lines = [`## PR Scores — ${repoFullName}`, '']

      if (snapshot) {
        const m = snapshot.metrics || {}
        lines.push('### Repository Health')
        lines.push(`- **Repo Score**: ${snapshot.repoScore ?? 'N/A'}/100`)
        lines.push(`- **Merge Rate**: ${((m.mergeRate || 0) * 100).toFixed(0)}%`)
        lines.push(`- **Review Coverage**: ${((m.reviewCoverage || 0) * 100).toFixed(0)}%`)
        lines.push(`- **Build Success Rate**: ${((m.buildSuccessRate || 0) * 100).toFixed(0)}%`)
        lines.push(`- **Stale PRs**: ${m.stalePrCount || 0}`)
        lines.push(`- **PR Backlog**: ${m.prBacklog || 0}`)
        lines.push(`- **Outsized PR Ratio**: ${((m.outsizedPrRatio || 0) * 100).toFixed(0)}%`)
        lines.push(`- **Snapshot**: ${new Date(snapshot.snapshotAt).toISOString()}`)
        lines.push('')

        if (snapshot.authorMetrics && snapshot.authorMetrics.length > 0) {
          lines.push('### Top Authors (by PR count)')
          const top = snapshot.authorMetrics.slice(0, 10)
          lines.push('| Author | PRs | Avg Score | Cycle Time |')
          lines.push('|--------|-----|-----------|------------|')
          for (const a of top) {
            const ct = a.cycleTime?.median != null ? `${a.cycleTime.median.toFixed(1)}h` : 'N/A'
            lines.push(`| ${a.author} | ${a.prCount} | ${a.averageScore != null ? a.averageScore.toFixed(0) : 'N/A'} | ${ct} |`)
          }
          lines.push('')
        }
      }

      if (repoScores.length > 0) {
        lines.push(`### Recent PR Scores (${Math.min(repoScores.length, 20)} of ${repoScores.length})`)
        lines.push('| PR# | Title | Author | Score | State |')
        lines.push('|-----|-------|--------|-------|-------|')
        for (const s of repoScores.slice(0, 20)) {
          lines.push(`| #${s.prNumber} | ${s.title} | ${s.author} | ${s.score}/100 | ${s.state} |`)
        }
        lines.push('')

        const avg = repoScores.reduce((sum, s) => sum + s.score, 0) / repoScores.length
        lines.push(`**Average Score**: ${avg.toFixed(0)}/100 across ${repoScores.length} scored PRs`)
      } else {
        lines.push('*No PR scores cached yet. Score PRs in the PR Scores extension first.*')
      }

      const context = lines.join('\n')
      return {
        success: true,
        context,
        tokenEstimate: Math.ceil(context.length / 4),
        metadata: { itemCount: repoScores.length, truncated: repoScores.length > 20 },
      }
    } catch (err) {
      return { success: false, error: String(err.message ?? err) }
    }
  })

  // ── 12. Clear scores ────────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:clear-scores', async (_e, args) => {
    if (args?.repoFullName) {
      ctx.store.set('scores', ctx.store.get('scores', []).filter((s) => s.repoFullName !== args.repoFullName))
      ctx.store.set('repoSnapshots', ctx.store.get('repoSnapshots', []).filter((s) => s.repoFullName !== args.repoFullName))
    } else {
      ctx.store.set('scores', [])
      ctx.store.set('repoSnapshots', [])
    }
    return { success: true }
  })

  // ── 13. List scored repos ───────────────────────────────────────────────

  ctx.registerHandler('pr-scores:list-scored-repos', async () => {
    const scores = ctx.store.get('scores', [])
    const counts = {}
    for (const s of scores) {
      counts[s.repoFullName] = (counts[s.repoFullName] || 0) + 1
    }
    return Object.entries(counts).map(([repoFullName, count]) => ({ repoFullName, count }))
  })

  // ── 14. Export CSV ──────────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:export-csv', async (_e, args) => {
    let scores = ctx.store.get('scores', [])
    if (args?.repoFullName) {
      scores = scores.filter((s) => s.repoFullName === args.repoFullName)
    }
    scores.sort((a, b) => b.scoredAt - a.scoredAt)

    const headers = 'Scored At,Repo,PR Number,Title,Author,State,Score'
    const rows = scores.map((s) =>
      [
        new Date(s.scoredAt).toISOString(),
        s.repoFullName,
        s.prNumber,
        `"${s.title.replace(/"/g, '""')}"`,
        s.author,
        s.state,
        s.score,
      ].join(',')
    )
    return [headers, ...rows].join('\n')
  })

  // ── 15. Get author metrics across repos ──────────────────────────────────

  ctx.registerHandler('pr-scores:get-author-metrics', async (_e, args) => {
    try {
      const auth = await getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, calculateAuthorMetrics } = pkg
      const config = ctx.store.get('config', DEFAULT_CONFIG)
      const since = new Date(Date.now() - config.defaultTimeRangeDays * 86400000).toISOString()

      const authorMap = {}

      for (const repoFullName of (args.repos || [])) {
        const [owner, repo] = repoFullName.split('/')
        if (!owner || !repo) continue
        const prs = await collectPullRequests({ owner, repo, since, auth })
        const authorMetrics = calculateAuthorMetrics(prs)

        for (const am of authorMetrics) {
          if (!authorMap[am.author]) {
            authorMap[am.author] = { author: am.author, prCount: 0, totalScore: 0, cycleTimes: [] }
          }
          const entry = authorMap[am.author]
          entry.prCount += am.prCount || 0
          entry.totalScore += (am.averageScore || 0) * (am.prCount || 1)
          if (am.cycleTime) {
            if (am.cycleTime.median != null) entry.cycleTimes.push(am.cycleTime.median)
            if (am.cycleTime.p95 != null) entry.cycleTimes.push(am.cycleTime.p95)
          }
        }
      }

      const merged = Object.values(authorMap).map((entry) => {
        const cycleTimes = entry.cycleTimes.sort((a, b) => a - b)
        return {
          author: entry.author,
          prCount: entry.prCount,
          averageScore: entry.prCount > 0 ? Math.round(entry.totalScore / entry.prCount) : 0,
          cycleTime: {
            median: cycleTimes.length > 0 ? cycleTimes[Math.floor(cycleTimes.length / 2)] : null,
            p95: cycleTimes.length > 0 ? cycleTimes[Math.floor(cycleTimes.length * 0.95)] : null,
          },
        }
      })

      return { success: true, data: merged }
    } catch (err) {
      return { success: false, error: String(err.message ?? err) }
    }
  })

  // ── 16. Get all repo metrics (with caching) ────────────────────────────

  ctx.registerHandler('pr-scores:get-all-repo-metrics', async (_e, args) => {
    try {
      const auth = await getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, calculateMetrics, scoreMetrics, calculateAuthorMetrics, defaultScorecard } = pkg

      const config = ctx.store.get('config', DEFAULT_CONFIG)
      const periodDays = args.periodDays ?? config.defaultTimeRangeDays
      const since = new Date(Date.now() - periodDays * 86400000).toISOString()
      const cacheMaxAge = 60 * 60 * 1000 // 1 hour

      const results = []

      for (const repoFullName of (args.repos || [])) {
        const [owner, repo] = repoFullName.split('/')
        if (!owner || !repo) continue

        // Check cache
        const snapshots = ctx.store.get('repoSnapshots', [])
        const cached = snapshots.find((s) => s.repoFullName === repoFullName)
        if (cached && (Date.now() - cached.snapshotAt) < cacheMaxAge) {
          results.push(cached)
          continue
        }

        // Fetch fresh
        const prs = await collectPullRequests({ owner, repo, since, auth })
        const metrics = calculateMetrics(prs)
        const repoScore = scoreMetrics(metrics, defaultScorecard)
        const authorMetrics = calculateAuthorMetrics(prs)

        const snapshot = { repoFullName, metrics, repoScore, authorMetrics, snapshotAt: Date.now() }

        // Update cache
        const updatedSnapshots = ctx.store.get('repoSnapshots', []).filter((s) => s.repoFullName !== repoFullName)
        updatedSnapshots.push(snapshot)
        ctx.store.set('repoSnapshots', updatedSnapshots)

        results.push(snapshot)
      }

      return { success: true, data: results }
    } catch (err) {
      return { success: false, error: String(err.message ?? err) }
    }
  })

  // ── 17. Generate AI summary for a PR ────────────────────────────────────

  ctx.registerHandler('pr-scores:generate-ai-summary', async (_e, args) => {
    try {
      const auth = await getGitHubToken()
      const pkg = await getPrScorePackage()
      const { collectPullRequests, collectPrFiles, analyzePrFiles, buildAiReviewContext } = pkg

      const prs = await collectPullRequests({ owner: args.owner, repo: args.repo, since: '1970-01-01T00:00:00Z', auth })
      const pr = prs.find((p) => p.number === args.prNumber)
      if (!pr) return { success: false, error: 'PR not found' }

      const files = await collectPrFiles({ owner: args.owner, repo: args.repo, prNumber: args.prNumber, auth })
      const analysis = analyzePrFiles(files)
      const context = buildAiReviewContext(pr, files, analysis)

      // Try to use local LLM
      try {
        const models = await ctx.invoke('local-models:detect')
        const available = models?.ollama?.connected || models?.lmstudio?.connected
        if (!available) {
          return { success: true, data: { summary: null, context: JSON.stringify(context, null, 2), model: null } }
        }

        const model = models?.ollama?.models?.[0] || models?.lmstudio?.models?.[0] || null
        if (!model) {
          return { success: true, data: { summary: null, context: JSON.stringify(context, null, 2), model: null } }
        }

        const prompt = `You are a code reviewer. Analyze this pull request and provide a concise review summary (3-5 bullet points) covering: quality, risks, test coverage, and recommendations.\n\nPR #${args.prNumber}: ${pr.title}\nAuthor: ${pr.author?.login || 'unknown'}\nFiles changed: ${files.length}\nRisk score: ${analysis.riskScore}/100\nReview depth: ${analysis.reviewDepthSignal}\n\nKey findings:\n- Security patterns: ${analysis.securityPatterns?.length || 0} found\n- Test hygiene ratio: ${analysis.testHygiene?.ratio?.toFixed(2) || 'N/A'}\n- Scope spread: ${analysis.scopeSpread?.directoryCount || 0} directories\n- Diff complexity: ${analysis.diffComplexity?.bucket || 'unknown'}`

        const result = await ctx.invoke('local-models:chat', {
          model: model.name || model,
          messages: [{ role: 'user', content: prompt }],
          source: 'pr-scores-review',
        })

        return { success: true, data: { summary: result.content, context: JSON.stringify(context, null, 2), model: model.name || model } }
      } catch (llmErr) {
        return { success: true, data: { summary: null, context: JSON.stringify(context, null, 2), model: null } }
      }
    } catch (err) {
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 18. Record session activity ─────────────────────────────────────────

  ctx.registerHandler('pr-scores:record-session-activity', async (_e, args) => {
    try {
      const activity = ctx.store.get('sessionActivity', {})
      activity[args.sessionId] = {
        lastTurn: args.turnIndex,
        timestamp: Date.now(),
        model: args.model,
      }
      // Keep only last 50 sessions
      const keys = Object.keys(activity)
      if (keys.length > 50) {
        const sorted = keys.sort((a, b) => activity[a].timestamp - activity[b].timestamp)
        for (const k of sorted.slice(0, keys.length - 50)) delete activity[k]
      }
      ctx.store.set('sessionActivity', activity)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err.message || err) }
    }
  })

  // ── 19. Get session PRs ─────────────────────────────────────────────────

  ctx.registerHandler('pr-scores:get-session-prs', async (_e, args) => {
    try {
      const activity = ctx.store.get('sessionActivity', {})
      const session = activity[args.sessionId]
      if (!session) return { success: true, data: [] }

      // Find scores within 1 hour of the session activity
      const scores = ctx.store.get('scores', [])
      const windowMs = 60 * 60 * 1000
      const relevant = scores.filter((s) =>
        Math.abs(s.scoredAt - session.timestamp) < windowMs
      )
      return { success: true, data: relevant }
    } catch (err) {
      return { success: false, error: String(err.message || err) }
    }
  })

  ctx.log.info('PR Scores extension activated — 19 handlers registered')
}

function deactivate() {
  // Handlers are automatically unregistered by the ExtensionMainLoader
}

module.exports = { activate, deactivate }
