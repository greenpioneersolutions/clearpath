import { useState, useEffect, useCallback } from 'react'

interface GitHubRepo {
  id: number; name: string; fullName: string; description: string | null
  private: boolean; url: string; pushedAt: string | null; language: string | null
}

interface GitHubPR {
  number: number; title: string; state: string; author: string
  createdAt: string; updatedAt: string; mergedAt: string | null
  url: string; body: string | null; head: string; base: string
  draft: boolean; additions: number; deletions: number; changedFiles: number
  labels: string[]; reviewers: string[]
}

interface GitHubIssue {
  number: number; title: string; state: string; author: string
  createdAt: string; updatedAt: string; body: string | null
  url: string; labels: string[]; assignees: string[]; comments: number
}

type ViewMode = 'repos' | 'pulls' | 'issues'

interface Props {
  onInjectContext: (text: string) => void
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function GitHubPanel({ onInjectContext }: Props): JSX.Element {
  const [connected, setConnected] = useState(false)
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('repos')

  // Data
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [pulls, setPulls] = useState<GitHubPR[]>([])
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  const checkStatus = useCallback(async () => {
    setLoading(true)
    const status = await window.electronAPI.invoke('integration:get-status') as { github: { connected: boolean; username: string } | null }
    if (status.github?.connected) {
      setConnected(true)
      setUsername(status.github.username)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void checkStatus() }, [checkStatus])

  const loadRepos = useCallback(async () => {
    setDataLoading(true)
    const result = await window.electronAPI.invoke('integration:github-repos', { perPage: 15 }) as { success: boolean; repos?: GitHubRepo[] }
    if (result.success && result.repos) setRepos(result.repos)
    setDataLoading(false)
  }, [])

  useEffect(() => { if (connected) void loadRepos() }, [connected, loadRepos])

  const loadPulls = async (repo: GitHubRepo) => {
    setSelectedRepo(repo)
    setView('pulls')
    setDataLoading(true)
    const [owner, name] = repo.fullName.split('/')
    const result = await window.electronAPI.invoke('integration:github-pulls', { owner, repo: name, state: 'all', perPage: 15 }) as { success: boolean; pulls?: GitHubPR[] }
    if (result.success && result.pulls) setPulls(result.pulls)
    setDataLoading(false)
  }

  const loadIssues = async (repo: GitHubRepo) => {
    setSelectedRepo(repo)
    setView('issues')
    setDataLoading(true)
    const [owner, name] = repo.fullName.split('/')
    const result = await window.electronAPI.invoke('integration:github-issues', { owner, repo: name, state: 'open', perPage: 15 }) as { success: boolean; issues?: GitHubIssue[] }
    if (result.success && result.issues) setIssues(result.issues)
    setDataLoading(false)
  }

  const injectPR = (pr: GitHubPR) => {
    const text = [
      `GitHub PR #${pr.number}: ${pr.title}`,
      `State: ${pr.state} | Author: ${pr.author} | ${pr.head} → ${pr.base}`,
      `+${pr.additions} -${pr.deletions} across ${pr.changedFiles} files`,
      pr.labels.length > 0 ? `Labels: ${pr.labels.join(', ')}` : '',
      pr.body ? `\nDescription:\n${pr.body.slice(0, 1000)}` : '',
      `\nURL: ${pr.url}`,
    ].filter(Boolean).join('\n')
    onInjectContext(text)
  }

  const injectIssue = (issue: GitHubIssue) => {
    const text = [
      `GitHub Issue #${issue.number}: ${issue.title}`,
      `State: ${issue.state} | Author: ${issue.author} | ${issue.comments} comments`,
      issue.labels.length > 0 ? `Labels: ${issue.labels.join(', ')}` : '',
      issue.assignees.length > 0 ? `Assignees: ${issue.assignees.join(', ')}` : '',
      issue.body ? `\nDescription:\n${issue.body.slice(0, 1000)}` : '',
      `\nURL: ${issue.url}`,
    ].filter(Boolean).join('\n')
    onInjectContext(text)
  }

  const injectAllPRs = () => {
    if (pulls.length === 0) return
    const text = [
      `Recent Pull Requests for ${selectedRepo?.fullName}:`,
      '',
      ...pulls.map((pr) =>
        `#${pr.number} [${pr.state}${pr.draft ? '/draft' : ''}] ${pr.title} — by ${pr.author} (${timeAgo(pr.updatedAt)}) +${pr.additions}/-${pr.deletions} ${pr.changedFiles} files`
      ),
    ].join('\n')
    onInjectContext(text)
  }

  if (loading) return <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>

  if (!connected) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm space-y-3">
        <p>Connect GitHub to pull PRs and issues into your sessions</p>
        <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI.invoke('navigate:configure-integrations') }}
          className="text-indigo-500 hover:text-indigo-400 font-medium transition-colors">
          Go to Configure → Integrations
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-gray-500">{username}</span>
        </div>
        {view !== 'repos' && (
          <button onClick={() => { setView('repos'); setSelectedRepo(null) }}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
            ← All repos
          </button>
        )}
      </div>

