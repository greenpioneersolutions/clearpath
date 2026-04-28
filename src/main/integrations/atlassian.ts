import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { Version3Client } from 'jira.js'
import { storeSecret, retrieveSecret, deleteSecret } from '../utils/credentialStore'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'
import { systemFetch } from '../utils/electronFetch'

// ── Types ───────────────────────────────────────────────────────────────────

interface AtlassianMetadata {
  siteUrl: string
  email: string
  displayName: string
  accountId: string
  jiraEnabled: boolean
  confluenceEnabled: boolean
  connected: boolean
  connectedAt: number
}

interface AtlassianStoreSchema {
  atlassian: AtlassianMetadata | null
}

interface JiraProject {
  id: string
  key: string
  name: string
  projectTypeKey: string
  avatarUrl: string
}

interface JiraIssue {
  id: string
  key: string
  summary: string
  status: string
  statusCategory: string
  priority: string
  assignee: string | null
  reporter: string | null
  issueType: string
  created: string
  updated: string
  description: string | null
  labels: string[]
}

interface JiraBoard {
  id: number
  name: string
  type: string
  projectKey: string
}

interface JiraSprint {
  id: number
  name: string
  state: string
  startDate: string | null
  endDate: string | null
  completeDate: string | null
  goal: string | null
}

interface ConfluenceSpace {
  id: string
  key: string
  name: string
  type: string
  status: string
}

interface ConfluenceSearchResult {
  id: string
  title: string
  type: string
  spaceKey: string | null
  url: string
  excerpt: string
  lastModified: string | null
}

interface ConfluencePage {
  id: string
  title: string
  spaceId: string | null
  status: string
  body: string
  version: number
  createdAt: string | null
  updatedAt: string | null
}

interface ConfluenceChildPage {
  id: string
  title: string
  status: string
  childPosition: number | null
}

// ── Store ───────────────────────────────────────────────────────────────────

const store = new Store<AtlassianStoreSchema>({
  name: 'clear-path-integrations',
  defaults: { atlassian: null },
  encryptionKey: getStoreEncryptionKey(),
})

// ── Credential Key ──────────────────────────────────────────────────────────

const CREDENTIAL_KEY = 'atlassian-api-token'

// ── Client Cache ────────────────────────────────────────────────────────────

let jiraClient: Version3Client | null = null

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize an Atlassian site URL from various input formats:
 *   "mycompany" -> "https://mycompany.atlassian.net"
 *   "mycompany.atlassian.net" -> "https://mycompany.atlassian.net"
 *   "https://mycompany.atlassian.net/" -> "https://mycompany.atlassian.net"
 */
function normalizeSiteUrl(input: string): string {
  let url = input.trim()

  // Strip trailing slashes
  url = url.replace(/\/+$/, '')

  // If it already has a protocol, just ensure no trailing slash
  if (url.startsWith('https://') || url.startsWith('http://')) {
    return url
  }

  // If it contains a dot, assume it's a domain
  if (url.includes('.')) {
    return `https://${url}`
  }

  // Bare subdomain — append .atlassian.net
  return `https://${url}.atlassian.net`
}

/**
 * Build a Basic Auth header value from email and API token.
 */
function buildBasicAuth(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
}

/**
 * Get the stored Atlassian metadata, or null if not connected.
 */
function getMetadata(): AtlassianMetadata | null {
  const meta = store.get('atlassian')
  if (!meta?.connected) return null
  return meta
}

/**
 * Retrieve the decrypted API token, or empty string if unavailable.
 */
function getToken(): string {
  return retrieveSecret(CREDENTIAL_KEY)
}

/**
 * Get or create a Version3Client instance for Jira REST API.
 * Returns null with a diagnostic message if credentials are unavailable.
 */
function getJiraClient(): { client: Version3Client | null; error: string | null } {
  if (jiraClient) {
    return { client: jiraClient, error: null }
  }

  const meta = getMetadata()
  if (!meta) {
    return { client: null, error: 'Atlassian is not connected. Please connect via Configure > Integrations.' }
  }

  if (!meta.jiraEnabled) {
    return { client: null, error: 'Jira is not enabled for this Atlassian connection.' }
  }

  const token = getToken()
  if (!token) {
    return {
      client: null,
      error: 'Atlassian API token could not be retrieved. Please disconnect and reconnect in Configure > Integrations.',
    }
  }

  jiraClient = new Version3Client({
    host: meta.siteUrl,
    authentication: {
      basic: { email: meta.email, apiToken: token },
    },
  })

  return { client: jiraClient, error: null }
}

/**
 * Make an authenticated fetch request to an Atlassian REST API.
 * Includes rate-limit header monitoring.
 */
