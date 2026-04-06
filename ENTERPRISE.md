# ClearPathAI for the Enterprise

You're here because you're thinking about what it takes to bring AI tooling inside your organization — on your terms, in your environment, behind your firewalls. You've probably spent months evaluating options and running into the same wall: most AI tools want your data going somewhere else, or they assume everyone on your team is a developer who lives in a terminal.

ClearPathAI was built for exactly this situation.

This document walks through everything an enterprise team needs to know — from initial evaluation to full deployment. No sales pitch, no "contact us for pricing." It's open source, it's MIT licensed, and the entire point is that **you take it, you own it, and nothing leaves your four walls unless you decide it should.**

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Architecture for Enterprise](#architecture-for-enterprise)
- [Security Model](#security-model)
- [Data Residency & Privacy](#data-residency--privacy)
- [Compliance & Audit](#compliance--audit)
- [Deployment Options](#deployment-options)
- [Authentication & Identity](#authentication--identity)
- [Policy Framework](#policy-framework)
- [Cost Governance](#cost-governance)
- [Team Onboarding](#team-onboarding)
- [Integration Points](#integration-points)
- [Local AI Models (Air-Gapped)](#local-ai-models-air-gapped)
- [Customization & Branding](#customization--branding)
- [Support & Community](#support--community)
- [Getting Started Checklist](#getting-started-checklist)
- [FAQ for Enterprise Decision-Makers](#faq-for-enterprise-decision-makers)

---

## Why This Exists

Most enterprises have already invested in GitHub Copilot. The licenses are paid for. The security reviews are done. The procurement paperwork is filed. But here's the problem: the most powerful way to use Copilot is through the CLI, and the majority of your team — project managers, analysts, team leads, designers — are never going to open a terminal.

ClearPathAI solves this by wrapping the CLI tools your organization has already approved (GitHub Copilot CLI, Claude Code CLI) in a desktop application that anyone can use. No terminal. No memorizing flags. Just a conversation interface with enterprise controls layered on top.

**What this means for your organization:**
- You're not introducing a new AI provider — you're making the one you already have accessible to more people
- Nothing changes about your existing AI contracts, data agreements, or security posture
- Non-technical team members get full access to the same AI capabilities developers use
- You get oversight, cost tracking, and compliance controls that the raw CLI doesn't provide

---

## Architecture for Enterprise

```
┌──────────────────────────────────────────────────────────┐
│                   Desktop Application                     │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  React UI (4 screens: Home, Work, Insights, Config) │ │
│  └───────────────────────┬─────────────────────────────┘ │
│                          │ IPC (process-local only)       │
│  ┌───────────────────────┴─────────────────────────────┐ │
│  │  Node.js Main Process                               │ │
│  │  ┌───────────┐ ┌──────────┐ ┌────────────────────┐ │ │
│  │  │ CLI       │ │ Policy   │ │ Compliance         │ │ │
│  │  │ Manager   │ │ Engine   │ │ Audit Logger       │ │ │
│  │  └───────────┘ └──────────┘ └────────────────────┘ │ │
│  │  ┌───────────┐ ┌──────────┐ ┌────────────────────┐ │ │
│  │  │ Cost      │ │ Auth     │ │ Notification       │ │ │
│  │  │ Tracker   │ │ Manager  │ │ Manager            │ │ │
│  │  └───────────┘ └──────────┘ └────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│              │                    │                        │
│              ▼                    ▼                        │
│     ┌──────────────┐    ┌──────────────┐                  │
│     │ Copilot CLI  │    │ Claude CLI   │                  │
│     │ (approved    │    │ (optional,   │                  │
│     │  by your     │    │  if licensed)│                  │
│     │  org)        │    │              │                  │
│     └──────────────┘    └──────────────┘                  │
└──────────────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
  Your org's existing      Your org's existing
  Copilot agreement        Anthropic agreement
  (data goes where         (same data story)
   it always went)
```

**Key architectural decisions for enterprise:**

1. **Desktop-only, no server required.** ClearPathAI is an Electron desktop app. There is no central server, no SaaS dependency, no cloud component. It runs entirely on the user's machine.

2. **CLI wrapper, not AI provider.** ClearPathAI does not process AI requests itself. It spawns the CLI tools (Copilot, Claude) as child processes. Your data flows through the same channels as if the user typed the command in a terminal — the same data agreements, the same endpoints, the same security posture.

3. **Local storage only.** All app data (sessions, settings, costs, audit logs) is stored locally via `electron-store` in the user's Application Support directory. Nothing is transmitted to external servers by ClearPathAI itself.

4. **Process isolation.** Each AI session runs as a separate child process. Sessions cannot access each other's state. The main process manages lifecycle but cannot read session internals.

---

## Security Model

### What ClearPathAI Does NOT Do

Before we talk about what it does, let's be clear about what it doesn't:

- **Delegates CLI authentication to the tools themselves.** GitHub OAuth and Anthropic auth are managed by the respective CLI tools. When users configure environment variables (API keys, tokens) through the app, those values are encrypted at rest using the OS keychain via Electron's safeStorage API. Encrypted credentials are never sent to the renderer process in plaintext — only masked previews are shown in the UI.
- **Does not proxy AI requests.** All AI communication happens between the CLI process and the AI provider's API — the same path as direct CLI usage.
- **Does not transmit data to any ClearPathAI server.** There is no telemetry, no analytics collection, no phone-home behavior. Check the source.
- **Does not require network access beyond what the CLI tools need.** If your Copilot CLI works, ClearPathAI works.

### What ClearPathAI DOES for Security

- **File Protection Patterns**: Configure glob rules (e.g., `*.env`, `credentials/**`, `**/*.key`) that prevent the AI from reading or modifying sensitive files. Enforced at the application level before any CLI interaction.

- **Sensitive Data Scanning**: Prompts are scanned for patterns that look like credentials, API keys, or personal data before being sent to the AI. Configurable to warn or block.

- **Permission Modes**: Control how much autonomy the AI has — from "ask before everything" (Default) to "read-only analysis" (Plan) to specific modes like Accept Edits or Auto. These are enforced per-session.

- **Tool Allow/Deny Lists**: Granular control over which tools the AI can use (file read, file write, shell execution, etc.). These map directly to the CLI's built-in permission system.

- **Audit Logging**: AI interactions are logged — session start/stop, prompt metadata (hash + character count, not plaintext content), data deletion events, policy violations, and security events. Logs are retained locally with automatic archival when the active log exceeds 10,000 entries. Archived entries are written to append-only JSONL files. Audit logs cannot be cleared from the UI. Exportable via compliance snapshot.

- **Encryption at Rest**: All persistent data stores are encrypted using AES encryption with a machine-derived key. Sensitive credentials (API keys, tokens) are additionally encrypted using the OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret) via Electron's safeStorage API.

- **Rate Limiting**: Expensive operations (session creation, sub-agent spawning, file watching, git operations, webhook testing, scheduled task execution, knowledge base generation, data deletion) are rate-limited to prevent abuse and resource exhaustion.

- **MCP Server Validation**: MCP server configurations are validated before being saved — dangerous commands are blocked, shell metacharacters in arguments are rejected, and unknown commands trigger warnings.

- **Config Bundle Integrity**: Shared configuration bundles are HMAC-SHA256 signed on export and verified on import. Tampered bundles are rejected. Bundle size is limited to 5MB to prevent resource exhaustion.

### Authorization Model

ClearPathAI is designed as a **single-user desktop application**. There is no built-in role-based access control (RBAC) or multi-user permission system. Every user who can launch the app has full access to all features, including:
- Session management and AI interaction
- Settings, policy, and configuration changes
- Data deletion and factory reset (protected by OS-level confirmation dialogs)
- Compliance log viewing and export
- Scheduled task management

**For enterprise deployments:**
- Use **OS-level user isolation** (separate macOS/Windows/Linux user accounts) to enforce per-user boundaries
- ClearPathAI's encryption key is derived per-user — each OS user has separate, isolated encrypted data
- Restrict app installation to approved users via your software distribution system (Jamf, SCCM, Intune)
- For stricter controls, fork the repository and gate sensitive operations behind additional authentication checks

Multi-user RBAC is on the roadmap for a future version but is not available in the current release.

---

## Data Residency & Privacy

**Where does data go?**

| Data Type | Where It Goes | ClearPathAI's Role |
|-----------|--------------|-------------------|
| AI prompts & responses | Your AI provider (GitHub/Anthropic) via their API | Passes through the CLI process — ClearPathAI doesn't intercept or modify |
| Session logs | Local machine only (`~/Library/Application Support/clear-path/`) | Stores for UI display and audit; never transmitted |
| Settings & policies | Local machine only | Stored via electron-store; exportable as config bundles for team sharing |
| Audit trail | Local machine only | Locally retained log with automatic archival; exportable for compliance reporting |
| Cost records | Local machine only | Calculated from CLI usage output; stored for analytics |

**ClearPathAI adds no new data transmission paths.** If your security team has approved Copilot CLI, ClearPathAI doesn't change the data flow — it wraps it in a GUI and adds local-only controls on top.

### For Air-Gapped Environments

ClearPathAI supports local AI models via Ollama and LM Studio. In this configuration:
- All AI processing happens on the local machine or local network
- Zero data leaves your environment
- No internet connection required after initial setup
- Full feature parity (sessions, templates, workflows, analytics)

See [Local AI Models](#local-ai-models-air-gapped) for setup details.

---

## Compliance & Audit

### Audit Log

Every action in ClearPathAI generates an audit entry:

| Event Type | What's Logged |
|------------|---------------|
| Session events | Start, stop, resume — with CLI type, user, timestamp |
| Prompt events | Every prompt sent — metadata logged (character count, SHA-256 hash). Prompt content is NOT stored in the audit log to protect sensitive data. |
| Tool use events | Tool invocations tracked at the CLI level. ClearPathAI logs tool permission decisions (allow/deny). |
| File access events | File protection pattern matches are logged when the AI attempts to access a protected file. |
| Permission events | Permission prompts shown and the user's response (allow/deny) |
| Configuration changes | Policy changes and setting modifications are logged when they occur through the app. |
| Policy violations | Any action that triggered a policy rule (blocked or warned) |

### Compliance Snapshot Export

One-click export of the complete compliance state:
- All audit log entries for a date range
- Active policies and their enforcement levels
- File protection patterns
- Permission mode history
- Security events flagged during the period

The export is designed for handoff to compliance officers, auditors, or security review boards. Format is JSON (machine-readable) with an optional summary report.

### Regulatory Alignment

ClearPathAI's controls help organizations demonstrate compliance with:

| Regulation | How ClearPathAI Helps |
|------------|----------------------|
| SOC 2 | Audit logging, access controls, data residency documentation |
| HIPAA | File protection patterns for PHI, sensitive data scanning, audit trail |
| GDPR | Data stays local, no third-party data processing by the app itself |
| PCI DSS | Credential scanning, file protection for cardholder data patterns |
| FedRAMP | Air-gapped deployment option, local-only data storage |
| SOX | Audit trail with automatic archival, compliance snapshot exports |

> ClearPathAI does not guarantee compliance with any specific regulation. It provides tools and controls that support compliance efforts. Consult your compliance team for your specific requirements.

---

## Deployment Options

### Option 1: Individual Installation (Small Teams)

Best for: Teams of 5-20 people getting started.

1. Download the release for your platform from the [Releases page](../../releases)
2. Install the CLI tools (Copilot CLI, Claude Code CLI) via your standard software distribution
3. Each user installs ClearPathAI and authenticates with their existing CLI credentials
4. Share a config bundle (exported from a configured instance) so everyone starts with the same settings

**Time to deploy:** Minutes per user.

### Option 2: Managed Distribution (Medium Teams)

Best for: Teams of 20-100 with IT support.

1. Package ClearPathAI into your software distribution system (Jamf, SCCM, Intune, etc.)
2. Pre-configure a config bundle with organization-standard policies, templates, and settings
3. Distribute the config bundle alongside the app (or host it on an internal share)
4. Users launch the app, import the config bundle, and authenticate

**Customization options:**
- Pre-set policies and file protections before distribution
- Include organization-specific templates and agents
- Set default permission modes appropriate for your environment
- Pre-configure budget limits

### Option 3: Fork and Customize (Large Enterprises)

Best for: Organizations that want to make ClearPathAI their own.

1. Fork the repository
2. Customize branding, default configurations, and built-in templates
3. Add organization-specific integrations or MCP servers
4. Build and sign with your organization's code signing certificates
5. Distribute through your internal channels

**What enterprises typically customize:**
- Branding (logo, colors, app name) — see [Customization & Branding](#customization--branding)
- Default policy presets tailored to organizational requirements
- Built-in template libraries for team-specific workflows
- Integration with internal systems via MCP servers
- Default model configurations and budget limits

---

## Authentication & Identity

ClearPathAI delegates authentication entirely to the underlying CLI tools:

| CLI Tool | Auth Method | How It Works |
|----------|-------------|--------------|
| GitHub Copilot | GitHub OAuth or PAT | User runs `/login` or sets `GH_TOKEN` env var. ClearPathAI checks status via `copilot` CLI. |
| Claude Code | Anthropic auth or API key | User runs `claude auth login`. ClearPathAI checks status via `claude` CLI. |

**ClearPathAI encrypts any credentials it handles.** When users provide GitHub tokens for the integration panel or configure API keys via environment variables, these are encrypted using the OS keychain (macOS Keychain, Windows DPAPI, or Linux libsecret) via Electron's safeStorage API. CLI tool authentication (GitHub OAuth, Anthropic auth) is delegated to the tools themselves — ClearPathAI checks auth status but does not intercept CLI auth flows.

### Enterprise SSO Integration

If your organization uses SSO for GitHub:
- Users authenticate through your normal GitHub SSO flow
- The Copilot CLI respects your SSO configuration
- ClearPathAI sees the authenticated state and enables the connection

No additional SSO configuration is needed in ClearPathAI itself.

### Environment Variable Support

For automated or shared environments:
- `GH_TOKEN` / `GITHUB_TOKEN` — GitHub Copilot authentication
- `ANTHROPIC_API_KEY` — Claude Code authentication

These can be set at the system level by IT without user interaction.

---

## Policy Framework

Policies are rules that govern what the AI can and cannot do within ClearPathAI. They are defined locally and enforced at the application level.

### Policy Presets

| Preset | Description | Best For |
|--------|-------------|----------|
| **Cautious** | Maximum restrictions. AI asks permission for everything. All file protections active. Budget caps enforced. | New deployments, regulated environments |
| **Standard** | Balanced. AI can read freely, asks before writing. Common file protections. Budget warnings enabled. | Most teams |
| **Unrestricted** | Minimal restrictions. AI operates with broad permissions. File protections for credentials only. | Development/testing environments |

### Custom Policies

Organizations can create custom policies that define:

- **File protection rules**: Glob patterns for files the AI cannot access (read or write)
- **Permission mode enforcement**: Lock sessions to specific permission modes (e.g., "Plan mode only" for analyst roles)
- **Tool restrictions**: Allow/deny specific tools globally
- **Budget limits**: Daily, weekly, and monthly spending caps with auto-pause
- **Sensitive data patterns**: Custom regex patterns for scanning prompts

### Policy Distribution

Policies are part of config bundles and can be distributed alongside settings, templates, and agents. When a user imports a config bundle, the policies are applied to their instance.

For enforced policies (ones that users cannot override), include them in a pre-configured build that locks down the policy settings UI.

---

## Cost Governance

AI usage costs money. ClearPathAI tracks costs and provides governance tools so there are no surprises.

### Cost Tracking

- **Per-turn cost estimation**: Every AI response includes a cost estimate based on token counts and model pricing
- **Session cost rollup**: Total cost per session, visible in session history
- **Daily/weekly/monthly aggregation**: Charts and summaries in the Insights Analytics tab
- **Model-level breakdown**: See which AI models are driving costs

### Budget Controls

| Control | How It Works |
|---------|-------------|
| Daily budget | Set a daily spending cap. Alert at configurable thresholds (e.g., 75%, 90%). Optional auto-pause at limit. |
| Weekly budget | Rolling 7-day spending cap with the same alert and auto-pause options. |
| Monthly budget | Calendar month cap for budgeting alignment. |
| Per-session budget | Cap individual session spending (useful for automated/scheduled tasks). |

### Cost Reports

Export cost data for:
- Finance team budget reconciliation
- Department chargeback calculations
- ROI analysis (cost vs. estimated time savings)
- Trend analysis and forecasting

---

## Team Onboarding

### Built-in Learning Center

ClearPathAI includes a comprehensive Learning Center with role-based learning paths:

| Path | Audience | Lessons | Estimated Time |
|------|----------|---------|----------------|
| **Getting Started** | Everyone (required) | 16 lessons | ~30 minutes |
| **Manager Track** | Team leads, PMs, analysts | 36 lessons | ~2.5 hours |
| **Developer Track** | Engineers, technical roles | 32 lessons | ~2.5 hours |
| **Admin Track** | IT admins, team admins | 19 lessons | ~1.5 hours |
| **Power User Track** | Advanced users | 24 lessons | ~2 hours |

Every lesson includes:
- **Walkthroughs**: Step-by-step guides through the app UI with plain-language explanations
- **Guided Tasks**: Real tasks with instructions, success criteria, and celebration of completion
- **Knowledge Checks**: Interactive quizzes with immediate feedback and explanations

Content is written for non-technical users — no jargon, business analogies throughout, focused on outcomes rather than implementation details.

### Progress Tracking

- Per-user lesson completion tracking with streak counting
- Achievement system for milestones (13 achievements)
- Dashboard widget showing team learning progress
- Sidebar progress indicator for individual awareness

### Recommended Onboarding Flow

1. **Day 1**: Install app → Import config bundle → Complete Getting Started path (~30 min)
2. **Week 1**: Complete role-specific path (Manager, Developer, or Admin)
3. **Week 2**: First real work task using templates and guided workflows
4. **Ongoing**: Power User track for those who want to go deeper

---

## Integration Points

### Built-in Integrations

ClearPathAI supports connecting to external project management and development tools:

| Platform | Capabilities |
|----------|-------------|
| **GitHub** | Issues, pull requests, repository data — reference directly in AI sessions |
| **Jira** | Tickets, sprints, project data — pull into sessions for context |
| **Confluence** | Documentation — provide as context to AI |
| **ServiceNow** | Incidents, requests — workflow automation |

### MCP Server Extensions

For custom integrations, ClearPathAI supports MCP (Model Context Protocol) servers:
- Connect to internal databases, APIs, or services
- Provide custom tools to the AI
- The same permission system governs MCP tools
- Configure per-session or globally

### Webhook Notifications

Send notifications to external systems:
- Slack webhook integration
- Generic JSON webhook (works with any endpoint)
- Configurable per notification type

---

## Local AI Models (Air-Gapped)

For environments where no data can leave the network, ClearPathAI supports local AI models via:

### Ollama

- Run open-source models (Llama, CodeLlama, Mistral, etc.) on local hardware
- ClearPathAI auto-detects running Ollama instances
- Full session, template, and workflow support — same UI, local processing

### LM Studio

- Alternative local model runner with a GUI for model management
- Same HTTP API interface as Ollama
- ClearPathAI treats it identically

### Air-Gap Deployment

1. Install ClearPathAI and Ollama on the target machine (offline installer)
2. Transfer model files via secure media
3. Load models into Ollama
4. Configure ClearPathAI to use local models
5. All AI processing happens on-premises — zero external network calls

**Trade-offs**: Local models are less capable than cloud models (GPT-5, Claude Opus) but provide complete data isolation. Best for: classified environments, ITAR-controlled data, healthcare PHI in strict environments, financial data in zero-trust architectures.

---

## Customization & Branding

### Rebranding for Your Organization

ClearPathAI is MIT licensed — you can rebrand it completely for internal distribution.

**What to customize:**

| Element | Location | How |
|---------|----------|-----|
| App name | `electron-builder.yml`, `package.json` | Change the `productName` field |
| Logo & icons | `src/renderer/src/assets/brand/` | Replace SVG files |
| Colors | `tailwind.config.js`, brand color constants | Update hex values |
| Default policies | `src/main/ipc/policyHandlers.ts` | Modify preset definitions |
| Default templates | `src/main/ipc/templateHandlers.ts` | Add/modify built-in templates |
| Learning content | `src/main/ipc/learnHandlers.ts` | Customize lesson text for your org |
| App window title | `src/main/index.ts` | Set `title` in BrowserWindow options |

### Custom Templates for Your Organization

Build templates that encode your team's best practices:
- Standardized code review checklists
- Sprint planning workflows
- Compliance check procedures
- Incident response automation
- Documentation generation in your format

Templates use `{{variable}}` syntax for fill-in-the-blank customization and can be distributed via config bundles.

### Custom Agents for Your Organization

Define AI agents that understand your:
- Coding standards and conventions
- Architecture patterns
- Review criteria
- Documentation style
- Testing requirements

Agents are markdown files (`.agent.md`) that can be included in your repo or distributed via config bundles.

---

## Support & Community

### Open Source

ClearPathAI is fully open source under the MIT license. You can:
- Read every line of code
- Audit the security model yourself
- Fork and customize without restriction
- Contribute back if you choose

### Getting Help

- **GitHub Issues**: [Report bugs and request features](../../issues)
- **Discussions**: [Ask questions and share approaches](../../discussions)
- **Source Code**: Everything is in this repository — no hidden components

### Contributing

Enterprise users who contribute improvements (especially around security, compliance, and policy) help the entire community. See the Contributing section in the README for guidelines.

---

## Getting Started Checklist

Here's the fastest path from "evaluating" to "team is using it":

- [ ] **Evaluate** (30 min)
  - [ ] Clone the repo and run `npm install && npm run dev`
  - [ ] Walk through the Getting Started learning path
  - [ ] Review the source code for security concerns relevant to your org

- [ ] **Prepare** (1-2 hours)
  - [ ] Install CLI tools (Copilot CLI, Claude Code CLI) on a test machine
  - [ ] Configure policies appropriate for your environment
  - [ ] Set up file protection patterns for sensitive data
  - [ ] Create initial templates for your team's common workflows
  - [ ] Export a config bundle with your standard settings

- [ ] **Pilot** (1 week)
  - [ ] Deploy to 3-5 pilot users across different roles
  - [ ] Have them complete the Getting Started learning path
  - [ ] Collect feedback on policies (too restrictive? too loose?)
  - [ ] Review audit logs for unexpected patterns
  - [ ] Measure initial cost and usage

- [ ] **Deploy** (1-2 weeks)
  - [ ] Package for your software distribution system
  - [ ] Distribute the refined config bundle
  - [ ] Schedule onboarding sessions for each team
  - [ ] Set up budget limits and alerts
  - [ ] Assign learning paths based on roles

- [ ] **Optimize** (ongoing)
  - [ ] Review analytics weekly for adoption trends
  - [ ] Refine templates based on what teams use most
  - [ ] Adjust policies based on audit findings
  - [ ] Build custom agents for team-specific needs
  - [ ] Track ROI for leadership reporting

---

## FAQ for Enterprise Decision-Makers

**Q: Does ClearPathAI send our data to any third party?**
A: No. ClearPathAI is a desktop app that runs entirely on the user's machine. The only external communication is between the CLI tools (Copilot, Claude) and their respective AI providers — the same communication that happens when using those CLIs directly. ClearPathAI adds no additional data transmission.

**Q: Do we need a server or cloud infrastructure?**
A: No. ClearPathAI is serverless by design. Each instance is self-contained. Team sharing works through config bundle files (export/import), not through a central server.

**Q: How does this affect our existing Copilot/AI agreements?**
A: It doesn't. ClearPathAI uses the same CLI tools, the same authentication, and the same API endpoints. It's a GUI layer, not a new AI provider. Your existing data processing agreements remain unchanged.

**Q: Can we lock down what users can do?**
A: Yes. Policies control permission modes, file access, tool availability, and budget limits. For maximum lockdown, distribute a pre-configured build with the policy settings UI restricted.

**Q: What if we need features that don't exist yet?**
A: Fork it. The codebase is well-structured TypeScript with clear patterns for adding new features. Common enterprise additions: SAML/OIDC integration, centralized logging, custom MCP servers for internal APIs.

**Q: Is there a commercial support option?**
A: Not currently. ClearPathAI is a community open-source project. Enterprise support is provided through GitHub Issues and Discussions.

**Q: How do we evaluate the security of the codebase?**
A: Read the source. It's all TypeScript, the dependency list is small (check `package.json`), and the architecture is intentionally simple — Electron app, IPC bridge, child processes. No server components, no hidden services, no compiled blobs.

**Q: Can we use this without internet?**
A: Yes, with local models via Ollama or LM Studio. See the [Air-Gapped Deployment](#local-ai-models-air-gapped) section.

**Q: What's the long-term viability of this project?**
A: It's MIT licensed. Even if the project were abandoned tomorrow, you have the full source code and the right to maintain your own fork indefinitely. That's the point of open source — no vendor lock-in, no dependency on a company's roadmap.

---

*ClearPathAI is open source software provided under the MIT license. It is not affiliated with GitHub, Anthropic, or any AI provider. Enterprise users are responsible for their own compliance, security, and data governance decisions.*
