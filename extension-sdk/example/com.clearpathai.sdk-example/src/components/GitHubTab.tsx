/**
 * GitHub Tab — Demonstrates sdk.github.listRepos(), .search(),
 * .listPulls(), .listIssues(), .getPull().
 *
 * Provides a repo browser, search interface, and PR/issue drill-down.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useSDK } from '@clearpath/extension-sdk'
import {
  cardStyle, headingStyle, buttonStyle, buttonSecondaryStyle, inputStyle, labelStyle,
  errorStyle, loadingStyle, tableStyle, thStyle, tdStyle, tagStyle,
} from './shared-styles'

export function GitHubTab(): React.ReactElement {
  const sdk = useSDK()

  const [repos, setRepos] = useState<unknown[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<unknown[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // PR/Issue drill-down state
  const [selectedRepo, setSelectedRepo] = useState<{ owner: string; name: string } | null>(null)
  const [pulls, setPulls] = useState<unknown[]>([])
  const [issues, setIssues] = useState<unknown[]>([])
  const [drillLoading, setDrillLoading] = useState(false)

  const loadRepos = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const r = await sdk.github.listRepos({ page: 1, perPage: 20 })
      setRepos(r)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sdk])

  useEffect(() => {
    loadRepos()
  }, [loadRepos])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    try {
      setSearching(true)
      setError(null)
      const results = await sdk.github.search(searchQuery.trim(), 'issues')
      setSearchResults(results)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  const handleDrillDown = async (owner: string, name: string) => {
    try {
      setDrillLoading(true)
      setError(null)
      setSelectedRepo({ owner, name })
      const [p, i] = await Promise.all([
        sdk.github.listPulls(owner, name, { state: 'open' }),
        sdk.github.listIssues(owner, name, { state: 'open' }),
      ])
      setPulls(p)
      setIssues(i)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDrillLoading(false)
    }
  }

  return (
    <div>
      <h2 style={headingStyle}>GitHub (sdk.github)</h2>
      <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
        Browse repositories, search issues, and list PRs.
        Requires <code>integration:github:read</code> permission.
      </p>

      {error && <div style={errorStyle}>{error}</div>}

      {/* Search */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <h3 style={{ ...headingStyle, fontSize: '14px' }}>Search GitHub</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Query (issues search)</label>
            <input
              style={inputStyle}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="is:open label:bug"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button style={buttonStyle} onClick={handleSearch} disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <span style={labelStyle}>{searchResults.length} result(s)</span>
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
              {searchResults.slice(0, 10).map((r: unknown, i) => {
                const item = r as Record<string, unknown>
                return (
                  <div
                    key={i}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#0f172a',
                      borderRadius: '4px',
                      marginBottom: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <strong>{String(item.title ?? item.full_name ?? 'N/A')}</strong>
                    {item.html_url && (
                      <span style={{ color: '#64748b', marginLeft: '8px' }}>
                        {String(item.html_url)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Repos list */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ ...headingStyle, marginBottom: 0 }}>
            Repositories ({repos.length})
          </h3>
          <button style={buttonSecondaryStyle} onClick={loadRepos}>
            Refresh
          </button>
        </div>
        {loading ? (
          <div style={loadingStyle}>Loading repos...</div>
        ) : repos.length === 0 ? (
          <div style={loadingStyle}>No repositories found. Is GitHub connected?</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Repository</th>
                <th style={thStyle}>Visibility</th>
                <th style={thStyle}>Language</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {repos.slice(0, 20).map((repo: unknown, i) => {
                const r = repo as Record<string, unknown>
                const fullName = (r.fullName as string) || ''
                const [owner = '', name = ''] = fullName.split('/')
                return (
                  <tr key={i}>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>
                      <strong>{`${owner}/${name}`}</strong>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          ...tagStyle,
                          backgroundColor: r.private ? '#7c2d12' : '#065f46',
                          color: r.private ? '#fdba74' : '#6ee7b7',
                        }}
                      >
                        {r.private ? 'private' : 'public'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: '#94a3b8' }}>
                      {String(r.language ?? 'N/A')}
                    </td>
                    <td style={tdStyle}>
                      <button
                        style={{ ...buttonStyle, padding: '4px 10px', fontSize: '12px' }}
                        onClick={() => handleDrillDown(owner, name)}
                      >
                        PRs & Issues
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* PR/Issue drill-down */}
      {selectedRepo && (
        <div style={{ ...cardStyle, marginTop: '16px' }}>
          <h3 style={{ ...headingStyle, fontSize: '14px' }}>
            {selectedRepo.owner}/{selectedRepo.name} — Open PRs & Issues
          </h3>
          {drillLoading ? (
            <div style={loadingStyle}>Loading...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <h4 style={{ ...labelStyle, fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  Pull Requests ({pulls.length})
                </h4>
                {pulls.length === 0 ? (
                  <div style={loadingStyle}>No open PRs.</div>
                ) : (
                  pulls.slice(0, 10).map((pr: unknown, i) => {
                    const p = pr as Record<string, unknown>
                    return (
                      <div
                        key={i}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#0f172a',
                          borderRadius: '4px',
                          marginBottom: '4px',
                          fontSize: '12px',
                          borderLeft: '3px solid #5B4FC4',
                        }}
                      >
                        #{String(p.number)} {String(p.title ?? '')}
                      </div>
                    )
                  })
                )}
              </div>
              <div>
                <h4 style={{ ...labelStyle, fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  Issues ({issues.length})
                </h4>
                {issues.length === 0 ? (
                  <div style={loadingStyle}>No open issues.</div>
                ) : (
                  issues.slice(0, 10).map((issue: unknown, i) => {
                    const iss = issue as Record<string, unknown>
                    return (
                      <div
                        key={i}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#0f172a',
                          borderRadius: '4px',
                          marginBottom: '4px',
                          fontSize: '12px',
                          borderLeft: '3px solid #1D9E75',
                        }}
                      >
                        #{String(iss.number)} {String(iss.title ?? '')}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
