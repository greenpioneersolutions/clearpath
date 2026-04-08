# Agents — User-created and discovered agent management

## Purpose
Manages discovery, persistence, and state of user-created agents from both GitHub Copilot CLI and Claude Code CLI. Agents are stored as markdown files in `.github/agents/` (for Copilot) and `.claude/agents/` (for Claude Code) directories at both global and project levels. Handles frontmatter parsing, file I/O, and profile-based agent enabling/disabling.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| AgentManager.ts | Core agent discovery, CRUD, and state management | `AgentManager` class; `listAgents()`, `createAgent()`, `readAgentFile()`, `writeAgentFile()`, `deleteAgent()`, `getEnabledAgentIds()`, `setEnabledAgentIds()`, `getActiveAgents()`, `setActiveAgent()`, `getProfiles()`, `saveProfile()`, `applyProfile()`, `deleteProfile()` |

## Architecture Notes

### Agent Discovery
- Scans two locations per CLI: global (`~/.github/agents/`, `~/.claude/agents/`) and project-level (`.github/agents/`, `.claude/agents/`)
- Copilot agents: `.agent.md` files
- Claude agents: `.md` files
- Built-in CLI agents are no longer listed by this manager (users create their own via Starter Pack)

### Data Storage
- Uses `electron-store` with encryption key from `storeEncryption.ts`
- Store name: `clear-path-agents`
- Schema: `AgentStoreSchema` with `profiles[]`, `enabledAgentIds[]`, `activeAgents { copilot: string | null, claude: string | null }`
- Max 500 profiles stored

### Frontmatter Parsing
- Custom YAML parser (`parseFrontmatter()`) handles agent metadata:
  - `name`: Agent name
  - `description`: Purpose
  - `model`: Optional model override
  - `tools`: List of tool names agent can use
- Body becomes the agent's prompt

### Agent Serialization
- `serializeToMarkdown()` converts agent definition to markdown with frontmatter
- Creates stable file IDs using `slugify()` or random UUID suffix
- File path pattern: `[name-slug].agent.md` or `[name-slug].md`

### Agent State
- **Enabled/Active**: Can have multiple enabled agents, but only one active per CLI (copilot or claude)
- **Profiles**: Named presets of enabled agent sets (e.g., "Agile Mode", "Security Audit Mode")

## Business Context
Powers the Agent Library feature in the UI. Users can:
- Discover custom agents they've created
- Toggle agents on/off
- Save/load preset profiles of agent combinations
- Edit agent definitions directly in files
- Switch between "active" agents per CLI (determines which agent is the default)

## Integration Points
- Reads from filesystem: `~/.github/agents/*.agent.md`, `~/.claude/agents/*.md`, and project-level equivalents
- IPC handlers would bind to `agent:list`, `agent:create`, `agent:delete`, `agent:get-profiles`, `agent:save-profile`, etc.
- Uses `getStoreEncryptionKey()` from `../utils/storeEncryption.ts`
