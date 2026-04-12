'use strict'

const { randomUUID } = require('crypto')

// ── Storage Keys & Limits ────────────────────────────────────────────────────

const MAX_TURN_METRICS = 5000
const MAX_SESSION_EFFICIENCY = 200
const MAX_REPORTS = 20
const MAX_DISMISSED_TIPS = 100

// ── Default Config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  contextBudgetTokens: 100000,
  largePromptThresholdChars: 2000,
  retryDetectionSimilarity: 0.8,
  maxSubAgentsPerSession: 2,
  enableInlineTips: true,
  enableContextReview: true,
  analysisModelPreference: null,
}

// ── Extension Lifecycle ──────────────────────────────────────────────────────

let ctx = null

async function activate(context) {
  ctx = context
  ctx.log.info('AI Efficiency Coach extension activating...')

  // ── Configuration ──────────────────────────────────────────────────────

  ctx.registerHandler('efficiency-coach:get-config', async () => {
    const config = ctx.store.get('config', DEFAULT_CONFIG)
    return { ...DEFAULT_CONFIG, ...config }
  })

  ctx.registerHandler('efficiency-coach:set-config', async (_e, args) => {
    const current = ctx.store.get('config', DEFAULT_CONFIG)
    const merged = { ...current, ...args }
    ctx.store.set('config', merged)
    return merged
  })

  // ── Telemetry Recording ────────────────────────────────────────────────

  ctx.registerHandler('efficiency-coach:record-turn', async (_e, args) => {
    const metrics = ctx.store.get('turnMetrics', [])

    // Check if this is a retry (similar to previous prompt)
    const isRetry = metrics.length > 0 && args.sessionId === metrics[metrics.length - 1].sessionId
      && args.promptLength > 0 && metrics[metrics.length - 1].promptLength > 0
      && Math.abs(args.promptLength - metrics[metrics.length - 1].promptLength) < args.promptLength * 0.2

    const metric = {
      id: randomUUID(),
      sessionId: args.sessionId,
      turnIndex: args.turnIndex ?? 0,
      timestamp: Date.now(),
      cli: args.cli ?? 'copilot',
      model: args.model ?? 'default',
      inputTokens: args.inputTokens ?? Math.ceil((args.promptLength || 0) / 4),
      outputTokens: args.outputTokens ?? Math.ceil((args.responseLength || 0) / 4),
      totalTokens: (args.inputTokens || 0) + (args.outputTokens || 0),
      estimatedCostUsd: 0,
      durationMs: args.durationMs ?? 0,
      promptLength: args.promptLength ?? 0,
      responseLength: args.responseLength ?? 0,
      contextTokenEstimate: args.contextTokenEstimate ?? 0,
      hadError: args.hadError ?? false,
      errorType: args.errorType ?? null,
      subAgentCount: args.subAgentCount ?? 0,
      toolCallCount: args.toolCallCount ?? 0,
      isRetry,
    }

    metrics.push(metric)
    if (metrics.length > MAX_TURN_METRICS) metrics.splice(0, metrics.length - MAX_TURN_METRICS)
    ctx.store.set('turnMetrics', metrics)

    return metric
  })

  ctx.registerHandler('efficiency-coach:get-turn-metrics', async (_e, args) => {
    let metrics = ctx.store.get('turnMetrics', [])
    if (args?.sessionId) metrics = metrics.filter((m) => m.sessionId === args.sessionId)
    if (args?.since) metrics = metrics.filter((m) => m.timestamp >= args.since)
    if (args?.limit) metrics = metrics.slice(-args.limit)
    return metrics
  })

  // ── Efficiency Analysis ────────────────────────────────────────────────

  ctx.registerHandler('efficiency-coach:analyze-session', async (_e, args) => {
    const { sessionId } = args
    const metrics = ctx.store.get('turnMetrics', []).filter((m) => m.sessionId === sessionId)
    if (metrics.length === 0) return null

    const config = ctx.store.get('config', DEFAULT_CONFIG)
    const result = analyzeSession(sessionId, metrics, config)

    // Store session efficiency
    const sessions = ctx.store.get('sessionEfficiency', [])
    const idx = sessions.findIndex((s) => s.sessionId === sessionId)
    if (idx >= 0) sessions[idx] = result
    else sessions.push(result)
    if (sessions.length > MAX_SESSION_EFFICIENCY) sessions.splice(0, sessions.length - MAX_SESSION_EFFICIENCY)
    ctx.store.set('sessionEfficiency', sessions)

    return result
  })

  ctx.registerHandler('efficiency-coach:analyze-all', async () => {
    const metrics = ctx.store.get('turnMetrics', [])
    const config = ctx.store.get('config', DEFAULT_CONFIG)

    // Group metrics by session
    const sessionMap = new Map()
    for (const m of metrics) {
      if (!sessionMap.has(m.sessionId)) sessionMap.set(m.sessionId, [])
      sessionMap.get(m.sessionId).push(m)
    }

    // Analyze each session
    const sessionResults = []
    for (const [sid, sMetrics] of sessionMap) {
      sessionResults.push(analyzeSession(sid, sMetrics, config))
    }

    // Store session efficiencies
    ctx.store.set('sessionEfficiency', sessionResults.slice(-MAX_SESSION_EFFICIENCY))

    // Build overall report
    const report = buildReport(sessionResults, metrics, config)

    // Try LLM recommendations
    try {
      const servers = await ctx.invoke('local-models:detect')
      const hasOllama = servers?.ollama?.connected && servers.ollama.models.length > 0
      const hasLmStudio = servers?.lmstudio?.connected && servers.lmstudio.models.length > 0

      if (hasOllama || hasLmStudio) {
        const model = config.analysisModelPreference
          || (hasOllama ? servers.ollama.models[0].name : servers.lmstudio.models[0].name)
        const source = hasOllama ? 'ollama' : 'lmstudio'

        const prompt = buildAnalysisPrompt(report)
        const result = await Promise.race([
          ctx.invoke('local-models:chat', {
            model, source,
            messages: [
              { role: 'system', content: 'You are an AI efficiency advisor. Given usage metrics, provide 3-5 specific, actionable recommendations to reduce AI costs and improve efficiency. Return a JSON array of objects with fields: title, description, estimatedSavingsPercent, severity (info/warning/critical).' },
              { role: 'user', content: prompt },
            ],
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000)),
        ])

        if (result?.content) {
          try {
            const parsed = JSON.parse(result.content.replace(/```json\n?/g, '').replace(/```/g, '').trim())
            if (Array.isArray(parsed)) {
              report.llmRecommendations = parsed.map((r) => r.title || r.description || String(r))
              for (const rec of parsed) {
                report.recommendations.push({
                  id: randomUUID(),
                  severity: rec.severity || 'info',
                  category: 'cost',
                  title: rec.title || 'LLM Recommendation',
                  description: rec.description || '',
                  estimatedSavingsPercent: rec.estimatedSavingsPercent,
                  source: 'llm',
                })
              }
            }
          } catch { /* JSON parse failed, skip LLM recs */ }
        }
      }
    } catch (err) {
      ctx.log.debug('LLM recommendations unavailable: %s', err)
    }

    // Store report
    const reports = ctx.store.get('reports', [])
    reports.push(report)
    if (reports.length > MAX_REPORTS) reports.splice(0, reports.length - MAX_REPORTS)
    ctx.store.set('reports', reports)
    ctx.store.set('lastAnalysis', { timestamp: Date.now(), overallScore: report.overallScore })

    return report
  })

  ctx.registerHandler('efficiency-coach:get-session-efficiency', async (_e, args) => {
    const sessions = ctx.store.get('sessionEfficiency', [])
    return sessions.find((s) => s.sessionId === args.sessionId) ?? null
  })

  ctx.registerHandler('efficiency-coach:get-overall-score', async () => {
    const last = ctx.store.get('lastAnalysis', null)
    const sessions = ctx.store.get('sessionEfficiency', [])
    if (sessions.length === 0) return { score: null, categoryScores: null, lastAnalyzedAt: null }

    const recent = sessions.slice(-20)
    const avgScore = Math.round(recent.reduce((sum, s) => sum + s.score, 0) / recent.length)
    const avgCat = {
      contextEfficiency: Math.round(recent.reduce((s, r) => s + r.categoryScores.contextEfficiency, 0) / recent.length),
      promptQuality: Math.round(recent.reduce((s, r) => s + r.categoryScores.promptQuality, 0) / recent.length),
      modelSelection: Math.round(recent.reduce((s, r) => s + r.categoryScores.modelSelection, 0) / recent.length),
      costOptimization: Math.round(recent.reduce((s, r) => s + r.categoryScores.costOptimization, 0) / recent.length),
    }

    return { score: avgScore, categoryScores: avgCat, lastAnalyzedAt: last?.timestamp ?? null }
  })

  // ── Recommendations ────────────────────────────────────────────────────

  ctx.registerHandler('efficiency-coach:get-recommendations', async (_e, args) => {
    if (args?.sessionId) {
      const sessions = ctx.store.get('sessionEfficiency', [])
      const session = sessions.find((s) => s.sessionId === args.sessionId)
      return session?.recommendations ?? []
    }
    const reports = ctx.store.get('reports', [])
    if (reports.length === 0) return []
    const dismissed = new Set(ctx.store.get('dismissedTips', []))
    return reports[reports.length - 1].recommendations.filter((r) => !dismissed.has(r.id))
  })

  ctx.registerHandler('efficiency-coach:dismiss-recommendation', async (_e, args) => {
    const dismissed = ctx.store.get('dismissedTips', [])
    if (!dismissed.includes(args.id)) {
      dismissed.push(args.id)
      if (dismissed.length > MAX_DISMISSED_TIPS) dismissed.splice(0, dismissed.length - MAX_DISMISSED_TIPS)
      ctx.store.set('dismissedTips', dismissed)
    }
  })

  // ── Context Estimation ─────────────────────────────────────────────────

  ctx.registerHandler('efficiency-coach:estimate-context', async (_e, args) => {
    const config = ctx.store.get('config', DEFAULT_CONFIG)
    const breakdown = []
    let totalChars = 0

    if (args?.noteIds?.length) {
      try {
        const notes = await ctx.invoke('notes:get-full-content', { ids: args.noteIds })
        for (const note of (notes || [])) {
          const chars = (note.content || '').length
          totalChars += chars
          breakdown.push({ type: 'note', id: note.id, name: note.title || 'Note', chars, estimatedTokens: Math.ceil(chars / 4), percentOfTotal: 0 })
        }
      } catch { /* notes unavailable */ }
    }

    if (args?.conversationTokens) {
      const chars = args.conversationTokens * 4
      totalChars += chars
      breakdown.push({ type: 'conversation', name: 'Conversation History', chars, estimatedTokens: args.conversationTokens, percentOfTotal: 0 })
    }

    if (args?.agentContextTokens) {
      const chars = args.agentContextTokens * 4
      totalChars += chars
      breakdown.push({ type: 'agent-context', name: 'Agent System Prompt', chars, estimatedTokens: args.agentContextTokens, percentOfTotal: 0 })
    }

    const totalTokens = Math.ceil(totalChars / 4)
    for (const item of breakdown) {
      item.percentOfTotal = totalTokens > 0 ? Math.round((item.estimatedTokens / totalTokens) * 100) : 0
    }

    const budgetPercent = Math.round((totalTokens / config.contextBudgetTokens) * 100)
    const status = budgetPercent < 50 ? 'green' : budgetPercent < 80 ? 'yellow' : 'red'

    const warnings = []
    const suggestions = []
    if (budgetPercent > 90) warnings.push('Context is near capacity — consider removing less relevant items')
    if (budgetPercent > 50) {
      const largest = breakdown.reduce((a, b) => a.estimatedTokens > b.estimatedTokens ? a : b, { estimatedTokens: 0 })
      if (largest.percentOfTotal > 40) suggestions.push(`"${largest.name}" uses ${largest.percentOfTotal}% of context — consider trimming`)
    }

    return { totalTokens, totalChars, breakdown, budgetPercent, status, warnings, suggestions }
  })

  // ── Reports & Trends ───────────────────────────────────────────────────

  ctx.registerHandler('efficiency-coach:get-reports', async () => {
    return ctx.store.get('reports', []).sort((a, b) => b.createdAt - a.createdAt)
  })

  ctx.registerHandler('efficiency-coach:get-report', async (_e, args) => {
    const reports = ctx.store.get('reports', [])
    return reports.find((r) => r.id === args.reportId) ?? null
  })

  ctx.registerHandler('efficiency-coach:delete-report', async (_e, args) => {
    const reports = ctx.store.get('reports', []).filter((r) => r.id !== args.reportId)
    ctx.store.set('reports', reports)
  })

  ctx.registerHandler('efficiency-coach:get-model-comparison', async () => {
    const metrics = ctx.store.get('turnMetrics', [])
    const modelMap = new Map()

    for (const m of metrics) {
      const key = m.model || 'unknown'
      if (!modelMap.has(key)) modelMap.set(key, { turns: 0, totalTokens: 0, totalCost: 0, errors: 0, totalDuration: 0 })
      const entry = modelMap.get(key)
      entry.turns++
      entry.totalTokens += m.totalTokens || 0
      entry.totalCost += m.estimatedCostUsd || 0
      entry.totalDuration += m.durationMs || 0
      if (m.hadError) entry.errors++
    }

    return [...modelMap.entries()].map(([model, v]) => ({
      model,
      turnCount: v.turns,
      avgTokensPerTurn: Math.round(v.totalTokens / v.turns),
      avgCostPerTurn: v.totalCost / v.turns,
      errorRate: v.errors / v.turns,
      avgDurationMs: Math.round(v.totalDuration / v.turns),
      efficiencyScore: Math.max(0, Math.min(100, 100 - (v.errors / v.turns) * 30 - (v.totalTokens / v.turns > 50000 ? 20 : 0))),
    }))
  })

  ctx.registerHandler('efficiency-coach:get-patterns', async () => {
    const sessions = ctx.store.get('sessionEfficiency', [])
    const patternMap = new Map()

    for (const s of sessions) {
      for (const p of (s.patterns || [])) {
        if (!patternMap.has(p.id)) patternMap.set(p.id, { ...p, occurrences: 0, affectedSessions: [] })
        const entry = patternMap.get(p.id)
        entry.occurrences += p.occurrences
        if (!entry.affectedSessions.includes(s.sessionId)) entry.affectedSessions.push(s.sessionId)
      }
    }

    return [...patternMap.values()].sort((a, b) => b.occurrences - a.occurrences)
  })

  ctx.registerHandler('efficiency-coach:get-trends', async (_e, args) => {
    const days = args?.days ?? 30
    const sessions = ctx.store.get('sessionEfficiency', [])
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const recent = sessions.filter((s) => s.analyzedAt >= cutoff)

    const dayMap = new Map()
    for (const s of recent) {
      const date = new Date(s.analyzedAt).toISOString().slice(0, 10)
      if (!dayMap.has(date)) dayMap.set(date, { score: 0, count: 0, tokens: 0, cost: 0 })
      const entry = dayMap.get(date)
      entry.score += s.score
      entry.count++
      entry.tokens += s.totalTokens || 0
      entry.cost += s.totalCostUsd || 0
    }

    return [...dayMap.entries()]
      .map(([date, v]) => ({
        date,
        score: Math.round(v.score / v.count),
        tokenCount: v.tokens,
        costUsd: v.cost,
        sessionCount: v.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  })

  // ── Efficiency Mode ────────────────────────────────────────────────────

  ctx.registerHandler('efficiency-coach:enable-efficiency-mode', async () => {
    try {
      const currentFlags = await ctx.invoke('feature-flags:get')
      const flags = currentFlags?.flags ?? currentFlags ?? {}
      const previousFlags = {
        showSubAgents: flags.showSubAgents ?? true,
        showComposer: flags.showComposer ?? false,
        showScheduler: flags.showScheduler ?? false,
      }

      ctx.store.set('modeState', { enabled: true, enabledAt: Date.now(), previousFlags })

      await ctx.invoke('feature-flags:set', {
        showSubAgents: false,
        showComposer: false,
        showScheduler: false,
      })

      await ctx.invoke('extension:notify', {
        title: 'Efficiency Mode Enabled',
        message: 'Sub-agents, composer, and scheduler have been disabled to optimize usage.',
        severity: 'info',
      })

      return { success: true }
    } catch (err) {
      ctx.log.error('Failed to enable efficiency mode: %s', err)
      return { success: false, error: String(err) }
    }
  })

  ctx.registerHandler('efficiency-coach:disable-efficiency-mode', async () => {
    try {
      const state = ctx.store.get('modeState', { enabled: false })
      if (state.previousFlags) {
        await ctx.invoke('feature-flags:set', state.previousFlags)
      }
      ctx.store.set('modeState', { enabled: false })

      await ctx.invoke('extension:notify', {
        title: 'Efficiency Mode Disabled',
        message: 'Previous feature settings have been restored.',
        severity: 'info',
      })

      return { success: true }
    } catch (err) {
      ctx.log.error('Failed to disable efficiency mode: %s', err)
      return { success: false, error: String(err) }
    }
  })

  ctx.registerHandler('efficiency-coach:get-mode-state', async () => {
    return ctx.store.get('modeState', { enabled: false })
  })

  // ── Data Management ────────────────────────────────────────────────────

  ctx.registerHandler('efficiency-coach:clear-data', async (_e, args) => {
    const what = args?.what ?? 'all'
    if (what === 'all' || what === 'metrics') ctx.store.set('turnMetrics', [])
    if (what === 'all' || what === 'sessions') ctx.store.set('sessionEfficiency', [])
    if (what === 'all' || what === 'reports') {
      ctx.store.set('reports', [])
      ctx.store.set('lastAnalysis', null)
    }
    if (what === 'all') ctx.store.set('dismissedTips', [])
    return { success: true }
  })

  ctx.log.info('AI Efficiency Coach extension activated with %d handlers', 21)
}

async function deactivate() {
  ctx?.log?.info('AI Efficiency Coach extension deactivating...')
  ctx = null
}

// ── Analysis Helpers ─────────────────────────────────────────────────────────

function analyzeSession(sessionId, metrics, config) {
  let score = 100
  let errorCount = 0
  let retryCount = 0
  let largePromptCount = 0
  let contextOverflowCount = 0
  let totalTokens = 0
  let totalCost = 0
  let totalDuration = 0
  const patterns = []

  for (const m of metrics) {
    totalTokens += m.totalTokens || 0
    totalCost += m.estimatedCostUsd || 0
    totalDuration += m.durationMs || 0

    if (m.hadError) { errorCount++; score -= 3 }
    if (m.isRetry) { retryCount++; score -= 5 }
    if (m.promptLength > config.largePromptThresholdChars) { largePromptCount++; score -= 2 }
    if (m.contextTokenEstimate > config.contextBudgetTokens * 0.9) { contextOverflowCount++; score -= 5 }
  }

  // Cap per-category penalties
  score = Math.max(score, 100 - 15 - 15 - 10 - 10)

  // Session-level penalties
  const subAgentTotal = metrics.reduce((s, m) => s + (m.subAgentCount || 0), 0)
  if (subAgentTotal > config.maxSubAgentsPerSession) { score -= 10; }

  if (metrics.length < 3 && errorCount === 0 && totalDuration < 60000) {
    score -= 8 // Abandoned session
    patterns.push({ id: 'abandoned-session', label: 'Abandoned Session', description: 'Session ended quickly with few turns', severity: 'info', occurrences: 1, affectedSessions: [sessionId], estimatedWasteTokens: totalTokens })
  }

  // Bonuses
  if (errorCount === 0) score += 5
  if (metrics.length >= 3 && totalTokens < 50000) score += 2

  score = Math.max(0, Math.min(100, score))

  // Pattern detection
  if (contextOverflowCount > metrics.length * 0.5) {
    patterns.push({ id: 'wasteful-context', label: 'Wasteful Context', description: 'Context frequently near budget limit', severity: 'warning', occurrences: contextOverflowCount, affectedSessions: [sessionId], estimatedWasteTokens: contextOverflowCount * 10000 })
  }
  if (retryCount > metrics.length * 0.2) {
    patterns.push({ id: 'excessive-retries', label: 'Excessive Retries', description: 'Many prompts appear to be retries', severity: 'warning', occurrences: retryCount, affectedSessions: [sessionId], estimatedWasteTokens: retryCount * 5000 })
  }
  if (largePromptCount > metrics.length * 0.3) {
    patterns.push({ id: 'large-prompts', label: 'Large Prompts', description: 'Many prompts exceed size threshold', severity: 'info', occurrences: largePromptCount, affectedSessions: [sessionId], estimatedWasteTokens: largePromptCount * 3000 })
  }

  // Category scores
  const errorRate = metrics.length > 0 ? errorCount / metrics.length : 0
  const retryRate = metrics.length > 0 ? retryCount / metrics.length : 0
  const avgContext = metrics.length > 0 ? metrics.reduce((s, m) => s + (m.contextTokenEstimate || 0), 0) / metrics.length : 0

  const categoryScores = {
    contextEfficiency: Math.max(0, Math.min(100, 100 - (avgContext > config.contextBudgetTokens * 0.8 ? 30 : 0) - contextOverflowCount * 10)),
    promptQuality: Math.max(0, Math.min(100, 100 - retryRate * 50 - errorRate * 30 - largePromptCount * 5)),
    modelSelection: Math.max(0, Math.min(100, 85)), // TODO: better model analysis
    costOptimization: Math.max(0, Math.min(100, 100 - (totalCost > 1 ? 20 : 0) - (totalTokens > 200000 ? 15 : 0))),
  }

  // Recommendations
  const recommendations = buildDeterministicRecommendations(patterns, errorRate, retryRate, avgContext, config)

  return {
    sessionId,
    sessionName: null,
    cli: metrics[0]?.cli ?? 'copilot',
    analyzedAt: Date.now(),
    score,
    turnCount: metrics.length,
    totalTokens,
    totalCostUsd: totalCost,
    durationMs: totalDuration,
    categoryScores,
    patterns,
    recommendations,
  }
}

function buildReport(sessionResults, allMetrics, config) {
  const sessionCount = sessionResults.length
  if (sessionCount === 0) {
    return {
      id: randomUUID(), createdAt: Date.now(), overallScore: 0,
      sessionCount: 0, totalTokens: 0, totalCostUsd: 0,
      categoryScores: { contextEfficiency: 0, promptQuality: 0, modelSelection: 0, costOptimization: 0 },
      topPatterns: [], recommendations: [], modelComparisons: [], trendData: [],
    }
  }

  const overallScore = Math.round(sessionResults.reduce((s, r) => s + r.score, 0) / sessionCount)
  const totalTokens = sessionResults.reduce((s, r) => s + r.totalTokens, 0)
  const totalCostUsd = sessionResults.reduce((s, r) => s + r.totalCostUsd, 0)

  const categoryScores = {
    contextEfficiency: Math.round(sessionResults.reduce((s, r) => s + r.categoryScores.contextEfficiency, 0) / sessionCount),
    promptQuality: Math.round(sessionResults.reduce((s, r) => s + r.categoryScores.promptQuality, 0) / sessionCount),
    modelSelection: Math.round(sessionResults.reduce((s, r) => s + r.categoryScores.modelSelection, 0) / sessionCount),
    costOptimization: Math.round(sessionResults.reduce((s, r) => s + r.categoryScores.costOptimization, 0) / sessionCount),
  }

  // Aggregate patterns
  const patternMap = new Map()
  for (const s of sessionResults) {
    for (const p of (s.patterns || [])) {
      if (!patternMap.has(p.id)) patternMap.set(p.id, { ...p, occurrences: 0, affectedSessions: [] })
      const entry = patternMap.get(p.id)
      entry.occurrences += p.occurrences
      if (!entry.affectedSessions.includes(s.sessionId)) entry.affectedSessions.push(s.sessionId)
    }
  }
  const topPatterns = [...patternMap.values()].sort((a, b) => b.occurrences - a.occurrences).slice(0, 5)

  // Aggregate recommendations
  const recommendations = []
  const seenTitles = new Set()
  for (const s of sessionResults) {
    for (const r of (s.recommendations || [])) {
      if (!seenTitles.has(r.title)) {
        seenTitles.add(r.title)
        recommendations.push(r)
      }
    }
  }

  return {
    id: randomUUID(),
    createdAt: Date.now(),
    overallScore,
    sessionCount,
    totalTokens,
    totalCostUsd,
    categoryScores,
    topPatterns,
    recommendations: recommendations.slice(0, 10),
    modelComparisons: [],
    trendData: [],
  }
}

function buildDeterministicRecommendations(patterns, errorRate, retryRate, avgContext, config) {
  const recs = []

  for (const p of patterns) {
    switch (p.id) {
      case 'wasteful-context':
        recs.push({
          id: randomUUID(), severity: 'warning', category: 'context',
          title: 'Trim conversation context',
          description: 'Your context frequently exceeds 80% of the budget. Use /compact to compress history before long sessions.',
          estimatedSavingsPercent: 20, source: 'deterministic',
        })
        break
      case 'excessive-retries':
        recs.push({
          id: randomUUID(), severity: 'warning', category: 'prompt',
          title: 'Improve prompt clarity',
          description: 'Many prompts appear to be retries. Write more specific, detailed prompts to reduce back-and-forth.',
          estimatedSavingsPercent: 15, source: 'deterministic',
        })
        break
      case 'large-prompts':
        recs.push({
          id: randomUUID(), severity: 'info', category: 'prompt',
          title: 'Break down large prompts',
          description: 'Several prompts exceed the size threshold. Consider breaking complex requests into smaller, focused steps.',
          estimatedSavingsPercent: 10, source: 'deterministic',
        })
        break
      case 'abandoned-session':
        recs.push({
          id: randomUUID(), severity: 'info', category: 'workflow',
          title: 'Complete or reuse sessions',
          description: 'Some sessions are abandoned quickly. Consider continuing existing sessions instead of starting new ones.',
          estimatedSavingsPercent: 5, source: 'deterministic',
        })
        break
    }
  }

  if (errorRate > 0.2) {
    recs.push({
      id: randomUUID(), severity: 'warning', category: 'prompt',
      title: 'Reduce error rate',
      description: `${Math.round(errorRate * 100)}% of your turns resulted in errors. Review your prompts and ensure the CLI is properly configured.`,
      estimatedSavingsPercent: 10, source: 'deterministic',
    })
  }

  if (avgContext > config.contextBudgetTokens * 0.5) {
    recs.push({
      id: randomUUID(), severity: 'info', category: 'context',
      title: 'Review attached notes',
      description: 'Your average context size is high. Remove notes that are not relevant to the current task.',
      estimatedSavingsPercent: 15, source: 'deterministic',
    })
  }

  return recs
}

function buildAnalysisPrompt(report) {
  return `Analyze this AI usage summary and provide 3-5 actionable recommendations:
- Sessions: ${report.sessionCount}, Overall Score: ${report.overallScore}/100
- Total Tokens: ${report.totalTokens.toLocaleString()}, Total Cost: $${report.totalCostUsd.toFixed(2)}
- Context Efficiency: ${report.categoryScores.contextEfficiency}/100
- Prompt Quality: ${report.categoryScores.promptQuality}/100
- Model Selection: ${report.categoryScores.modelSelection}/100
- Cost Optimization: ${report.categoryScores.costOptimization}/100
- Patterns detected: ${report.topPatterns.map((p) => p.label).join(', ') || 'none'}
Reply with JSON array: [{"title": "...", "description": "...", "estimatedSavingsPercent": 10, "severity": "info"}]`
}

module.exports = { activate, deactivate }
