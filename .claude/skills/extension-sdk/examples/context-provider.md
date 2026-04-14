# Context Provider Example

Context providers allow extensions to supply data that users can attach to AI sessions as additional context. When a user selects the provider and fills in parameters, the host calls the extension's handler and injects the returned markdown into the session.

## Manifest Configuration

```json
{
  "id": "com.example.pr-context",
  "name": "PR Context Provider",
  "version": "1.0.0",
  "description": "Provides pull request details as AI session context",
  "author": "Your Name",
  "main": "dist/main.cjs",
  "permissions": [
    "storage",
    "integration:github:read"
  ],
  "ipcNamespace": "pr-ctx",
  "ipcChannels": [
    "pr-ctx:get-pr-context",
    "pr-ctx:get-recent-prs"
  ],
  "contributes": {
    "contextProviders": [
      {
        "id": "pr-details",
        "label": "Pull Request Details",
        "description": "Fetches PR title, description, changed files, and review comments as context",
        "icon": "GitPullRequest",
        "parameters": [
          {
            "id": "repo",
            "label": "Repository",
            "type": "repo-picker",
            "required": true
          },
          {
            "id": "prNumber",
            "label": "PR Number",
            "type": "text",
            "required": true,
            "placeholder": "e.g. 42"
          },
          {
            "id": "includeComments",
            "label": "Include Comments",
            "type": "select",
            "required": false,
            "options": [
              { "value": "yes", "label": "Yes" },
              { "value": "no", "label": "No" }
            ]
          }
        ],
        "handler": "pr-ctx:get-pr-context",
        "examples": [
          "Get details for PR #42",
          "Review the latest pull request"
        ],
        "maxTokenEstimate": 3000
      }
    ]
  }
}
```

### Key Manifest Points

- **`parameters`**: Defines a form the user fills in before the provider is invoked. The host renders the form UI.
  - `repo-picker` renders a GitHub repository chooser
  - `text` renders a free-form text field
  - `select` renders a dropdown with defined `options`
- **`handler`**: The IPC channel the host calls with the filled parameter values
- **`maxTokenEstimate`**: Helps the host plan context budget (estimated max tokens the provider might return)
- **`examples`**: Shown in the context picker UI as usage hints

## dist/main.cjs

```javascript
'use strict'

async function activate(ctx) {
  ctx.log.info('[pr-ctx] Activating PR Context Provider...')

  // ── Context Provider Handler ──────────────────────────────────────────
  // Called when a user attaches this context provider to an AI session.
  // The host passes the filled parameter values as `args`.

  ctx.registerHandler('pr-ctx:get-pr-context', async (_event, args) => {
    const { repo, prNumber, includeComments } = args || {}

    // Validate required parameters
    if (!repo || !prNumber) {
      return {
        success: false,
        error: 'Repository and PR number are required',
      }
    }

    try {
      // Parse repo into owner/name
      const [owner, repoName] = typeof repo === 'string'
        ? repo.split('/')
        : [repo.owner, repo.name]

      if (!owner || !repoName) {
        return { success: false, error: 'Invalid repository format. Expected "owner/repo".' }
      }

      // Fetch PR data via the host's GitHub integration
      const prData = await ctx.invoke(
        'integration:github-pull-detail',
        { owner, repo: repoName, pullNumber: Number(prNumber) },
      )

      if (!prData) {
        return { success: false, error: `PR #${prNumber} not found` }
      }

      // Build markdown context
      let context = `## Pull Request #${prData.number}: ${prData.title}\n\n`
      context += `**Repository**: ${owner}/${repoName}\n`
      context += `**Author**: ${prData.user?.login || 'Unknown'}\n`
      context += `**State**: ${prData.state}\n`
      context += `**Created**: ${prData.created_at}\n`
      context += `**Updated**: ${prData.updated_at}\n\n`

      if (prData.body) {
        context += `### Description\n\n${prData.body}\n\n`
      }

      if (prData.changed_files) {
        context += `### Changed Files (${prData.changed_files} files, `
        context += `+${prData.additions} -${prData.deletions})\n\n`
      }

      if (prData.labels && prData.labels.length > 0) {
        context += `**Labels**: ${prData.labels.map(l => l.name).join(', ')}\n\n`
      }

      // Estimate token count
      const tokenEstimate = Math.ceil(context.length / 4)

      // Track usage in storage
      const usageCount = (ctx.store.get('usageCount') || 0) + 1
      ctx.store.set('usageCount', usageCount)
      ctx.store.set('lastUsed', Date.now())

      ctx.log.info(
        '[pr-ctx] Generated context for %s/%s#%s (%d tokens est.)',
        owner, repoName, prNumber, tokenEstimate,
      )

      return {
        success: true,
        context,
        tokenEstimate,
        metadata: {
          repo: `${owner}/${repoName}`,
          prNumber: Number(prNumber),
          truncated: false,
        },
      }
    } catch (err) {
      ctx.log.error('[pr-ctx] Failed to fetch PR context:', err.message)
      return {
        success: false,
        error: `Failed to fetch PR data: ${err.message}`,
      }
    }
  })

  ctx.log.info('[pr-ctx] PR Context Provider activated')
}

function deactivate() {}

module.exports = { activate, deactivate }
```

## Handler Return Format

Context provider handlers must return an object with this shape:

```javascript
{
  success: true,            // boolean -- indicates success/failure
  context: '## Markdown...',  // string -- the markdown context to inject
  tokenEstimate: 500,       // number -- estimated token count
  metadata: {               // object -- optional metadata
    truncated: false,       // whether the context was truncated
    // ... any other metadata
  },
}
```

On error:
```javascript
{
  success: false,
  error: 'Human-readable error message',
}
```

## How Users Interact With Context Providers

1. User opens the context picker in a session
2. User sees "Pull Request Details" listed with its description and icon
3. User clicks it and fills in the parameter form (repo picker, PR number, include comments dropdown)
4. User clicks "Attach" -- the host calls `pr-ctx:get-pr-context` with the filled values
5. The returned markdown is injected into the session context
6. The AI can now reference the PR details in its responses

## Best Practices

1. **Keep context concise**: AI models have limited context windows. Include the most relevant data.
2. **Estimate tokens accurately**: Overestimating wastes budget; underestimating causes unexpected truncation.
3. **Handle missing data**: Not all fields will be present. Check before formatting.
4. **Return structured markdown**: Use headers, bold, and lists for readability.
5. **Track usage**: Store usage counts to understand how the provider is being used.
6. **Set `maxTokenEstimate`**: This helps the host warn users before attaching large contexts.