      {/* Repo list */}
      {view === 'repos' && (
        <div className="space-y-1.5">
          {dataLoading ? (
            <p className="text-xs text-gray-400 text-center py-4">Loading repos...</p>
          ) : repos.map((repo) => (
            <div key={repo.id} className="bg-gray-50 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{repo.name}</p>
                  {repo.description && <p className="text-xs text-gray-500 truncate">{repo.description}</p>}
                  <div className="flex items-center gap-2 mt-0.5">
                    {repo.language && <span className="text-[10px] text-gray-400">{repo.language}</span>}
                    {repo.private && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded">private</span>}
                    {repo.pushedAt && <span className="text-[10px] text-gray-400">{timeAgo(repo.pushedAt)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <button onClick={() => void loadPulls(repo)}
                    className="px-2 py-1 text-[10px] text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50 transition-colors">PRs</button>
                  <button onClick={() => void loadIssues(repo)}
                    className="px-2 py-1 text-[10px] text-green-600 border border-green-200 rounded hover:bg-green-50 transition-colors">Issues</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pull requests */}
      {view === 'pulls' && selectedRepo && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-700">PRs — {selectedRepo.name}</h4>
            {pulls.length > 0 && (
              <button onClick={injectAllPRs}
                className="text-[10px] text-indigo-600 hover:text-indigo-500 font-medium transition-colors">
                Send all to session
              </button>
            )}
          </div>
          {dataLoading ? (
            <p className="text-xs text-gray-400 text-center py-4">Loading pull requests...</p>
          ) : pulls.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No pull requests found</p>
          ) : pulls.map((pr) => (
            <div key={pr.number}
              className="bg-gray-50 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors group cursor-pointer"
              onClick={() => injectPR(pr)}
              title="Click to send PR details to session"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      pr.mergedAt ? 'bg-purple-500' : pr.state === 'open' ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className="text-xs font-medium text-gray-800 truncate">{pr.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                    <span>#{pr.number}</span>
                    <span>{pr.author}</span>
                    <span>{timeAgo(pr.updatedAt)}</span>
                    <span className="text-green-600">+{pr.additions}</span>
                    <span className="text-red-500">-{pr.deletions}</span>
                    {pr.draft && <span className="bg-gray-200 text-gray-600 px-1 rounded">draft</span>}
                  </div>
                </div>
                <span className="text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                  Send →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Issues */}
      {view === 'issues' && selectedRepo && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-700">Issues — {selectedRepo.name}</h4>
          {dataLoading ? (
            <p className="text-xs text-gray-400 text-center py-4">Loading issues...</p>
          ) : issues.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No open issues</p>
          ) : issues.map((issue) => (
            <div key={issue.number}
              className="bg-gray-50 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors group cursor-pointer"
              onClick={() => injectIssue(issue)}
              title="Click to send issue details to session"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${issue.state === 'open' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-xs font-medium text-gray-800 truncate">{issue.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                    <span>#{issue.number}</span>
                    <span>{issue.author}</span>
                    <span>{timeAgo(issue.updatedAt)}</span>
                    {issue.comments > 0 && <span>{issue.comments} comments</span>}
                    {issue.labels.map((l) => (
                      <span key={l} className="bg-gray-200 text-gray-600 px-1 rounded">{l}</span>
                    ))}
                  </div>
                </div>
                <span className="text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                  Send →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
