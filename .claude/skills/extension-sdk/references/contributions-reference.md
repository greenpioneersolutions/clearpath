# Contributions Reference

The `contributes` object in the manifest registers UI contributions that the extension provides to the host app. Each contribution type injects UI into a specific area of the application.

## Overview

| Contribution Type | Description | Location in App |
|------------------|-------------|----------------|
| `navigation` | Sidebar nav items | Left sidebar navigation |
| `panels` | Panels in named UI slots | Various host UI slots |
| `widgets` | Dashboard widgets | Customizable dashboard grid |
| `tabs` | Tabs on existing pages | Tabbed pages (e.g., Insights) |
| `sidebarWidgets` | Compact sidebar widgets | Sidebar status area |
| `sessionHooks` | Session lifecycle handlers | Background (no UI) |
| `contextProviders` | AI context data sources | Context picker modal |
| `featureFlags` | Feature flag declarations | Feature flags system |

---

## `navigation`

Add items to the sidebar navigation.

```typescript
interface NavContribution {
  id: string           // Unique ID (scoped to extension)
  path: string         // Route path (e.g., "/my-ext/dashboard")
  label: string        // Display label in sidebar
  icon: string         // Icon name or SVG reference
  position?: string    // Placement hint: "top", "bottom", "after:<id>", or numeric index
  featureGate?: string[] // Feature flags that must all be enabled for this item to appear
}
```

**Example**:
```json
{
  "contributes": {
    "navigation": [
      {
        "id": "main-page",
        "path": "/my-ext",
        "label": "My Extension",
        "icon": "Puzzle",
        "position": "after:insights"
      },
      {
        "id": "settings-page",
        "path": "/my-ext/settings",
        "label": "Ext Settings",
        "icon": "Settings",
        "position": "bottom",
        "featureGate": ["myExtAdvancedMode"]
      }
    ]
  }
}
```

When the user clicks the nav item, the host renders the extension's renderer entry in a full-page iframe at the specified route. The renderer receives `window.__clearpath_component` set to the default component (or the component matching the route).

---

## `panels`

Render panels into named slots in the host UI.

```typescript
interface PanelContribution {
  id: string        // Unique ID (scoped to extension)
  slot: string      // Target slot name
  label: string     // Display label (shown as header or tooltip)
  component: string // Key into the extension's component map
}
```

### Available Slots

| Slot | Location | Description |
|------|----------|-------------|
| `sidebar:status` | Sidebar, above divider | Small status indicator in the sidebar |
| `home:widgets` | Home/Dashboard page | Inline panel on the home screen |
| `session-summary:after-stats` | Session summary view | Panel below session statistics |

**Example**:
```json
{
  "contributes": {
    "panels": [
      {
        "id": "status-indicator",
        "slot": "sidebar:status",
        "label": "My Extension Status",
        "component": "StatusWidget"
      },
      {
        "id": "home-widget",
        "slot": "home:widgets",
        "label": "My Extension",
        "component": "HomeWidget"
      }
    ]
  }
}
```

The `component` value tells the renderer which UI to render. In the IIFE pattern, use `window.__clearpath_component` to switch:

```javascript
if (window.__clearpath_component === 'HomeWidget') {
  renderHomeWidget(root)
} else if (window.__clearpath_component === 'StatusWidget') {
  renderStatusWidget(root)
} else {
  renderMainPage(root)
}
```

In the React pattern, the `component` maps to a key in the `components` object passed to `createExtension()`.

---

## `widgets`

Declare dashboard widgets for the customizable grid-layout dashboard.

```typescript
interface WidgetContribution {
  id: string                          // Unique ID (scoped to extension)
  name: string                        // Name shown in the widget picker
  description: string                 // Description shown in the picker
  defaultSize: { w: number; h: number } // Default grid size (columns x rows)
  component: string                   // Key into the extension's component map
}
```

**Example**:
```json
{
  "contributes": {
    "widgets": [
      {
        "id": "pr-score-widget",
        "name": "PR Score",
        "description": "Shows PR quality scores",
        "defaultSize": { "w": 2, "h": 2 },
        "component": "PRScoreWidget"
      }
    ]
  }
}
```

---

## `tabs`

Add tabs to existing tabbed pages in the host UI.

```typescript
interface TabContribution {
  id: string                          // Unique ID (scoped to extension)
  page: string                        // Target page: "insights"
  label: string                       // Tab header label
  component: string                   // Key into the extension's component map
  position?: 'start' | 'end' | number // Tab placement (default: 'end')
}
```

### Supported Pages

