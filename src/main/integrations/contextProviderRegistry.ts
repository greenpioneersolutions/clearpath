import { ipcMain } from 'electron'
import { log } from '../utils/logger'

// ── Integration Context Provider Registry ────────────────────────────────────
// Built-in integrations (GitHub, Jira, ServiceNow, etc.) are not extensions,
// so they register context providers here. Each provider declares what data it
// can inject into an AI session and provides a handler that fetches + formats it.

const MAX_CONTEXT_CHARS = 8000

interface IntegrationContextProvider {
  id: string
  label: string
  description: string
  icon: string
  integrationKey: string
  parameters: Array<{
    id: string
    label: string
    type: 'text' | 'repo-picker' | 'project-picker' | 'select'
    required?: boolean
    placeholder?: string
  }>
  examples: string[]
  maxTokenEstimate: number
  handler: (params: Record<string, string>) => Promise<{ success: boolean; context: string; tokenEstimate: number; metadata?: { itemCount?: number; truncated?: boolean } }>
}

// ── Built-in Providers ───────────────────────────────────────────────────────

const providers: IntegrationContextProvider[] = [
  {
    id: 'github-open-prs',
    label: 'GitHub Open PRs',
    description: 'Open pull requests for a repository — titles, authors, age, review status',
    icon: 'git-pull-request',
    integrationKey: 'github',
    parameters: [
      { id: 'owner', label: 'Owner', type: 'text', required: true, placeholder: 'e.g. acme' },
      { id: 'repo', label: 'Repository', type: 'text', required: true, placeholder: 'e.g. widgets' },
    ],
    examples: ['Which PRs need review?', 'Summarize our open pull requests', 'Are there any stale PRs?'],
    maxTokenEstimate: 3000,
    handler: async (params) => {
      const result = await ipcMain.handle?.('integration:github-pulls', null as unknown, {
        owner: params.owner,
        repo: params.repo,
        state: 'open',
        perPage: 30,
      })
      // Use direct invocation instead
      return fetchGitHubPRs(params.owner, params.repo, 'open')
    },
  },
  {
    id: 'github-issues',
    label: 'GitHub Issues',
    description: 'Open issues for a repository — titles, labels, assignees, age',
    icon: 'alert-circle',
    integrationKey: 'github',
    parameters: [
      { id: 'owner', label: 'Owner', type: 'text', required: true, placeholder: 'e.g. acme' },
      { id: 'repo', label: 'Repository', type: 'text', required: true, placeholder: 'e.g. widgets' },
    ],
    examples: ['What bugs are open?', 'Summarize current issues', 'What needs attention?'],
    maxTokenEstimate: 3000,
    handler: async (params) => fetchGitHubIssues(params.owner, params.repo),
  },
  {
    id: 'github-search',
    label: 'GitHub Search',
    description: 'Search across code, issues, and PRs on GitHub',
    icon: 'search',
    integrationKey: 'github',
    parameters: [
      { id: 'query', label: 'Search Query', type: 'text', required: true, placeholder: 'e.g. bug fix auth' },
    ],
    examples: ['Find code related to authentication', 'Search for recent bug reports'],
    maxTokenEstimate: 2000,
    handler: async (params) => fetchGitHubSearch(params.query),
  },
  {
    id: 'jira-sprint',
    label: 'Jira Current Sprint',
    description: 'Issues in the current sprint for a Jira project',
    icon: 'layout',
    integrationKey: 'atlassian',
    parameters: [
      { id: 'projectKey', label: 'Project Key', type: 'text', required: true, placeholder: 'e.g. PROJ' },
    ],
    examples: ['What\'s in our current sprint?', 'How is the sprint looking?', 'What\'s blocking progress?'],
    maxTokenEstimate: 3000,
    handler: async (params) => fetchJiraSprint(params.projectKey),
  },
  {
    id: 'servicenow-incidents',
    label: 'ServiceNow Incidents',
    description: 'Recent open incidents from ServiceNow',
    icon: 'alert-triangle',
    integrationKey: 'servicenow',
    parameters: [],
    examples: ['What incidents are open?', 'Are there any critical incidents?', 'Summarize recent incidents'],
    maxTokenEstimate: 2000,
    handler: async () => fetchServiceNowIncidents(),
  },
  {
    id: 'datadog-monitors',
    label: 'Datadog Monitor Status',
    description: 'Current monitor alerts and warnings from Datadog',
    icon: 'activity',
    integrationKey: 'datadog',
    parameters: [],
    examples: ['Are any monitors alerting?', 'What\'s the health of our infrastructure?'],
    maxTokenEstimate: 2000,
    handler: async () => fetchDatadogMonitors(),
  },
]

// ── Data Fetching Helpers ────────────────────────────────────────────────────
// These use ipcMain to invoke the existing integration handlers directly.

