# Git — Repository status, PR creation, and worktree management

## Purpose
This folder provides Git workflow utilities integrated into the GUI: display current branch status, staged/modified/untracked file changes with diffs and revert capability, recent commit history with AI commit detection, branch-aware PR builder that delegates work to sub-agents, and isolated git worktree management for parallel feature development.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| GitStatusPanel.tsx | Shows current branch, ahead/behind counts, changed files (by section), recent commits with AI detection | `GitStatusPanel({ cwd })` — calls git:status, git:log, git:file-diff, git:revert-file; FileRow subcomponent for individual file UI |
| PRBuilder.tsx | Textarea input for feature description; auto-generates branch name; delegates task to sub-agent (Copilot or Claude); tracks status (idle/working/done/error) | `PRBuilder({ cwd })` — calls subagent:spawn with permissionMode='acceptEdits' |
| WorktreeManager.tsx | Lists existing worktrees; create new worktree with branch name; check protected branches; launch interactive session in worktree | `WorktreeManager({ cwd })` — calls git:worktrees, git:branch-protection, git:create-worktree, git:remove-worktree, cli:start-session |

## Architecture Notes
- **IPC Calls Made:**
  - `git:status` — returns `{ branch, ahead, behind, staged[], modified[], untracked[] }`
  - `git:log` — returns `GitCommit[]` with `{ hash, shortHash, message, author, date, isAiCommit }`
  - `git:file-diff` — returns unified diff string for a single file
  - `git:revert-file` — reverts changes to a single file
  - `git:worktrees` — returns `GitWorktree[]` with `{ path, branch, commit, isMain }`
  - `git:branch-protection` — returns `{ protected: string[] }` of protected branch names
  - `git:create-worktree` — spawns worktree, returns path string
  - `git:remove-worktree` — removes worktree at given path
  - `subagent:spawn` — delegates PR build task with `{ name, cli, prompt, workingDirectory, permissionMode }`
  - `cli:start-session` — launches interactive session in worktree with `{ cli: 'claude', mode: 'interactive', name, workingDirectory }`
- GitStatusPanel: status object, commits array, loading, error state; FileRow tracks showDiff and diff string per file
- PRBuilder: description, branchName, cli choice (copilot|claude), status (idle|working|done|error), message
- WorktreeManager: worktrees array, protectedBranches array, showCreate form, branchName input, creating state, message feedback
- Branch name auto-generation: `` `feature/${description.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}` ``
- FileRow uses section-specific colors: staged=green, modified=yellow, untracked=gray
- AI commits marked with isAiCommit=true in timeline (indigo highlight)
- Protected branches prevent removal of main worktree; show warning banner
- Diff display uses color-coded lines: + (green), - (red), @@ (cyan)

## Business Context
GitStatusPanel provides at-a-glance repo health: what branch you're on, what's changed, and recent work. PRBuilder streamlines feature creation by automating branch setup and delegating implementation to AI sub-agents in accept-edits mode (AI can modify files but must ask before running commands). WorktreeManager enables parallel work on multiple features/branches simultaneously in isolated directories, avoiding context switching and merge conflicts during active development.
