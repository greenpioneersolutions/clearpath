# Integrations — GitHub API wrapper for importing PRs and issues

## Purpose
Provides a UI panel for authenticated GitHub integration, allowing users to browse repositories, pull requests, and issues from connected GitHub accounts. Enables injecting GitHub context (PR details, issue descriptions) into active AI sessions for discussion.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| GitHubPanel.tsx | Main GitHub integration panel with repo/PR/issue browsing | GitHubPanel component |

## Architecture Notes
- **Status checking**: Uses `integration:get-status` IPC to verify GitHub authentication and retrieve username
- **Data loading**: Makes IPC calls to fetch:
  - `integration:github-repos` — list user's repositories (perPage: 15)
  - `integration:github-pulls` — fetch pull requests for a selected repo (state: 'all')
  - `integration:github-issues` — fetch open issues for a selected repo (state: 'open')
- **View modes**: Three-state view (repos → pulls/issues) with navigation between them
- **Context injection**: Two injection patterns:
  - Single item: `injectPR()` and `injectIssue()` format individual items with metadata
  - Bulk: `injectAllPRs()` sends entire PR list for a repo at once
- **Type interfaces**: 
  - `GitHubRepo` — repository metadata including language, privacy, last push time
  - `GitHubPR` — PR data with draft status, line changes, reviewers
  - `GitHubIssue` — issue data with assignees, comments, labels
- **Formatting helpers**: `timeAgo()` utility converts ISO dates to relative format (e.g., "5m ago")

## Business Context
Powers the GitHub integration feature of CoPilot Commander, enabling users to surface GitHub project context (open PRs, issues, recent changes) without leaving the app. Particularly useful for AI-assisted code review and issue triage workflows.
