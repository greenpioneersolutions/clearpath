# Team — Team collaboration, setup, and configuration management

## Purpose
Provides team onboarding, configuration sharing, marketplace agent discovery, and activity tracking features. Enables teams to sync settings across members, manage shared configurations, and track git activity with AI-generated commit detection.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| ActivityFeed.tsx | Displays recent git commits with AI-generation detection | ActivityFeed component |
| AgentMarketplace.tsx | Browse, search, and install/uninstall community agent definitions | AgentMarketplace component |
| ConfigBundlePanel.tsx | Export/import entire app configuration as JSON | ConfigBundlePanel component |
| SetupWizard.tsx | Four-step onboarding flow for new team members | SetupWizard component |
| SharedFolderSync.tsx | Manage shared configuration folder (network drive, Google Drive, git repo) | SharedFolderSync component |

## Architecture Notes
- **ActivityFeed**: 
  - IPC call: `team:git-activity` fetches commit history with limit (default: 40)
  - Displays commit hash (abbreviated to 7 chars), message, author, timestamp, AI-generated badge
  - Props: `workingDirectory` string for context

- **AgentMarketplace**:
  - IPC calls: `team:list-marketplace`, `team:install-marketplace-agent`, `team:uninstall-marketplace-agent`
  - State: search filter, category filter, expanded agent details
  - Agent type: `MarketplaceAgent` with id, name, description, author, CLI type (copilot|claude), category, prompt text, tools array, model, download count, installed boolean
  - Two-column grid layout with expandable prompt preview and tool badges

- **ConfigBundlePanel**:
  - IPC calls: `team:export-bundle` (returns file path), `team:import-bundle` (returns success/error)
  - Simple dual-button interface with status messaging
  - Exports entire app state: settings, agents, templates, profiles

- **SetupWizard**:
  - Four sequential steps: CLI tools installed → Auth configured → Team settings applied → Verification complete
  - IPC calls:
    - `team:check-setup` — checks Copilot/Claude CLI installation status
    - `cli:check-auth` — verifies authentication on both CLIs
    - `team:get-shared-folder`, `team:list-shared-configs`, `team:apply-shared-config` — config folder integration
  - Displays CLI detection status (installed path or "Not found")
  - Progress indicated by colored step indicators and buttons that activate at current step

- **SharedFolderSync**:
  - IPC calls:
    - `team:get-shared-folder` — fetch currently configured path
    - `team:set-shared-folder` — show folder picker dialog
    - `team:clear-shared-folder` — disconnect from folder
    - `team:list-shared-configs` — list .json config files in folder
    - `team:apply-shared-config` — import a specific config file
  - Config type: `SharedConfig` with fileName, name, description, path, modifiedAt timestamp
  - Three states: no folder → folder selected → folder with config list

## Business Context
Enables CoPilot Commander's team collaboration model: new members can run the setup wizard, pull team configurations from a shared folder (Dropbox, GitHub repo, network drive), browse and install community agents from marketplace, and track who's contributing to the codebase with AI detection. Configuration bundles allow easy onboarding across different machines.