async function invokeHandler(channel: string, args?: unknown): Promise<unknown> {
  // We need to call the registered ipcMain handler directly.
  // Since we're in the main process, we can use the handler registry.
  return new Promise((resolve, reject) => {
    const fakeEvent = { sender: { send: () => {} } } as unknown
    // Access the handler via Electron's internal mechanism
    const handler = (ipcMain as unknown as { _invokeHandlers?: Map<string, Function> })._invokeHandlers?.get(channel)
    if (handler) {
      Promise.resolve(handler(fakeEvent, args)).then(resolve).catch(reject)
    } else {
      reject(new Error(`Handler not registered: ${channel}`))
    }
  })
}

async function fetchGitHubPRs(owner: string, repo: string, state: string): Promise<{ success: boolean; context: string; tokenEstimate: number; metadata?: { itemCount?: number; truncated?: boolean } }> {
  try {
    const result = await invokeHandler('integration:github-pulls', { owner, repo, state, perPage: 30 }) as {
      success?: boolean
      pulls?: Array<{ number: number; title: string; state: string; user?: { login: string }; created_at?: string; labels?: Array<{ name: string }>; requested_reviewers?: Array<{ login: string }>; draft?: boolean }>
    }

    const pulls = result?.pulls ?? []
    if (pulls.length === 0) {
      return { success: true, context: `No ${state} pull requests found for ${owner}/${repo}.`, tokenEstimate: 20 }
    }

    const lines = [`## ${state.charAt(0).toUpperCase() + state.slice(1)} Pull Requests for ${owner}/${repo}\n`]
    let truncated = false

    for (const pr of pulls) {
      const age = pr.created_at ? Math.round((Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0
      const labels = pr.labels?.map((l) => l.name).join(', ') || 'none'
      const reviewers = pr.requested_reviewers?.map((r) => r.login).join(', ') || 'none requested'
      const line = `- **PR #${pr.number}**: ${pr.title}\n  Author: ${pr.user?.login ?? 'unknown'} | Age: ${age}d | Labels: ${labels} | Reviewers: ${reviewers}${pr.draft ? ' | DRAFT' : ''}\n`

      if (lines.join('\n').length + line.length > MAX_CONTEXT_CHARS) { truncated = true; break }
      lines.push(line)
    }

    if (truncated) lines.push(`\n_[Showing ${lines.length - 1} of ${pulls.length} PRs — truncated for context budget]_`)

    const context = lines.join('\n')
    return { success: true, context, tokenEstimate: Math.ceil(context.length / 4), metadata: { itemCount: pulls.length, truncated } }
  } catch (err) {
    log.error('[context-registry] GitHub PRs fetch failed: %s', err)
    return { success: false, context: '', tokenEstimate: 0 }
  }
}

async function fetchGitHubIssues(owner: string, repo: string): Promise<{ success: boolean; context: string; tokenEstimate: number; metadata?: { itemCount?: number; truncated?: boolean } }> {
  try {
    const result = await invokeHandler('integration:github-issues', { owner, repo, state: 'open', perPage: 30 }) as {
      issues?: Array<{ number: number; title: string; user?: { login: string }; created_at?: string; labels?: Array<{ name: string }>; assignees?: Array<{ login: string }> }>
    }

    const issues = result?.issues ?? []
    if (issues.length === 0) {
      return { success: true, context: `No open issues found for ${owner}/${repo}.`, tokenEstimate: 20 }
    }

    const lines = [`## Open Issues for ${owner}/${repo}\n`]
    let truncated = false

    for (const issue of issues) {
      const age = issue.created_at ? Math.round((Date.now() - new Date(issue.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0
      const labels = issue.labels?.map((l) => l.name).join(', ') || 'none'
      const assignees = issue.assignees?.map((a) => a.login).join(', ') || 'unassigned'
      const line = `- **#${issue.number}**: ${issue.title}\n  Author: ${issue.user?.login ?? 'unknown'} | Age: ${age}d | Labels: ${labels} | Assigned: ${assignees}\n`

      if (lines.join('\n').length + line.length > MAX_CONTEXT_CHARS) { truncated = true; break }
      lines.push(line)
    }

    const context = lines.join('\n')
    return { success: true, context, tokenEstimate: Math.ceil(context.length / 4), metadata: { itemCount: issues.length, truncated } }
  } catch (err) {
    log.error('[context-registry] GitHub issues fetch failed: %s', err)
    return { success: false, context: '', tokenEstimate: 0 }
  }
}

async function fetchGitHubSearch(query: string): Promise<{ success: boolean; context: string; tokenEstimate: number }> {
  try {
    const result = await invokeHandler('integration:github-search', { query, type: 'issues' }) as {
      items?: Array<{ number: number; title: string; html_url?: string; repository_url?: string; state?: string }>
    }

    const items = result?.items ?? []
    if (items.length === 0) {
      return { success: true, context: `No results found for: "${query}"`, tokenEstimate: 20 }
    }

    const lines = [`## GitHub Search Results for "${query}"\n`]
    for (const item of items.slice(0, 20)) {
      lines.push(`- **#${item.number}**: ${item.title} (${item.state ?? 'unknown'})`)
    }

    const context = lines.join('\n')
    return { success: true, context, tokenEstimate: Math.ceil(context.length / 4) }
  } catch (err) {
    return { success: false, context: '', tokenEstimate: 0 }
  }
}

async function fetchJiraSprint(projectKey: string): Promise<{ success: boolean; context: string; tokenEstimate: number }> {
  try {
    const result = await invokeHandler('integration:jira-search', {
      jql: `project = ${projectKey} AND sprint in openSprints() ORDER BY priority DESC`,
      maxResults: 30,
    }) as { issues?: Array<{ key: string; fields?: { summary?: string; status?: { name?: string }; priority?: { name?: string }; assignee?: { displayName?: string } } }> }

    const issues = result?.issues ?? []
    if (issues.length === 0) {
      return { success: true, context: `No sprint issues found for project ${projectKey}.`, tokenEstimate: 20 }
    }

    const lines = [`## Current Sprint Issues for ${projectKey}\n`]
    for (const issue of issues) {
      const f = issue.fields ?? {}
      lines.push(`- **${issue.key}**: ${f.summary ?? 'Untitled'}\n  Status: ${f.status?.name ?? '?'} | Priority: ${f.priority?.name ?? '?'} | Assignee: ${f.assignee?.displayName ?? 'Unassigned'}`)
    }

    const context = lines.join('\n')
    return { success: true, context, tokenEstimate: Math.ceil(context.length / 4) }
  } catch (err) {
    return { success: false, context: '', tokenEstimate: 0 }
  }
}

async function fetchServiceNowIncidents(): Promise<{ success: boolean; context: string; tokenEstimate: number }> {
  try {
    const result = await invokeHandler('integration:servicenow-incidents', { limit: 20 }) as {
      incidents?: Array<{ number: string; short_description: string; priority: string; state: string; assigned_to?: { display_value?: string } }>
    }

    const incidents = result?.incidents ?? []
    if (incidents.length === 0) {
      return { success: true, context: 'No open incidents in ServiceNow.', tokenEstimate: 15 }
    }

    const lines = ['## Recent ServiceNow Incidents\n']
    for (const inc of incidents) {
      lines.push(`- **${inc.number}**: ${inc.short_description}\n  Priority: ${inc.priority} | State: ${inc.state} | Assigned: ${inc.assigned_to?.display_value ?? 'Unassigned'}`)
    }

    const context = lines.join('\n')
    return { success: true, context, tokenEstimate: Math.ceil(context.length / 4) }
  } catch (err) {
    return { success: false, context: '', tokenEstimate: 0 }
  }
}

async function fetchDatadogMonitors(): Promise<{ success: boolean; context: string; tokenEstimate: number }> {
  try {
    const result = await invokeHandler('integration:datadog-monitors', {}) as {
      monitors?: Array<{ id: number; name: string; overall_state: string; type: string; tags?: string[] }>
    }

    const monitors = result?.monitors ?? []
    const alerting = monitors.filter((m) => m.overall_state !== 'OK')

    if (alerting.length === 0) {
      return { success: true, context: `All ${monitors.length} Datadog monitors are OK.`, tokenEstimate: 15 }
    }

    const lines = [`## Datadog Monitors (${alerting.length} alerting of ${monitors.length} total)\n`]
    for (const mon of alerting) {
      lines.push(`- **${mon.name}**: ${mon.overall_state} (${mon.type})`)
    }

    const context = lines.join('\n')
    return { success: true, context, tokenEstimate: Math.ceil(context.length / 4) }
  } catch (err) {
    return { success: false, context: '', tokenEstimate: 0 }
  }
}

// ── Registry API ─────────────────────────────────────────────────────────────

export function getIntegrationContextProviders(): IntegrationContextProvider[] {
  return providers
}

export async function fetchIntegrationContext(
  providerId: string,
  params: Record<string, string>,
): Promise<{ success: boolean; context: string; tokenEstimate: number; metadata?: { itemCount?: number; truncated?: boolean } }> {
  const provider = providers.find((p) => p.id === providerId)
  if (!provider) {
    return { success: false, context: '', tokenEstimate: 0 }
  }

  try {
    return await provider.handler(params)
  } catch (err) {
    log.error('[context-registry] Provider "%s" failed: %s', providerId, err)
    return { success: false, context: `Failed to fetch context from ${provider.label}: ${err}`, tokenEstimate: 0 }
  }
}