async function atlassianFetch(
  url: string,
  email: string,
  token: string,
  options: RequestInit = {},
): Promise<Response> {
  const response = await systemFetch(url, {
    ...options,
    headers: {
      'Authorization': buildBasicAuth(email, token),
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) ?? {}),
    },
  })

  // Log rate limit warnings
  const remaining = response.headers.get('x-ratelimit-remaining')
  const limit = response.headers.get('x-ratelimit-limit')
  if (remaining !== null && limit !== null) {
    const remainingNum = parseInt(remaining, 10)
    const limitNum = parseInt(limit, 10)
    if (!isNaN(remainingNum) && !isNaN(limitNum) && limitNum > 0) {
      const ratio = remainingNum / limitNum
      if (ratio < 0.1) {
        log.warn(
          '[atlassian] Rate limit warning: %d/%d remaining (%.0f%%) for %s',
          remainingNum, limitNum, ratio * 100, url,
        )
      } else {
        log.debug('[atlassian] Rate limit: %d/%d remaining for %s', remainingNum, limitNum, url)
      }
    }
  }

  return response
}

/**
 * Convenience wrapper for authenticated Confluence/Agile API requests.
 * Requires a connected Atlassian session.
 */
async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<{ response: Response | null; error: string | null }> {
  const meta = getMetadata()
  if (!meta) {
    return { response: null, error: 'Atlassian is not connected. Please connect via Configure > Integrations.' }
  }

  const token = getToken()
  if (!token) {
    return {
      response: null,
      error: 'Atlassian API token could not be retrieved. Please disconnect and reconnect in Configure > Integrations.',
    }
  }

  const response = await atlassianFetch(url, meta.email, token, options)
  return { response, error: null }
}

// Atlassian removed /rest/api/3/search in 2025; the replacement is
// /rest/api/3/search/jql. The new endpoint uses cursor pagination
// (nextPageToken) instead of startAt/total. We don't expose pagination to
// callers — every consumer was asking for "page 0 of 25/50", which fits in
// one request.
//
// Reference: https://developer.atlassian.com/changelog/#CHANGE-2046
async function searchJiraIssuesViaJql(
  jql: string,
  fields: string[],
  maxResults: number = 50,
): Promise<{ issues: JiraIssue[]; error: string | null }> {
  const meta = getMetadata()
  if (!meta) {
    return { issues: [], error: 'Atlassian is not connected. Please connect via Configure > Integrations.' }
  }

  const params = new URLSearchParams({
    jql,
    maxResults: String(maxResults),
    fields: fields.join(','),
  })
  const url = `${meta.siteUrl}/rest/api/3/search/jql?${params.toString()}`

  const { response, error } = await authenticatedFetch(url)
  if (error) return { issues: [], error }
  if (!response || !response.ok) {
    const status = response?.status ?? 0
    let body = ''
    try { body = (await response?.text()) ?? '' } catch { /* ignore */ }
    return { issues: [], error: `search/jql HTTP ${status}: ${body.slice(0, 200)}` }
  }

  const data = (await response.json()) as {
    issues?: Array<{
      id?: string
      key?: string
      fields?: Record<string, unknown>
    }>
  }

  const issues: JiraIssue[] = (data.issues ?? []).map((issue) => {
    const f = (issue.fields ?? {}) as Record<string, unknown>
    return {
      id: issue.id ?? '',
      key: issue.key ?? '',
      summary: (f['summary'] as string) ?? '',
      status: ((f['status'] as Record<string, unknown>)?.['name'] as string) ?? '',
      statusCategory:
        (((f['status'] as Record<string, unknown>)?.['statusCategory'] as Record<string, unknown>)?.['name'] as string) ?? '',
      priority: ((f['priority'] as Record<string, unknown>)?.['name'] as string) ?? 'None',
      assignee: ((f['assignee'] as Record<string, unknown>)?.['displayName'] as string) ?? null,
      reporter: ((f['reporter'] as Record<string, unknown>)?.['displayName'] as string) ?? null,
      issueType: ((f['issuetype'] as Record<string, unknown>)?.['name'] as string) ?? '',
      created: (f['created'] as string) ?? '',
      updated: (f['updated'] as string) ?? '',
      description: f['description'] ? JSON.stringify(f['description']).slice(0, 2000) : null,
      labels: (f['labels'] as string[]) ?? [],
    }
  })

  return { issues, error: null }
}

// ── Registration ────────────────────────────────────────────────────────────