| Page | Description |
|------|-------------|
| `insights` | The Insights & Analytics page |

**Example**:
```json
{
  "contributes": {
    "tabs": [
      {
        "id": "custom-analytics",
        "page": "insights",
        "label": "Custom Analytics",
        "component": "AnalyticsTab",
        "position": "end"
      }
    ]
  }
}
```

---

## `sidebarWidgets`

Compact widgets rendered directly in the sidebar.

```typescript
interface SidebarWidgetContribution {
  id: string       // Unique ID (scoped to extension)
  label: string    // Tooltip or accessible label
  component: string // Key into the extension's component map
  position?: 'status' | 'bottom' // 'status' = above divider, 'bottom' = above collapse button
}
```

**Example**:
```json
{
  "contributes": {
    "sidebarWidgets": [
      {
        "id": "quick-status",
        "label": "Quick Status",
        "component": "SidebarStatus",
        "position": "status"
      }
    ]
  }
}
```

---

## `sessionHooks`

Subscribe to session lifecycle events. When an event fires, the host calls the named IPC handler on the extension's namespace.

```typescript
interface SessionHookContribution {
  event: 'session:started' | 'session:stopped' | 'turn:started' | 'turn:ended'
  handler: string  // IPC channel name (must be in extension's ipcChannels)
}
```

**Requires**: `sessions:lifecycle` permission.

### Events

| Event | Fired When | Data Passed |
|-------|-----------|-------------|
| `session:started` | A new CLI session begins | Session metadata (ID, CLI type) |
| `session:stopped` | A CLI session ends | Session metadata (ID, CLI type, exit code) |
| `turn:started` | An AI turn begins | Turn metadata (session ID) |
| `turn:ended` | An AI turn completes | Turn metadata (session ID, token usage) |

**Example**:
```json
{
  "contributes": {
    "sessionHooks": [
      {
        "event": "turn:ended",
        "handler": "my-ext:on-turn-ended"
      },
      {
        "event": "session:started",
        "handler": "my-ext:on-session-started"
      }
    ]
  }
}
```

The handlers must be registered in the main process entry and listed in `ipcChannels`:

```javascript
// main.cjs
async function activate(ctx) {
  ctx.registerHandler('my-ext:on-turn-ended', async (_event, args) => {
    const turnCount = (ctx.store.get('turnCount') || 0) + 1
    ctx.store.set('turnCount', turnCount)
    return { success: true, turnCount }
  })
}
```

---

## `contextProviders`

Declare context providers that users can attach to AI sessions.

```typescript
interface ContextProviderContribution {
  id: string       // Unique ID (scoped to extension)
  label: string    // Name shown in context picker
  description: string // Description in picker
  icon: string     // Icon name or SVG reference
  parameters: Array<{
    id: string
    label: string
    type: 'text' | 'repo-picker' | 'project-picker' | 'select'
    required?: boolean
    options?: Array<{ value: string; label: string }> // For 'select' type
    placeholder?: string
  }>
  handler: string  // IPC channel name
  examples: string[] // Example prompts/descriptions
  maxTokenEstimate?: number // Max tokens the provider might return
}
```

### Parameter Types

| Type | Renders | Description |
|------|---------|-------------|
| `text` | Text input | Free-form text field |
| `repo-picker` | Repository chooser | Specialized GitHub repo picker |
| `project-picker` | Project chooser | Specialized project picker |
| `select` | Dropdown | Options defined via `options` array |

**Example**:
```json
{
  "contributes": {
    "contextProviders": [
      {
        "id": "pr-context",
        "label": "PR Context",
        "description": "Provides PR details as context for AI sessions",
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
            "placeholder": "e.g. 123"
          }
        ],
        "handler": "my-ext:get-pr-context",
        "examples": ["Get PR #123 details", "Review the latest PR"],
        "maxTokenEstimate": 2000
      }
    ]
  }
}
```

The handler should return:
```javascript
{
  success: true,
  context: "## PR #123\n\nMarkdown context...",
  tokenEstimate: 500,
  metadata: { truncated: false }
}
```

---

## `featureFlags`

Declare feature flag keys that the extension manages.

```json
{
  "contributes": {
    "featureFlags": ["myExtVerboseMode", "myExtBetaFeature"]
  }
}
```

These flags are registered with the host's feature flag system. The extension (and other extensions with `feature-flags:read`) can read them via `sdk.featureFlags.get()`. Extensions with `feature-flags:write` can toggle them via `sdk.featureFlags.set()`.

Feature flags can also be used as `featureGate` on navigation items to conditionally show/hide nav entries.
