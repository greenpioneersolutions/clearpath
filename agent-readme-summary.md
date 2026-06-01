# ClearPathAI — agent-readme.md Summary

Table of contents
- Overview
- Tech & Architecture
- Core Features
- IPC & Developer Map
- Persistence & Security
- Developer Guidance
- Where to look


Overview
- Desktop Electron GUI for Copilot & Claude CLIs (v1.13.0). Enables non-technical users to run, manage, and persist CLI agent sessions via a polished UI. Supports multi-agent workflows, sub-agents, scheduling, and optional ClearMemory integration.

Tech & Architecture
- Stack: Electron + React + TypeScript, Tailwind, electron-store, Octokit, Recharts.
- Two-process model: main (singletons, IPC handlers, adapters) + renderer (React SPA). Preload enforces IPC allowlists.
- Adapter pattern for CLI backends (Copilot/Claude/LocalModel). Singleton services (CLIManager, AuthManager, AgentManager).

Core Features
- CLI sessions: spawn, stream output, permission prompts, cost telemetry hooks.
- Agents: discovery, profiles, enable/disable, task delegation (sub-agents).
- Scheduling: cron-based jobs with sub-agent execution.
- Notes & Memory: user notes, attachments, optional ClearMemory (local HTTP + MCP).
- Plugins/integrations: GitHub, Atlassian, and more; extension sandboxing.

IPC & Developer Map
- ~170 invoke channels across domains. Key domains: cli:*, auth:*, agent:*, subagent:*, scheduler:*, notifications:*, settings:*, cost:*, git:*, notes:*, templates:*, skill:*.
- Examples: cli:start-session, cli:send-input, auth:login-start, subagent:spawn, scheduler:run-now.

Persistence & Security
- All stores encrypted via electron-store; store names and size caps listed (sessions, costs, notes, etc.).
- Sensitive paths blocked and OS keychain used for secrets. Path validation utilities provided to prevent traversal.

Developer Guidance
- How-to steps for adding IPC handlers, pages/routes, flags, and session persistence. Shell env init and rate-limiter utilities documented.

Where to look
- Directory map lists main and renderer subsystems and per-folder README links for deeper details.

---
(Generated from agent-readme.md)