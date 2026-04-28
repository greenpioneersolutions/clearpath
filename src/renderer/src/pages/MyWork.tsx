/**
 * MyWork.tsx — "What do I own right now" aggregation page.
 *
 * Read-only dashboard that pulls together:
 *   - Jira issues assigned to currentUser() that are not Done
 *   - The current active sprint + my issues in it + sprint progress
 *   - GitHub PRs I authored (open)
 *   - GitHub PRs awaiting my review (review-requested:@me)
 *   - GitHub @-mentions on open issues + PRs
 *
 * Routed at `/my-work`. Distinct from `/work` (Sessions chat hub) — see the
 * naming-conflict note in CLAUDE.md.
 *
 * Connection-state UX:
 *   - Both off → big empty state with "Connect" CTAs to /connect
 *   - One off → that section is replaced by an inline disconnected card
 *   - Both on, both empty → "All clear" empty state
 *
 * Data flow: two fan-out IPC calls (`integration:jira-my-work` and
 * `integration:github-my-work`), no local persistence. Manual refresh button
 * + last-updated timestamp; the page does NOT auto-poll.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFlag } from '../contexts/FeatureFlagContext'
import type {
  AtlassianStatus,
  GitHubStatus,
  JiraIssue,
  JiraSprint,
} from '../types/integrations'

// ── Response types (mirror the IPC handler shapes) ──────────────────────────

interface ActiveSprintInfo extends JiraSprint {
  boardId: number
  boardName: string
}

interface JiraMyWorkResponse {
  success: boolean
  error?: string
  assignedIssues: JiraIssue[]
  activeSprint: ActiveSprintInfo | null
  sprintIssues: JiraIssue[]
  sprintError: string | null
  assignedError: string | null
}

interface GitHubMyWorkItem {
  type: 'pull' | 'issue'
  number: number
  title: string
  state: string
  repo: string
  author: string
  url: string
  updatedAt: string | null
  draft: boolean
  labels: string[]
}

interface GitHubMyWorkResponse {
  success: boolean
  error?: string
  authored: GitHubMyWorkItem[]
  reviewRequested: GitHubMyWorkItem[]
  mentions: GitHubMyWorkItem[]
  authoredError: string | null
  reviewRequestedError: string | null
  mentionsError: string | null
}

interface IntegrationStatus {
  github: GitHubStatus | null
  atlassian: AtlassianStatus | null
}

// ── Small visual primitives ─────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: string }): JSX.Element {
  const color = (() => {
    const p = priority.toLowerCase()
    if (p.includes('highest') || p.includes('critical') || p.includes('blocker')) return 'bg-red-500'
    if (p.includes('high')) return 'bg-orange-500'
    if (p.includes('medium')) return 'bg-yellow-500'
    if (p.includes('low')) return 'bg-blue-400'
    return 'bg-gray-300'
  })()
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color}`}
      title={priority}
      aria-label={`Priority: ${priority}`}
    />
  )
}

function StatusPill({ status, statusCategory }: { status: string; statusCategory: string }): JSX.Element {
  const cat = (statusCategory || '').toLowerCase()
  const cls =
    cat === 'done'
      ? 'bg-green-50 text-green-700 ring-green-600/20'
      : cat === 'in progress'
        ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
        : 'bg-gray-100 text-gray-700 ring-gray-500/20'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ring-1 ring-inset ${cls}`}>
      {status || 'Unknown'}
    </span>
  )
}

function PrStatePill({ state, draft }: { state: string; draft: boolean }): JSX.Element {
  if (draft) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-500/20">
        Draft
      </span>
    )
  }
  if (state === 'open') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20">
        Open
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20">
      {state}
    </span>
  )
}

function ConnectionPill({ label, connected }: { label: string; connected: boolean }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${
        connected
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-gray-50 text-gray-500 border-gray-200'
      }`}
      title={`${label}: ${connected ? 'connected' : 'not connected'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
      {label}
    </span>
  )
}

function CardShell({
  title,
  subtitle,
  count,
  children,
  testId,
}: {
  title: string
  subtitle?: string
  count?: number
  children: React.ReactNode
  testId?: string
}): JSX.Element {
  return (
    <section
      className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col"
      data-testid={testId}
    >
      <header className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {typeof count === 'number' && (
          <span className="text-xs font-medium text-gray-500">{count}</span>
        )}
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  )
}

function EmptyRow({ message }: { message: string }): JSX.Element {
  return (
    <div className="text-sm text-gray-400 text-center py-8 italic">{message}</div>
  )
}

function ErrorRow({ message }: { message: string }): JSX.Element {
  return (
    <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
      {message}
    </div>
  )
}

function DisconnectedCard({
  service,
  onConnect,
}: {
  service: 'jira' | 'github'
  onConnect: () => void
}): JSX.Element {
  const label = service === 'jira' ? 'Jira' : 'GitHub'
  return (
    <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center text-center">
      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-900">Connect {label}</h3>
      <p className="text-xs text-gray-500 mt-1 max-w-xs">
        My Work shows your assigned {label === 'Jira' ? 'issues and current sprint' : 'PRs, review requests, and mentions'} once {label} is connected.
      </p>
      <button
        type="button"
        onClick={onConnect}
        className="mt-4 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
      >
        Connect {label} →
      </button>
    </div>
  )
}

// ── List item components ────────────────────────────────────────────────────

function JiraIssueRow({ issue, siteUrl }: { issue: JiraIssue; siteUrl: string }): JSX.Element {
  const url = siteUrl ? `${siteUrl}/browse/${issue.key}` : '#'
  return (
    <li className="group">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <PriorityDot priority={issue.priority} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-mono font-medium text-indigo-600">{issue.key}</span>
            <span className="truncate">{issue.issueType}</span>
          </div>
          <div className="text-sm text-gray-900 truncate group-hover:underline">{issue.summary}</div>
        </div>
        <StatusPill status={issue.status} statusCategory={issue.statusCategory} />
      </a>
    </li>
  )
}

function GitHubItemRow({ item }: { item: GitHubMyWorkItem }): JSX.Element {
  return (
    <li className="group">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <span className="mt-0.5 text-gray-400 flex-shrink-0" aria-hidden>
          {item.type === 'pull' ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 3a3 3 0 11-3 3M8 21a3 3 0 11-3-3m0 0V8m0 10h8a3 3 0 003-3V8" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
              <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-mono">{item.repo}</span>
            <span>#{item.number}</span>
            <span className="truncate">by {item.author}</span>
          </div>
          <div className="text-sm text-gray-900 truncate group-hover:underline">{item.title}</div>
        </div>
        <PrStatePill state={item.state} draft={item.draft} />
      </a>
    </li>
  )
}

// ── Sprint progress bar ─────────────────────────────────────────────────────

function SprintCard({
  sprint,
  issues,
  siteUrl,
  error,
}: {
  sprint: ActiveSprintInfo | null
  issues: JiraIssue[]
  siteUrl: string
  error: string | null
}): JSX.Element {
  if (error && !sprint) {
    return (
      <CardShell title="Current sprint" testId="my-work-sprint-card">
        <ErrorRow message={`Couldn't load sprint: ${error}`} />
      </CardShell>
    )
  }
  if (!sprint) {
    return (
      <CardShell title="Current sprint" testId="my-work-sprint-card">
        <EmptyRow message="No active sprint." />
      </CardShell>
    )
  }

  const total = issues.length
  const done = issues.filter((i) => (i.statusCategory ?? '').toLowerCase() === 'done').length
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <CardShell
      title={sprint.name || 'Current sprint'}
      subtitle={
        sprint.boardName
          ? `${sprint.boardName}${sprint.endDate ? ` · ends ${new Date(sprint.endDate).toLocaleDateString()}` : ''}`
          : undefined
      }
      testId="my-work-sprint-card"
    >
      {sprint.goal && (
        <p className="text-xs text-gray-600 italic mb-3 line-clamp-2">{sprint.goal}</p>
      )}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>
            {done} / {total} done
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {issues.length === 0 ? (
        <EmptyRow message="No issues in this sprint yet." />
      ) : (
        <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
          {issues.slice(0, 20).map((issue) => (
            <JiraIssueRow key={issue.id} issue={issue} siteUrl={siteUrl} />
          ))}
        </ul>
      )}
    </CardShell>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function MyWork(): JSX.Element {
  const enabled = useFlag('showMyWork')
  const navigate = useNavigate()

  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [jira, setJira] = useState<JiraMyWorkResponse | null>(null)
  const [github, setGithub] = useState<GitHubMyWorkResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const jiraConnected = Boolean(status?.atlassian?.connected && status?.atlassian?.jiraEnabled)
  const githubConnected = Boolean(status?.github?.connected)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const s = (await window.electronAPI.invoke('integration:get-status')) as IntegrationStatus
      setStatus(s)

      const jiraOk = Boolean(s?.atlassian?.connected && s?.atlassian?.jiraEnabled)
      const ghOk = Boolean(s?.github?.connected)

      const [j, g] = await Promise.all([
        jiraOk
          ? (window.electronAPI.invoke('integration:jira-my-work') as Promise<JiraMyWorkResponse>)
          : Promise.resolve(null),
        ghOk
          ? (window.electronAPI.invoke('integration:github-my-work') as Promise<GitHubMyWorkResponse>)
          : Promise.resolve(null),
      ])
      setJira(j)
      setGithub(g)
      setLastUpdated(Date.now())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void fetchAll()
  }, [enabled, fetchAll])

  // ── Flag-off enable gate (parity with the Notes/ClearMemory pattern) ─────
  if (!enabled) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h1 className="text-lg font-semibold text-gray-900">My Work is off</h1>
          <p className="text-sm text-gray-500 mt-1">
            Enable the My Work surface to see your assigned Jira issues, current sprint, and GitHub PRs in one place.
          </p>
          <button
            type="button"
            onClick={() => navigate('/configure?tab=feature-flags')}
            className="mt-4 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
          >
            Open Feature Flags →
          </button>
        </div>
      </div>
    )
  }

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) return ''
    const d = new Date(lastUpdated)
    return d.toLocaleTimeString()
  }, [lastUpdated])

  // ── Empty / both-disconnected state ──────────────────────────────────────
  if (!loading && !jiraConnected && !githubConnected) {
    return (
      <div className="p-6 max-w-3xl mx-auto" data-testid="my-work-disconnected">
        <h1 className="text-2xl font-bold text-gray-900">My Work</h1>
        <p className="text-sm text-gray-500 mt-1">
          A unified view of what you own across Jira and GitHub.
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <DisconnectedCard service="jira" onConnect={() => navigate('/connect?tab=integrations')} />
          <DisconnectedCard service="github" onConnect={() => navigate('/connect?tab=integrations')} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6" data-testid="my-work-page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Work</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Everything assigned to you across Jira and GitHub. Read-only — click through to act.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ConnectionPill label="Jira" connected={jiraConnected} />
          <ConnectionPill label="GitHub" connected={githubConnected} />
          <button
            type="button"
            onClick={() => void fetchAll()}
            disabled={loading}
            data-testid="my-work-refresh"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          {lastUpdatedLabel && (
            <span className="text-xs text-gray-400" data-testid="my-work-last-updated">
              Updated {lastUpdatedLabel}
            </span>
          )}
        </div>
      </header>

      {loading && !jira && !github && (
        <div
          className="bg-white border border-gray-200 rounded-2xl p-12 text-center"
          data-testid="my-work-loading"
        >
          <div className="text-sm text-gray-500">Loading your work…</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Sprint card (Jira) ───────────────────────────────────────── */}
        {jiraConnected ? (
          <SprintCard
            sprint={jira?.activeSprint ?? null}
            issues={jira?.sprintIssues ?? []}
            siteUrl={status?.atlassian?.siteUrl ?? ''}
            error={jira?.sprintError ?? null}
          />
        ) : (
          <DisconnectedCard service="jira" onConnect={() => navigate('/connect?tab=integrations')} />
        )}

        {/* ── My Jira issues card ─────────────────────────────────────── */}
        {jiraConnected && (
          <CardShell
            title="My Jira issues"
            subtitle="Assigned to you, not Done"
            count={jira?.assignedIssues.length}
            testId="my-work-jira-issues-card"
          >
            {jira?.assignedError && <ErrorRow message={`Couldn't load issues: ${jira.assignedError}`} />}
            {!jira?.assignedError && (jira?.assignedIssues.length ?? 0) === 0 ? (
              <EmptyRow message="Nothing assigned to you. Nice." />
            ) : (
              <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                {(jira?.assignedIssues ?? []).slice(0, 25).map((issue) => (
                  <JiraIssueRow
                    key={issue.id}
                    issue={issue}
                    siteUrl={status?.atlassian?.siteUrl ?? ''}
                  />
                ))}
              </ul>
            )}
          </CardShell>
        )}

        {/* ── GitHub PRs (authored) ───────────────────────────────────── */}
        {githubConnected ? (
          <CardShell
            title="My PRs"
            subtitle="Open pull requests you authored"
            count={github?.authored.length}
            testId="my-work-github-authored-card"
          >
            {github?.authoredError && <ErrorRow message={`Couldn't load PRs: ${github.authoredError}`} />}
            {!github?.authoredError && (github?.authored.length ?? 0) === 0 ? (
              <EmptyRow message="No open PRs from you." />
            ) : (
              <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {(github?.authored ?? []).map((item) => (
                  <GitHubItemRow key={`${item.repo}-${item.number}`} item={item} />
                ))}
              </ul>
            )}
          </CardShell>
        ) : (
          <DisconnectedCard service="github" onConnect={() => navigate('/connect?tab=integrations')} />
        )}

        {/* ── PRs awaiting my review ──────────────────────────────────── */}
        {githubConnected && (
          <CardShell
            title="PRs awaiting your review"
            subtitle="review-requested:@me"
            count={github?.reviewRequested.length}
            testId="my-work-github-review-card"
          >
            {github?.reviewRequestedError && (
              <ErrorRow message={`Couldn't load review queue: ${github.reviewRequestedError}`} />
            )}
            {!github?.reviewRequestedError && (github?.reviewRequested.length ?? 0) === 0 ? (
              <EmptyRow message="Inbox zero on reviews." />
            ) : (
              <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {(github?.reviewRequested ?? []).map((item) => (
                  <GitHubItemRow key={`${item.repo}-${item.number}`} item={item} />
                ))}
              </ul>
            )}
          </CardShell>
        )}

        {/* ── Mentions / replies needed ──────────────────────────────── */}
        {githubConnected && (
          <CardShell
            title="Mentions needing reply"
            subtitle="@-mentions on open issues and PRs"
            count={github?.mentions.length}
            testId="my-work-github-mentions-card"
          >
            {github?.mentionsError && <ErrorRow message={`Couldn't load mentions: ${github.mentionsError}`} />}
            {!github?.mentionsError && (github?.mentions.length ?? 0) === 0 ? (
              <EmptyRow message="No outstanding mentions." />
            ) : (
              <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {(github?.mentions ?? []).map((item) => (
                  <GitHubItemRow key={`${item.repo}-${item.number}-${item.type}`} item={item} />
                ))}
              </ul>
            )}
          </CardShell>
        )}

        {/*
          Jira mentions/comments-needing-reply: the Atlassian REST API doesn't
          expose a clean "comments addressed to me that I haven't replied to"
          query, and JQL-based proxies (`comment ~ "@<displayName>"`) yield
          high false-positive rates. Surfacing this without a backend that
          tracks last-read state would mislead users, so we link out to Jira's
          built-in `?atlOrigin=…&jql=…` notification view instead.
        */}
        {jiraConnected && (
          <CardShell
            title="Jira comments & mentions"
            subtitle="View in Jira"
            testId="my-work-jira-mentions-card"
          >
            <div className="text-sm text-gray-600 space-y-3">
              <p>
                Jira's API doesn't surface "unread @-mentions" reliably enough to show inline. Use Jira's notification center for the authoritative view.
              </p>
              <a
                href={
                  status?.atlassian?.siteUrl
                    ? `${status.atlassian.siteUrl}/issues/?jql=watcher%20%3D%20currentUser()%20AND%20updated%20%3E%20-7d%20ORDER%20BY%20updated%20DESC`
                    : '#'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700"
              >
                Open recent activity in Jira
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </a>
            </div>
          </CardShell>
        )}
      </div>
    </div>
  )
}
