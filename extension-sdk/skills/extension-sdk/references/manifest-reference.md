# Extension Manifest Reference

The `clearpath-extension.json` file defines an extension's metadata, permissions, and contributions. It must be placed at the root of the extension directory.

## Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | `string` | Unique identifier in reverse-domain format. Lowercase alphanumeric with dots and hyphens. | `"com.company.my-ext"` |
| `name` | `string` | Human-readable display name | `"My Extension"` |
| `version` | `string` | Semantic version (MAJOR.MINOR.PATCH) | `"1.0.0"` |
| `description` | `string` | Brief description of what the extension does | `"Adds PR scoring"` |
| `author` | `string` | Author or organization name | `"ClearPathAI"` |
| `permissions` | `ExtensionPermission[]` | Array of permission strings the extension requires | `["storage", "notifications:emit"]` |

## Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `icon` | `string` | none | Path to icon file relative to extension root (SVG recommended) |
| `minAppVersion` | `string` | none | Minimum ClearPathAI version required (semver) |
| `main` | `string` | none | Path to main process entry (Node.js, CommonJS format). Omit for renderer-only extensions. |
| `renderer` | `string` | none | Path to renderer entry (loaded in sandboxed iframe). Omit for main-process-only extensions. |
| `allowedDomains` | `string[]` | `[]` | Domains allowed for `http:fetch`. Cannot include localhost or private IPs. |
| `requires` | `ExtensionRequirement[]` | `[]` | Integration prerequisites (e.g., GitHub connection) |
| `ipcNamespace` | `string` | none | Prefix for all IPC channels. Required if `ipcChannels` is used. |
| `ipcChannels` | `string[]` | `[]` | Registered IPC handler channels (must start with `<ipcNamespace>:`) |
| `storageQuota` | `number` | `5242880` | Max storage in bytes (0--52428800 / 50 MB) |
| `contributes` | `object` | `{}` | UI contributions (see contributions-reference.md) |

## Validation Rules

The `ExtensionValidator` enforces these rules at load time:

1. **ID format**: Must match `/^[a-z0-9]+(\.[a-z0-9-]+){2,}$/` -- reverse-domain, at least 3 segments, lowercase.
2. **Version**: Must be valid semver (`MAJOR.MINOR.PATCH`).
3. **Permissions**: Every entry must be a recognized `ExtensionPermission` string. Unknown permissions cause a validation error.
4. **IPC channel prefix**: All `ipcChannels` entries must start with `<ipcNamespace>:`. Omitting the namespace prefix is a validation error.
5. **Path containment**: `main`, `renderer`, and `icon` paths are resolved relative to the extension root. Paths that escape the directory (e.g., `../../etc/passwd`) are rejected.
6. **Entry file existence**: If `main` or `renderer` is declared, the file must exist on disk.
7. **Allowed domains**: Cannot include `localhost`, `127.*`, `10.*`, `192.168.*`, or `169.254.*`.
8. **Storage quota cap**: Maximum is `52428800` (50 MB). Must be a positive number.
9. **minAppVersion**: If specified, the running app version must be >= this value (semver comparison).

## `requires` Array

Declare integration prerequisites. The host checks these at load time and shows the user a message if the requirement is not met.

```json
{
  "requires": [
    {
      "integration": "github",
      "label": "GitHub Integration",
      "message": "Connect GitHub in Configure > Integrations to use this extension."
    }
  ]
}
```

### ExtensionRequirement Fields

| Field | Type | Description |
|-------|------|-------------|
| `integration` | `string` | Integration key to check (e.g., `"github"`, `"atlassian"`) |
| `label` | `string` | Human-readable label shown in the UI |
| `message` | `string` | Message shown when the requirement is not met |

## `contributes` Object

The `contributes` object registers UI contributions. See [contributions-reference.md](contributions-reference.md) for full documentation.

Supported contribution types:
- `navigation` -- sidebar nav items
- `panels` -- panels in named UI slots
- `widgets` -- dashboard widgets
- `tabs` -- tabs on existing pages
- `sidebarWidgets` -- compact sidebar widgets
- `sessionHooks` -- session lifecycle event handlers
- `contextProviders` -- AI context data sources
- `featureFlags` -- feature flag keys

## Complete Example

```json
{
  "id": "com.clearpathai.sdk-example",
  "name": "SDK Example",
  "version": "1.0.0",
  "description": "Example extension demonstrating all SDK capabilities",
  "author": "ClearPathAI",
  "icon": "assets/icon.svg",
  "minAppVersion": "1.8.0",
  "main": "dist/main.cjs",
  "renderer": "dist/renderer.js",
  "permissions": [
    "storage",
    "notifications:emit",
    "sessions:read",
    "cost:read",
    "feature-flags:read",
    "feature-flags:write",
    "context:estimate",
    "navigation",
    "env:read"
  ],
  "ipcNamespace": "sdk-example",
  "ipcChannels": [
    "sdk-example:get-config",
    "sdk-example:set-config",
    "sdk-example:get-demo-data",
    "sdk-example:on-turn-ended",
    "sdk-example:ctx-demo"
  ],
  "storageQuota": 5242880,
  "contributes": {
    "navigation": [
      {
        "id": "sdk-example-page",
        "path": "/sdk-example",
        "label": "SDK Example",
        "icon": "code",
        "position": "after:insights"
      }
    ],
    "panels": [
      {
        "id": "sdk-example-home-widget",
        "slot": "home:widgets",
        "component": "HomeWidget",
        "label": "SDK Example"
      }
    ],
    "featureFlags": ["sdkExampleVerbose"],
    "sessionHooks": [
      {
        "event": "turn:ended",
        "handler": "sdk-example:on-turn-ended"
      }
    ],
    "contextProviders": [
      {
        "id": "sdk-demo-context",
        "label": "SDK Demo Context",
        "description": "Returns demo data from the SDK Example extension",
        "parameters": [
          {
            "id": "topic",
            "label": "Topic",
            "type": "text",
            "required": false,
            "placeholder": "e.g. storage, sessions"
          }
        ],
        "handler": "sdk-example:ctx-demo",
        "examples": ["Show me SDK example data", "What can the SDK do?"],
        "maxTokenEstimate": 1000
      }
    ]
  }
}
```
