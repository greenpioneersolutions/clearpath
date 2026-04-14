import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { Octokit } from 'octokit'
import { storeSecret, retrieveSecret, deleteSecret } from '../utils/credentialStore'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'
import { getSystemFetch } from '../utils/electronFetch'

// ── Store ────────────────────────────────────────────────────────────────────

interface IntegrationStoreSchema {
  github: {
    // Token is now stored encrypted in credentialStore, NOT here
    username: string
    connected: boolean
    connectedAt: number
  } | null
}

const store = new Store<IntegrationStoreSchema>({
  name: 'clear-path-integrations',
  defaults: { github: null },
  encryptionKey: getStoreEncryptionKey(),
})

// ── GitHub client cache ──────────────────────────────────────────────────────

let octokit: Octokit | null = null
let lastOctokitError: string | null = null

function getOctokit(): Octokit | null {
  if (octokit) {
    log.debug('[integration] Using cached Octokit instance')
    lastOctokitError = null
    return octokit
  }

  const gh = store.get('github')
  if (!gh?.connected) {
    lastOctokitError = 'GitHub shows as not connected in settings. Please connect via Configure > Integrations.'
    log.warn('[integration] getOctokit: %s', lastOctokitError)
    return null
  }

  log.info('[integration] getOctokit: Store shows connected as "%s" — retrieving token from credential store', gh.username)
  let token = retrieveSecret('github-token')

  // Migration: check if old token is stored directly in the integration store
  // (before security hardening moved tokens to credentialStore)
  if (!token) {
    log.warn('[integration] getOctokit: Token NOT in credentialStore — checking legacy store format')
    const raw = store.store as Record<string, unknown>
    const ghRaw = raw['github'] as Record<string, unknown> | undefined
    if (ghRaw && typeof ghRaw['token'] === 'string' && ghRaw['token'].length > 0) {
      const legacyToken = ghRaw['token'] as string
      log.info('[integration] getOctokit: Found legacy plaintext token (length=%d) — migrating to credentialStore', legacyToken.length)
      try {
        storeSecret('github-token', legacyToken)
        token = legacyToken
        // Remove the old plaintext token from the integration store
        store.set('github', {
          username: gh.username,
          connected: gh.connected,
          connectedAt: gh.connectedAt,
        })
        log.info('[integration] getOctokit: Migration complete — legacy token moved to encrypted credentialStore')
      } catch (err) {
        log.error('[integration] getOctokit: Migration failed —', err)
      }
    }
  }

  if (!token) {
    lastOctokitError = 'Connected as "' + gh.username + '" but the saved token could not be retrieved. This can happen after an app update or if the OS keychain was reset. Please disconnect and reconnect GitHub in Configure > Integrations.'
    log.error('[integration] getOctokit: %s', lastOctokitError)
    return null
  }

  log.info('[integration] getOctokit: Token retrieved OK (length=%d, prefix=%s…) — creating Octokit client', token.length, token.slice(0, 4))
  lastOctokitError = null
  octokit = new Octokit({ auth: token, request: { fetch: getSystemFetch() } })
  return octokit
}