export function registerAtlassianHandlers(ipcMain: IpcMain): void {

  // ── Connect ─────────────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:atlassian-connect',
    async (_e, args: { siteUrl: string; email: string; token: string }) => {
      const siteUrl = normalizeSiteUrl(args.siteUrl)
      log.info(
        '[atlassian] connect: Attempting connection to %s as %s (token length=%d)',
        siteUrl, args.email, args.token.length,
      )

      try {
        // Validate credentials by calling Jira /myself
        const jiraResponse = await atlassianFetch(
          `${siteUrl}/rest/api/3/myself`,
          args.email,
          args.token,
        )

        if (!jiraResponse.ok) {
          const body = await jiraResponse.text().catch(() => '')
          log.error(
            '[atlassian] connect: Jira validation failed — HTTP %d: %s',
            jiraResponse.status, body.slice(0, 500),
          )
          return {
            success: false,
            error: jiraResponse.status === 401
              ? 'Authentication failed. Check your email and API token.'
              : `Jira API returned HTTP ${jiraResponse.status}. Verify your site URL is correct.`,
          }
        }

        const jiraUser = (await jiraResponse.json()) as {
          displayName?: string
          accountId?: string
        }
        const displayName = jiraUser.displayName ?? args.email
        const accountId = jiraUser.accountId ?? ''

        log.info(
          '[atlassian] connect: Jira authenticated as "%s" (accountId=%s)',
          displayName, accountId,
        )

        // Probe Confluence availability (non-fatal if unavailable)
        let confluenceEnabled = false
        try {
          const confResponse = await atlassianFetch(
            `${siteUrl}/wiki/rest/api/user/current`,
            args.email,
            args.token,
          )
          confluenceEnabled = confResponse.ok
          if (confluenceEnabled) {
            log.info('[atlassian] connect: Confluence is available')
          } else {
            log.info(
              '[atlassian] connect: Confluence not available (HTTP %d) — will be disabled',
              confResponse.status,
            )
          }
        } catch (confErr) {
          log.info('[atlassian] connect: Confluence probe failed — %s', confErr)
        }

        // Store credentials
        storeSecret(CREDENTIAL_KEY, args.token)
        const metadata: AtlassianMetadata = {
          siteUrl,
          email: args.email,
          displayName,
          accountId,
          jiraEnabled: true,
          confluenceEnabled,
          connected: true,
          connectedAt: Date.now(),
        }
        store.set('atlassian', metadata)

        // Initialize Jira client
        jiraClient = new Version3Client({
          host: siteUrl,
          authentication: {
            basic: { email: args.email, apiToken: args.token },
          },
        })

        log.info('[atlassian] connect: Connection established successfully')
        return {
          success: true,
          displayName,
          accountId,
          jiraEnabled: true,
          confluenceEnabled,
        }
      } catch (err) {
        log.error('[atlassian] connect: Failed —', err)
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )

  // ── Disconnect ──────────────────────────────────────────────────────────

  ipcMain.handle('integration:atlassian-disconnect', () => {
    log.info('[atlassian] disconnect: Clearing token and connection state')
    deleteSecret(CREDENTIAL_KEY)
    store.set('atlassian', null)
    jiraClient = null
    return { success: true }
  })

  // ── Jira: Projects ──────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:jira-projects',
    async (_e, args?: { startAt?: number; maxResults?: number }) => {
      log.info(
        '[atlassian] jira-projects: Fetching (startAt=%d, maxResults=%d)',
        args?.startAt ?? 0, args?.maxResults ?? 50,
      )

      const { client, error } = getJiraClient()
      if (!client) {
        log.error('[atlassian] jira-projects: %s', error)
        return { success: false, error }
      }

      try {
        const result = await client.projects.searchProjects({
          startAt: args?.startAt ?? 0,
          maxResults: args?.maxResults ?? 50,
        })

        const projects: JiraProject[] = (result.values ?? []).map((p) => ({
          id: String(p.id ?? ''),
          key: p.key ?? '',
          name: p.name ?? '',
          projectTypeKey: p.projectTypeKey ?? '',
          avatarUrl: p.avatarUrls?.['48x48'] ?? p.avatarUrls?.['32x32'] ?? '',
        }))

        log.info('[atlassian] jira-projects: Received %d projects', projects.length)
        return { success: true, projects }
      } catch (err) {
        log.error('[atlassian] jira-projects: Failed —', err)
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Jira: Search (JQL) ─────────────────────────────────────────────────

  ipcMain.handle(
    'integration:jira-search',
    async (
      _e,
      args: { jql: string; startAt?: number; maxResults?: number; fields?: string[] },
    ) => {
      log.info(
        '[atlassian] jira-search: JQL="%s" (maxResults=%d)',
        args.jql.slice(0, 200), args.maxResults ?? 25,
      )

      const defaultFields = [
        'summary', 'status', 'priority', 'assignee', 'reporter',
        'issuetype', 'created', 'updated', 'description', 'labels',
      ]

      const { issues, error } = await searchJiraIssuesViaJql(
        args.jql,
        args.fields ?? defaultFields,
        args.maxResults ?? 25,
      )

      if (error) {
        log.error('[atlassian] jira-search: %s', error)
        return { success: false, error }
      }

      // The new search/jql endpoint no longer returns total. Callers that
      // displayed a count should use `issues.length`; for any caller still
      // reading `total`, we surface it as the page size, which is the most
      // truthful number we can produce without an extra approximate-count call.
      log.info('[atlassian] jira-search: Returned %d issues', issues.length)
      return { success: true, issues, total: issues.length }
    },
  )

  // ── Jira: Get Issue ─────────────────────────────────────────────────────

  ipcMain.handle(
    'integration:jira-issue',
    async (_e, args: { issueKey: string }) => {
      log.info('[atlassian] jira-issue: Fetching %s', args.issueKey)

      const { client, error } = getJiraClient()
      if (!client) {
        log.error('[atlassian] jira-issue: %s', error)
        return { success: false, error }
      }

      try {
        const issue = await client.issues.getIssue({
          issueIdOrKey: args.issueKey,
          fields: [
            'summary', 'status', 'priority', 'assignee', 'reporter',
            'issuetype', 'created', 'updated', 'description', 'labels',
            'comment',
          ],
        })

        const fields = issue.fields as Record<string, unknown> | undefined
        const commentField = fields?.['comment'] as {
          comments?: Array<{
            id?: string
            author?: { displayName?: string }
            body?: unknown
            created?: string
            updated?: string
          }>
        } | undefined

        const comments = (commentField?.comments ?? []).map((c) => ({
          id: c.id ?? '',
          author: c.author?.displayName ?? 'Unknown',
          body: c.body ? JSON.stringify(c.body).slice(0, 2000) : '',
          created: c.created ?? '',
          updated: c.updated ?? '',
        }))

        const mapped: JiraIssue & { comments: typeof comments } = {
          id: issue.id ?? '',
          key: issue.key ?? '',
          summary: (fields?.['summary'] as string) ?? '',
          status: ((fields?.['status'] as Record<string, unknown>)?.['name'] as string) ?? '',
          statusCategory:
            (((fields?.['status'] as Record<string, unknown>)?.['statusCategory'] as Record<string, unknown>)?.['name'] as string) ?? '',
          priority: ((fields?.['priority'] as Record<string, unknown>)?.['name'] as string) ?? 'None',
          assignee: ((fields?.['assignee'] as Record<string, unknown>)?.['displayName'] as string) ?? null,
          reporter: ((fields?.['reporter'] as Record<string, unknown>)?.['displayName'] as string) ?? null,
          issueType: ((fields?.['issuetype'] as Record<string, unknown>)?.['name'] as string) ?? '',
          created: (fields?.['created'] as string) ?? '',
          updated: (fields?.['updated'] as string) ?? '',
          description: fields?.['description'] ? JSON.stringify(fields['description']).slice(0, 5000) : null,
          labels: (fields?.['labels'] as string[]) ?? [],
          comments,
        }

        log.info(
          '[atlassian] jira-issue: Fetched %s — "%s" (%d comments)',
          mapped.key, mapped.summary.slice(0, 60), comments.length,
        )
        return { success: true, issue: mapped }
      } catch (err) {
        log.error('[atlassian] jira-issue: Failed for %s —', args.issueKey, err)
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Jira: Boards (Agile API) ───────────────────────────────────────────

  ipcMain.handle(
    'integration:jira-boards',
    async (_e, args?: { startAt?: number; maxResults?: number }) => {
      log.info(
        '[atlassian] jira-boards: Fetching (startAt=%d, maxResults=%d)',
        args?.startAt ?? 0, args?.maxResults ?? 50,
      )

      const meta = getMetadata()
      if (!meta) {
        const error = 'Atlassian is not connected. Please connect via Configure > Integrations.'
        log.error('[atlassian] jira-boards: %s', error)
        return { success: false, error }
      }

      try {
        const startAt = args?.startAt ?? 0
        const maxResults = args?.maxResults ?? 50
        const url = `${meta.siteUrl}/rest/agile/1.0/board?startAt=${startAt}&maxResults=${maxResults}`

        const { response, error } = await authenticatedFetch(url)
        if (!response) {
          return { success: false, error }
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          log.error('[atlassian] jira-boards: HTTP %d — %s', response.status, body.slice(0, 500))
          return {
            success: false,
            error: `Agile API returned HTTP ${response.status}. Ensure Jira Software is enabled.`,
          }
        }

        const data = (await response.json()) as {
          values?: Array<{
            id?: number
            name?: string
            type?: string
            location?: { projectKey?: string }
          }>
        }

        const boards: JiraBoard[] = (data.values ?? []).map((b) => ({
          id: b.id ?? 0,
          name: b.name ?? '',
          type: b.type ?? '',
          projectKey: b.location?.projectKey ?? '',
        }))

        log.info('[atlassian] jira-boards: Received %d boards', boards.length)
        return { success: true, boards }
      } catch (err) {
        log.error('[atlassian] jira-boards: Failed —', err)
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Jira: Sprints (Agile API) ──────────────────────────────────────────

  ipcMain.handle(
    'integration:jira-sprints',
    async (_e, args: { boardId: number; state?: string }) => {
      log.info('[atlassian] jira-sprints: boardId=%d state=%s', args.boardId, args.state ?? 'all')

      const meta = getMetadata()
      if (!meta) {
        const error = 'Atlassian is not connected. Please connect via Configure > Integrations.'
        log.error('[atlassian] jira-sprints: %s', error)
        return { success: false, error }
      }

      try {
        const params = new URLSearchParams()
        if (args.state) {
          params.set('state', args.state)
        }
        const qs = params.toString()
        const url = `${meta.siteUrl}/rest/agile/1.0/board/${args.boardId}/sprint${qs ? `?${qs}` : ''}`

        const { response, error } = await authenticatedFetch(url)
        if (!response) {
          return { success: false, error }
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          log.error('[atlassian] jira-sprints: HTTP %d — %s', response.status, body.slice(0, 500))
          return {
            success: false,
            error: `Agile API returned HTTP ${response.status}. Board ${args.boardId} may not support sprints.`,
          }
        }

        const data = (await response.json()) as {
          values?: Array<{
            id?: number
            name?: string
            state?: string
            startDate?: string
            endDate?: string
            completeDate?: string
            goal?: string
          }>
        }

        const sprints: JiraSprint[] = (data.values ?? []).map((s) => ({
          id: s.id ?? 0,
          name: s.name ?? '',
          state: s.state ?? '',
          startDate: s.startDate ?? null,
          endDate: s.endDate ?? null,
          completeDate: s.completeDate ?? null,
          goal: s.goal ?? null,
        }))

        log.info('[atlassian] jira-sprints: Received %d sprints for board %d', sprints.length, args.boardId)
        return { success: true, sprints }
      } catch (err) {
        log.error('[atlassian] jira-sprints: Failed for board %d —', args.boardId, err)
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Jira: Sprint Issues (Agile API) ────────────────────────────────────

  ipcMain.handle(
    'integration:jira-sprint-issues',
    async (_e, args: { sprintId: number; startAt?: number; maxResults?: number }) => {
      log.info(
        '[atlassian] jira-sprint-issues: sprintId=%d (startAt=%d, maxResults=%d)',
        args.sprintId, args.startAt ?? 0, args.maxResults ?? 50,
      )

      const meta = getMetadata()
      if (!meta) {
        const error = 'Atlassian is not connected. Please connect via Configure > Integrations.'
        log.error('[atlassian] jira-sprint-issues: %s', error)
        return { success: false, error }
      }

      try {
        const startAt = args.startAt ?? 0
        const maxResults = args.maxResults ?? 50
        const url = `${meta.siteUrl}/rest/agile/1.0/sprint/${args.sprintId}/issue?startAt=${startAt}&maxResults=${maxResults}`

        const { response, error } = await authenticatedFetch(url)
        if (!response) {
          return { success: false, error }
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          log.error('[atlassian] jira-sprint-issues: HTTP %d — %s', response.status, body.slice(0, 500))
          return {
            success: false,
            error: `Agile API returned HTTP ${response.status}.`,
          }
        }

        const data = (await response.json()) as {
          issues?: Array<{
            id?: string
            key?: string
            fields?: {
              summary?: string
              status?: { name?: string; statusCategory?: { name?: string } }
              priority?: { name?: string }
              assignee?: { displayName?: string }
              reporter?: { displayName?: string }
              issuetype?: { name?: string }
              created?: string
              updated?: string
              labels?: string[]
            }
          }>
          total?: number
        }

        const issues: JiraIssue[] = (data.issues ?? []).map((issue) => ({
          id: issue.id ?? '',
          key: issue.key ?? '',
          summary: issue.fields?.summary ?? '',
          status: issue.fields?.status?.name ?? '',
          statusCategory: issue.fields?.status?.statusCategory?.name ?? '',
          priority: issue.fields?.priority?.name ?? 'None',
          assignee: issue.fields?.assignee?.displayName ?? null,
          reporter: issue.fields?.reporter?.displayName ?? null,
          issueType: issue.fields?.issuetype?.name ?? '',
          created: issue.fields?.created ?? '',
          updated: issue.fields?.updated ?? '',
          description: null,
          labels: issue.fields?.labels ?? [],
        }))

        log.info(
          '[atlassian] jira-sprint-issues: Received %d issues for sprint %d (total=%d)',
          issues.length, args.sprintId, data.total ?? 0,
        )
        return { success: true, issues, total: data.total ?? 0 }
      } catch (err) {
        log.error('[atlassian] jira-sprint-issues: Failed for sprint %d —', args.sprintId, err)
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Confluence: Spaces ──────────────────────────────────────────────────

  ipcMain.handle(
    'integration:confluence-spaces',
    async (_e, args?: { limit?: number; cursor?: string }) => {
      log.info('[atlassian] confluence-spaces: Fetching (limit=%d)', args?.limit ?? 25)

      const meta = getMetadata()
      if (!meta) {
        const error = 'Atlassian is not connected. Please connect via Configure > Integrations.'
        log.error('[atlassian] confluence-spaces: %s', error)
        return { success: false, error }
      }

      if (!meta.confluenceEnabled) {
        return { success: false, error: 'Confluence is not enabled for this Atlassian connection.' }
      }

      try {
        const params = new URLSearchParams()
        params.set('limit', String(args?.limit ?? 25))
        if (args?.cursor) {
          params.set('cursor', args.cursor)
        }
        const url = `${meta.siteUrl}/wiki/api/v2/spaces?${params.toString()}`

        const { response, error } = await authenticatedFetch(url)
        if (!response) {
          return { success: false, error }
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          log.error('[atlassian] confluence-spaces: HTTP %d — %s', response.status, body.slice(0, 500))
          return {
            success: false,
            error: `Confluence API returned HTTP ${response.status}.`,
          }
        }

        const data = (await response.json()) as {
          results?: Array<{
            id?: string
            key?: string
            name?: string
            type?: string
            status?: string
          }>
          _links?: { next?: string }
        }

        const spaces: ConfluenceSpace[] = (data.results ?? []).map((s) => ({
          id: s.id ?? '',
          key: s.key ?? '',
          name: s.name ?? '',
          type: s.type ?? '',
          status: s.status ?? '',
        }))

        // Extract cursor from next link for pagination
        let nextCursor: string | null = null
        if (data._links?.next) {
          const nextUrl = new URL(data._links.next, meta.siteUrl)
          nextCursor = nextUrl.searchParams.get('cursor')
        }

        log.info('[atlassian] confluence-spaces: Received %d spaces', spaces.length)
        return { success: true, spaces, nextCursor }
      } catch (err) {
        log.error('[atlassian] confluence-spaces: Failed —', err)
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Confluence: Search (CQL) ────────────────────────────────────────────

  ipcMain.handle(
    'integration:confluence-search',
    async (_e, args: { cql: string; limit?: number }) => {
      log.info('[atlassian] confluence-search: CQL="%s" (limit=%d)', args.cql.slice(0, 200), args.limit ?? 25)

      const meta = getMetadata()
      if (!meta) {
        const error = 'Atlassian is not connected. Please connect via Configure > Integrations.'
        log.error('[atlassian] confluence-search: %s', error)
        return { success: false, error }
      }

      if (!meta.confluenceEnabled) {
        return { success: false, error: 'Confluence is not enabled for this Atlassian connection.' }
      }

      try {
        const params = new URLSearchParams()
        params.set('cql', args.cql)
        params.set('limit', String(args.limit ?? 25))
        const url = `${meta.siteUrl}/wiki/rest/api/search?${params.toString()}`

        const { response, error } = await authenticatedFetch(url)
        if (!response) {
          return { success: false, error }
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          log.error('[atlassian] confluence-search: HTTP %d — %s', response.status, body.slice(0, 500))
          return {
            success: false,
            error: `Confluence search returned HTTP ${response.status}.`,
          }
        }

        const data = (await response.json()) as {
          results?: Array<{
            content?: {
              id?: string
              title?: string
              type?: string
              _links?: { webui?: string }
            }
            resultGlobalContainer?: { title?: string; displayUrl?: string }
            excerpt?: string
            lastModified?: string
            space?: { key?: string }
          }>
          totalSize?: number
        }

        const results: ConfluenceSearchResult[] = (data.results ?? []).map((r) => ({
          id: r.content?.id ?? '',
          title: r.content?.title ?? '',
          type: r.content?.type ?? '',
          spaceKey: r.space?.key ?? r.resultGlobalContainer?.title ?? null,
          url: r.content?._links?.webui
            ? `${meta.siteUrl}/wiki${r.content._links.webui}`
            : '',
          excerpt: r.excerpt ?? '',
          lastModified: r.lastModified ?? null,
        }))

        log.info(
          '[atlassian] confluence-search: Returned %d results (total=%d)',
          results.length, data.totalSize ?? 0,
        )
        return { success: true, results, total: data.totalSize ?? 0 }
      } catch (err) {
        log.error('[atlassian] confluence-search: Failed —', err)
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Confluence: Get Page ────────────────────────────────────────────────

  ipcMain.handle(
    'integration:confluence-page',
    async (_e, args: { pageId: string }) => {
      log.info('[atlassian] confluence-page: Fetching page %s', args.pageId)

      const meta = getMetadata()
      if (!meta) {
        const error = 'Atlassian is not connected. Please connect via Configure > Integrations.'
        log.error('[atlassian] confluence-page: %s', error)
        return { success: false, error }
      }

      if (!meta.confluenceEnabled) {
        return { success: false, error: 'Confluence is not enabled for this Atlassian connection.' }
      }

      try {
        const url = `${meta.siteUrl}/wiki/api/v2/pages/${encodeURIComponent(args.pageId)}?body-format=storage`

        const { response, error } = await authenticatedFetch(url)
        if (!response) {
          return { success: false, error }
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          log.error('[atlassian] confluence-page: HTTP %d — %s', response.status, body.slice(0, 500))
          return {
            success: false,
            error: response.status === 404
              ? `Page "${args.pageId}" not found.`
              : `Confluence API returned HTTP ${response.status}.`,
          }
        }

        const data = (await response.json()) as {
          id?: string
          title?: string
          spaceId?: string
          status?: string
          body?: { storage?: { value?: string } }
          version?: { number?: number; createdAt?: string }
          createdAt?: string
        }

        const page: ConfluencePage = {
          id: data.id ?? args.pageId,
          title: data.title ?? '',
          spaceId: data.spaceId ?? null,
          status: data.status ?? '',
          body: data.body?.storage?.value ?? '',
          version: data.version?.number ?? 0,
          createdAt: data.createdAt ?? null,
          updatedAt: data.version?.createdAt ?? null,
        }

        log.info(
          '[atlassian] confluence-page: Fetched "%s" (version=%d, body length=%d)',
          page.title, page.version, page.body.length,
        )
        return { success: true, page }
      } catch (err) {
        log.error('[atlassian] confluence-page: Failed for page %s —', args.pageId, err)
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Confluence: Page Children ───────────────────────────────────────────

  ipcMain.handle(
    'integration:confluence-page-children',
    async (_e, args: { pageId: string }) => {
      log.info('[atlassian] confluence-page-children: Fetching children of page %s', args.pageId)

      const meta = getMetadata()
      if (!meta) {
        const error = 'Atlassian is not connected. Please connect via Configure > Integrations.'
        log.error('[atlassian] confluence-page-children: %s', error)
        return { success: false, error }
      }

      if (!meta.confluenceEnabled) {
        return { success: false, error: 'Confluence is not enabled for this Atlassian connection.' }
      }

      try {
        const url = `${meta.siteUrl}/wiki/api/v2/pages/${encodeURIComponent(args.pageId)}/children`

        const { response, error } = await authenticatedFetch(url)
        if (!response) {
          return { success: false, error }
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '')
          log.error(
            '[atlassian] confluence-page-children: HTTP %d — %s',
            response.status, body.slice(0, 500),
          )
          return {
            success: false,
            error: response.status === 404
              ? `Page "${args.pageId}" not found.`
              : `Confluence API returned HTTP ${response.status}.`,
          }
        }

        const data = (await response.json()) as {
          results?: Array<{
            id?: string
            title?: string
            status?: string
            childPosition?: number
          }>
        }

        const children: ConfluenceChildPage[] = (data.results ?? []).map((c) => ({
          id: c.id ?? '',
          title: c.title ?? '',
          status: c.status ?? '',
          childPosition: c.childPosition ?? null,
        }))

        log.info(
          '[atlassian] confluence-page-children: Found %d children for page %s',
          children.length, args.pageId,
        )
        return { success: true, children }
      } catch (err) {
        log.error('[atlassian] confluence-page-children: Failed for page %s —', args.pageId, err)
        return { success: false, error: String(err) }
      }
    },
  )

  // ── Jira: My Work (aggregated) ──────────────────────────────────────────
  //
  // Single call that aggregates everything the My Work page needs from Jira:
  //   - Issues assigned to currentUser() that are not Done
  //   - The first active sprint across the user's accessible boards (if any)
  //   - The issues in that active sprint
  //
  // Why a dedicated aggregation handler vs. composing on the renderer:
  //   1. Avoids a chatty IPC pattern (3-5 round-trips become 1)
  //   2. Keeps the JQL strings + Agile-API quirks (state filter, board scan)
  //      out of the renderer
  //   3. Tolerates partial failure — the page can still render assigned
  //      issues even when no agile board is reachable, and vice versa
  //
  // Reference: https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
  // Reference: https://developer.atlassian.com/cloud/jira/software/rest/intro/

  ipcMain.handle('integration:jira-my-work', async () => {
    log.info('[atlassian] jira-my-work: Aggregating issues + active sprint')

    const meta = getMetadata()
    if (!meta) {
      const error = 'Atlassian is not connected. Please connect via Configure > Integrations.'
      log.error('[atlassian] jira-my-work: %s', error)
      return { success: false, error }
    }

    const result: {
      success: boolean
      assignedIssues: JiraIssue[]
      activeSprint: (JiraSprint & { boardId: number; boardName: string }) | null
      sprintIssues: JiraIssue[]
      sprintError: string | null
      assignedError: string | null
    } = {
      success: true,
      assignedIssues: [],
      activeSprint: null,
      sprintIssues: [],
      sprintError: null,
      assignedError: null,
    }

    // ── 1. Issues assigned to the current user (not Done), most recent first ──
    {
      const jql = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
      const { issues, error } = await searchJiraIssuesViaJql(
        jql,
        [
          'summary', 'status', 'priority', 'assignee', 'reporter',
          'issuetype', 'created', 'updated', 'labels',
        ],
        50,
      )
      if (error) {
        result.assignedError = error
        log.error('[atlassian] jira-my-work: assigned-issues failed — %s', error)
      } else {
        result.assignedIssues = issues
        log.info('[atlassian] jira-my-work: Got %d assigned issues', issues.length)
      }
    }

    // ── 2. Find the first active sprint across every board the user can see ──
    // We used to filter to type=scrum, which excluded team-managed projects
    // (those expose boards as type=simple even when sprints are enabled).
    // Sprint listings work the same on both — the agile API is the source of
    // truth, and boards that don't support sprints just return an empty list,
    // so unfiltered iteration is correct and lets team-managed projects work.
    try {
      const boardsUrl = `${meta.siteUrl}/rest/agile/1.0/board?maxResults=50`
      const { response: boardsResp } = await authenticatedFetch(boardsUrl)
      if (!boardsResp || !boardsResp.ok) {
        // Agile API may be unavailable (Jira Software disabled) — non-fatal
        result.sprintError = boardsResp ? `Boards API HTTP ${boardsResp.status}` : 'Boards API unreachable'
        log.warn('[atlassian] jira-my-work: %s', result.sprintError)
      } else {
        const boardsData = (await boardsResp.json()) as {
          values?: Array<{ id?: number; name?: string; type?: string }>
        }
        const candidateBoards = (boardsData.values ?? []).filter((b) => typeof b.id === 'number')

        for (const board of candidateBoards) {
          if (!board.id) continue
          const sprintUrl = `${meta.siteUrl}/rest/agile/1.0/board/${board.id}/sprint?state=active`
          const { response: sprintResp } = await authenticatedFetch(sprintUrl)
          // Boards that don't support sprints (kanban without backlog) return
          // 400; we just skip them and keep scanning.
          if (!sprintResp || !sprintResp.ok) continue

          const sprintData = (await sprintResp.json()) as {
            values?: Array<{
              id?: number
              name?: string
              state?: string
              startDate?: string
              endDate?: string
              completeDate?: string
              goal?: string
            }>
          }

          const active = (sprintData.values ?? [])[0]
          if (!active || typeof active.id !== 'number') continue

          result.activeSprint = {
            id: active.id,
            name: active.name ?? '',
            state: active.state ?? 'active',
            startDate: active.startDate ?? null,
            endDate: active.endDate ?? null,
            completeDate: active.completeDate ?? null,
            goal: active.goal ?? null,
            boardId: board.id,
            boardName: board.name ?? '',
          }

          // Pull this sprint's issues (capped to 50; the sprint shouldn't be huge)
          const issuesUrl = `${meta.siteUrl}/rest/agile/1.0/sprint/${active.id}/issue?maxResults=50`
          const { response: issuesResp } = await authenticatedFetch(issuesUrl)
          if (!issuesResp || !issuesResp.ok) break

          const issuesData = (await issuesResp.json()) as {
            issues?: Array<{
              id?: string
              key?: string
              fields?: {
                summary?: string
                status?: { name?: string; statusCategory?: { name?: string } }
                priority?: { name?: string }
                assignee?: { displayName?: string }
                reporter?: { displayName?: string }
                issuetype?: { name?: string }
                created?: string
                updated?: string
                labels?: string[]
              }
            }>
          }

          result.sprintIssues = (issuesData.issues ?? []).map((issue) => ({
            id: issue.id ?? '',
            key: issue.key ?? '',
            summary: issue.fields?.summary ?? '',
            status: issue.fields?.status?.name ?? '',
            statusCategory: issue.fields?.status?.statusCategory?.name ?? '',
            priority: issue.fields?.priority?.name ?? 'None',
            assignee: issue.fields?.assignee?.displayName ?? null,
            reporter: issue.fields?.reporter?.displayName ?? null,
            issueType: issue.fields?.issuetype?.name ?? '',
            created: issue.fields?.created ?? '',
            updated: issue.fields?.updated ?? '',
            description: null,
            labels: issue.fields?.labels ?? [],
          }))

          log.info(
            '[atlassian] jira-my-work: Active sprint "%s" on board "%s" — %d issues',
            result.activeSprint.name, result.activeSprint.boardName, result.sprintIssues.length,
          )
          break // first active sprint wins
        }

        if (!result.activeSprint && candidateBoards.length > 0) {
          log.info('[atlassian] jira-my-work: No active sprint found across %d boards', candidateBoards.length)
        }
      }
    } catch (err) {
      result.sprintError = String(err)
      log.error('[atlassian] jira-my-work: sprint scan failed —', err)
    }

    return result
  })
}
