import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { Octokit } from 'octokit'

// ── Store ────────────────────────────────────────────────────────────────────

interface IntegrationStoreSchema {
  github: {
    token: string
    username: string
    connected: boolean
    connectedAt: number
  } | null
}

const store = new Store<IntegrationStoreSchema>({
  name: 'clear-path-integrations',
  defaults: {
    github: null,
  },
})

// ── GitHub client cache ──────────────────────────────────────────────────────

let octokit: Octokit | null = null

function getOctokit(): Octokit | null {
  if (octokit) return octokit
  const gh = store.get('github')
  if (!gh?.token) return null
  octokit = new Octokit({ auth: gh.token })
  return octokit
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerIntegrationHandlers(ipcMain: IpcMain): void {

  // ── Status ───────────────────────────────────────────────────────────────

  ipcMain.handle('integration:get-status', () => {
    const gh = store.get('github')
    return {
      github: gh ? { connected: gh.connected, username: gh.username, connectedAt: gh.connectedAt } : null,
    }
  })

  // ── GitHub: Connect ──────────────────────────────────────────────────────

  ipcMain.handle('integration:github-connect', async (_e, args: { token: string }) => {
    try {
      const kit = new Octokit({ auth: args.token })
      const { data: user } = await kit.rest.users.getAuthenticated()

      store.set('github', {
        token: args.token,
        username: user.login,
        connected: true,
        connectedAt: Date.now(),
      })

      // Cache the client
      octokit = kit

      return { success: true, username: user.login }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── GitHub: Disconnect ───────────────────────────────────────────────────

  ipcMain.handle('integration:github-disconnect', () => {
    store.set('github', null)
    octokit = null
    return { success: true }
  })

  // ── GitHub: List Repos ───────────────────────────────────────────────────

  ipcMain.handle('integration:github-repos', async (_e, args?: { page?: number; perPage?: number }) => {
    const kit = getOctokit()
    if (!kit) return { success: false, error: 'GitHub not connected' }

    try {
      const { data } = await kit.rest.repos.listForAuthenticatedUser({
        sort: 'pushed',
        direction: 'desc',
        per_page: args?.perPage ?? 20,
        page: args?.page ?? 1,
      })

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
      return { success: false, error: String(err) }
    }
  })

  // ── GitHub: List Pull Requests ───────────────────────────────────────────

  ipcMain.handle('integration:github-pulls', async (_e, args: { owner: string; repo: string; state?: string; perPage?: number }) => {
    const kit = getOctokit()
    if (!kit) return { success: false, error: 'GitHub not connected' }

    try {
      const { data } = await kit.rest.pulls.list({
        owner: args.owner,
        repo: args.repo,
        state: (args.state as 'open' | 'closed' | 'all') ?? 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: args.perPage ?? 10,
      })

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
      return { success: false, error: String(err) }
    }
  })

  // ── GitHub: Get Pull Request Detail ──────────────────────────────────────

  ipcMain.handle('integration:github-pull-detail', async (_e, args: { owner: string; repo: string; pullNumber: number }) => {
    const kit = getOctokit()
    if (!kit) return { success: false, error: 'GitHub not connected' }

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
      return { success: false, error: String(err) }
    }
  })

  // ── GitHub: List Issues ──────────────────────────────────────────────────

  ipcMain.handle('integration:github-issues', async (_e, args: { owner: string; repo: string; state?: string; perPage?: number }) => {
    const kit = getOctokit()
    if (!kit) return { success: false, error: 'GitHub not connected' }

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
      return { success: false, error: String(err) }
    }
  })

  // ── GitHub: Search Across Repos ──────────────────────────────────────────

  ipcMain.handle('integration:github-search', async (_e, args: { query: string; type?: 'issues' | 'pulls' | 'code' }) => {
    const kit = getOctokit()
    if (!kit) return { success: false, error: 'GitHub not connected' }

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
      return { success: false, error: String(err) }
    }
  })
}