/** Returns the last diagnostic error from getOctokit(), if any. */
function getLastOctokitError(): string | null {
  return lastOctokitError
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerIntegrationHandlers(ipcMain: IpcMain): void {

  // ── Status ───────────────────────────────────────────────────────────────

  ipcMain.handle('integration:get-status', () => {
    const gh = store.get('github')
    const atlassian = store.get('atlassian' as keyof IntegrationStoreSchema) as Record<string, unknown> | null
    const servicenow = store.get('servicenow' as keyof IntegrationStoreSchema) as Record<string, unknown> | null
    const backstage = store.get('backstage' as keyof IntegrationStoreSchema) as Record<string, unknown> | null
    const powerbi = store.get('powerbi' as keyof IntegrationStoreSchema) as Record<string, unknown> | null
    const splunk = store.get('splunk' as keyof IntegrationStoreSchema) as Record<string, unknown> | null
    const datadog = store.get('datadog' as keyof IntegrationStoreSchema) as Record<string, unknown> | null
    return {
      github: gh ? { connected: gh.connected, username: gh.username, connectedAt: gh.connectedAt } : null,
      atlassian: atlassian ?? null,
      servicenow: servicenow ?? null,
      backstage: backstage ?? null,
      powerbi: powerbi ?? null,
      splunk: splunk ?? null,
      datadog: datadog ?? null,
    }
  })

  // ── GitHub: Connect ──────────────────────────────────────────────────────

  ipcMain.handle('integration:github-connect', async (_e, args: { token: string }) => {
    log.info('[integration] github-connect: Attempting connection (token length=%d, prefix=%s...)', args.token.length, args.token.slice(0, 4))
    try {
      const kit = new Octokit({ auth: args.token, request: { fetch: getSystemFetch() } })
      const { data: user } = await kit.rest.users.getAuthenticated()
      log.info('[integration] github-connect: Authenticated as "%s" (id=%d)', user.login, user.id)

      // Store token encrypted via OS keychain, metadata in electron-store
      storeSecret('github-token', args.token)
      store.set('github', {
        username: user.login,
        connected: true,
        connectedAt: Date.now(),
      })

      // Cache the client
      octokit = kit

      return { success: true, username: user.login }
    } catch (err) {
      log.error('[integration] github-connect: Failed —', err)
      return { success: false, error: String(err) }
    }
  })

  // ── GitHub: Disconnect ───────────────────────────────────────────────────

  ipcMain.handle('integration:github-disconnect', () => {
    log.info('[integration] github-disconnect: Clearing token and connection state')
    deleteSecret('github-token')
    store.set('github', null)
    octokit = null
    return { success: true }
  })

  // ── GitHub: List Repos ───────────────────────────────────────────────────

  ipcMain.handle('integration:github-repos', async (_e, args?: { page?: number; perPage?: number }) => {
    log.info('[integration] github-repos: Fetching repos (page=%d, perPage=%d)', args?.page ?? 1, args?.perPage ?? 20)
    const kit = getOctokit()
    if (!kit) {
      const reason = getLastOctokitError() ?? 'Could not initialize GitHub API client.'
      log.error('[integration] github-repos: Octokit is null — %s', reason)
      return { success: false, error: reason }
    }

    try {
      // NOTE: `type` and `affiliation` are mutually exclusive in GitHub's API.
      // Using `affiliation` for explicit control. Do NOT add `type` alongside it.
      const requestParams = {
        sort: 'pushed' as const,
        direction: 'desc' as const,
        per_page: args?.perPage ?? 20,
        page: args?.page ?? 1,
        affiliation: 'owner,collaborator,organization_member',
      }
      log.debug('[integration] github-repos: Request params:', JSON.stringify(requestParams))

      const { data, headers } = await kit.rest.repos.listForAuthenticatedUser(requestParams)

      log.info('[integration] github-repos: Received %d repos (x-ratelimit-remaining: %s)', data.length, headers['x-ratelimit-remaining'] ?? 'n/a')
      if (data.length > 0) {
        log.debug('[integration] github-repos: First repo: %s, Last repo: %s', data[0].full_name, data[data.length - 1].full_name)
      } else {
        log.warn('[integration] github-repos: API returned 0 repos — check token scopes (needs "repo" for classic PATs, or "metadata:read" for fine-grained)')
      }

      return {
        success: true,
        repos: data.map((r) => ({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          description: r.description,
          private: r.private,
          url: r.html_url,
          pushedAt: r.pushed_at,
          language: r.language,
          defaultBranch: r.default_branch,
        })),
      }
    } catch (err) {
      const errStr = String(err)
      log.error('[integration] github-repos: API call failed —', errStr)
      // Surface HTTP status if available (Octokit wraps it)
      if (err && typeof err === 'object' && 'status' in err) {
        log.error('[integration] github-repos: HTTP status: %d', (err as { status: number }).status)
      }
      return { success: false, error: errStr }
    }
  })

  // ── GitHub: List Pull Requests ───────────────────────────────────────────

  ipcMain.handle('integration:github-pulls', async (_e, args: { owner: string; repo: string; state?: string; perPage?: number }) => {
    log.info('[integration] github-pulls: %s/%s (state=%s)', args.owner, args.repo, args.state ?? 'open')
    const kit = getOctokit()
    if (!kit) {
      const reason = getLastOctokitError() ?? 'GitHub not connected'
      log.error('[integration] github-pulls: %s', reason)
      return { success: false, error: reason }
    }

    try {
      const { data } = await kit.rest.pulls.list({
        owner: args.owner,
        repo: args.repo,
        state: (args.state as 'open' | 'closed' | 'all') ?? 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: args.perPage ?? 10,
      })

      log.info('[integration] github-pulls: Received %d PRs for %s/%s', data.length, args.owner, args.repo)
      return {
        success: true,
        pulls: data.map((pr) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          author: pr.user?.login ?? 'unknown',
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          mergedAt: pr.merged_at,
          url: pr.html_url,
          body: pr.body,
          head: pr.head.ref,
          base: pr.base.ref,
          draft: pr.draft,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,
          labels: pr.labels.map((l) => (typeof l === 'string' ? l : l.name ?? '')),
          reviewers: pr.requested_reviewers?.map((r) => ('login' in r ? r.login : r.name ?? '')) ?? [],
        })),
      }
    } catch (err) {
      log.error('[integration] github-pulls: Failed for %s/%s —', args.owner, args.repo, err)
      return { success: false, error: String(err) }
    }
  })

  // ── GitHub: Get Pull Request Detail ──────────────────────────────────────

  ipcMain.handle('integration:github-pull-detail', async (_e, args: { owner: string; repo: string; pullNumber: number }) => {
    log.info('[integration] github-pull-detail: %s/%s #%d', args.owner, args.repo, args.pullNumber)
    const kit = getOctokit()
    if (!kit) {
      const reason = getLastOctokitError() ?? 'GitHub not connected'
      log.error('[integration] github-pull-detail: %s', reason)
      return { success: false, error: reason }
    }

    try {
      const [{ data: pr }, { data: files }, { data: reviews }] = await Promise.all([
        kit.rest.pulls.get({ owner: args.owner, repo: args.repo, pull_number: args.pullNumber }),
        kit.rest.pulls.listFiles({ owner: args.owner, repo: args.repo, pull_number: args.pullNumber, per_page: 100 }),
        kit.rest.pulls.listReviews({ owner: args.owner, repo: args.repo, pull_number: args.pullNumber }),
      ])

      return {
        success: true,
        pull: {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          body: pr.body,
          author: pr.user?.login ?? 'unknown',
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          mergedAt: pr.merged_at,
          url: pr.html_url,
          head: pr.head.ref,
          base: pr.base.ref,
          draft: pr.draft,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,
          mergeable: pr.mergeable,
          labels: pr.labels.map((l) => l.name ?? ''),
        },
        files: files.map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch?.slice(0, 2000), // Truncate large patches
        })),
        reviews: reviews.map((r) => ({
          user: r.user?.login ?? 'unknown',
          state: r.state,
          body: r.body,
          submittedAt: r.submitted_at,
        })),
      }
    } catch (err) {
      log.error('[integration] github-pull-detail: Failed for %s/%s #%d —', args.owner, args.repo, args.pullNumber, err)
      return { success: false, error: String(err) }
    }
  })

  // ── GitHub: List Issues ──────────────────────────────────────────────────

  ipcMain.handle('integration:github-issues', async (_e, args: { owner: string; repo: string; state?: string; perPage?: number }) => {
    log.info('[integration] github-issues: %s/%s (state=%s)', args.owner, args.repo, args.state ?? 'open')
    const kit = getOctokit()
    if (!kit) {
      const reason = getLastOctokitError() ?? 'GitHub not connected'
      log.error('[integration] github-issues: %s', reason)
      return { success: false, error: reason }
    }

    try {
      const { data } = await kit.rest.issues.listForRepo({
        owner: args.owner,
        repo: args.repo,
        state: (args.state as 'open' | 'closed' | 'all') ?? 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: args.perPage ?? 20,
      })

      // Filter out pull requests (GitHub API returns PRs in issues endpoint)
      const issues = data.filter((i) => !i.pull_request)

      return {
        success: true,
        issues: issues.map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          author: i.user?.login ?? 'unknown',
          createdAt: i.created_at,
          updatedAt: i.updated_at,
          body: i.body,
          url: i.html_url,
          labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name ?? '')),
          assignees: i.assignees?.map((a) => a.login) ?? [],
          comments: i.comments,
        })),
      }
    } catch (err) {
      log.error('[integration] github-issues: Failed for %s/%s —', args.owner, args.repo, err)
      return { success: false, error: String(err) }
    }
  })

  // ── GitHub: Search Across Repos ──────────────────────────────────────────

  ipcMain.handle('integration:github-search', async (_e, args: { query: string; type?: 'issues' | 'pulls' | 'code' }) => {
    log.info('[integration] github-search: query="%s" type=%s', args.query, args.type ?? 'issues')
    const kit = getOctokit()
    if (!kit) {
      const reason = getLastOctokitError() ?? 'GitHub not connected'
      log.error('[integration] github-search: %s', reason)
      return { success: false, error: reason }
    }

    try {
      const gh = store.get('github')
      const user = gh?.username ?? ''
      const searchType = args.type ?? 'issues'

      if (searchType === 'code') {
        const { data } = await kit.rest.search.code({ q: `${args.query} user:${user}`, per_page: 10 })
        return {
          success: true,
          results: data.items.map((i) => ({
            type: 'code',
            path: i.path,
            repo: i.repository.full_name,
            url: i.html_url,
            snippet: (i.text_matches?.[0] as { fragment?: string } | undefined)?.fragment ?? '',
          })),
        }
      }

      // Issues and PRs
      const qualifier = searchType === 'pulls' ? 'is:pr' : 'is:issue'
      const { data } = await kit.rest.search.issuesAndPullRequests({
        q: `${args.query} ${qualifier} author:${user}`,
        sort: 'updated',
        per_page: 10,
      })

      return {
        success: true,
        results: data.items.map((i) => ({
          type: i.pull_request ? 'pull' : 'issue',
          number: i.number,
          title: i.title,
          state: i.state,
          repo: i.repository_url.split('/').slice(-2).join('/'),
          url: i.html_url,
          updatedAt: i.updated_at,
        })),
      }
    } catch (err) {
      log.error('[integration] github-search: Failed —', err)
      return { success: false, error: String(err) }
    }
  })
}
