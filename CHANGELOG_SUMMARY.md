ClearPathAI — Recent state summary (from CHANGELOG.md)

Overview

ClearPathAI is an Electron + React TypeScript desktop app that provides a GUI around CLI-based LMs (Copilot, Claude, and local models). Recent releases (1.10.0 → 1.14.0, Apr–May 2026) focus on usability for non-technical users, enterprise readiness, feature gating, token-efficiency tooling, and a robust extension/integration surface.

Key themes

- UX & Onboarding: Major launchpad and Home redesigns to simplify starting and resuming work, attachment chip toolbar for contextual attachments (agents, skills, notes, files), Home quick-start and starter packs to orient non-developers, Setup Wizard and Learning Center feature-discovery flows that can auto-unlock feature flags.

- Context & Productivity: Notes (top-level), Memory/Notes management, Starter Pack agents/skills, improved session wizard, context pre-selection, and attachments and session file staging — all designed to keep the model grounded in user-provided context.

- Token Coach & Efficiency: New middleware pipeline, tokenization and pricing services, live context meter, preflight cost warnings, model routing experiments and flags (showTokenMeter, showPromptCache, showModelRouting, showEfficiencyInsights).

- Integrations & Extensions: Full Extension SDK, dynamic extension IPC, extension sidecars, PR Scores extension, Comprehensive MCP server management (model-context protocol), ClearMemory optional integration (local memory engine), and many enterprise integrations (GitHub, Jira, ServiceNow, Datadog, PowerBI, etc.).

- Security & Reliability: Strong hardening — OS keychain storage, CSP, IPC whitelist, path-traversal and SSRF protections, sanitized markdown, audit logging, and dependency CVE fixes. Corporate proxy compatibility added via Electron net.fetch.

- Testing and CI: E2E suites moved to Playwright, screenshot harness, CI workflows, and many unit/e2e tests across extensions and features.

- Feature flags & delivery: Centralized feature-flag system driving build-time tree-shaking; many features default to off and are unlocked via learning tracks or flags to control complexity for new users.

Current posture

ClearPathAI is mature, enterprise-focused, and evolving from proof-of-concept to production readiness: strong security posture, scalable integration patterns, an emphasis on token/cost-awareness, and an improved non-technical UX. Several experimental routing/efficiency features are gated behind flags; much functionality is opt-in to avoid overwhelming new users.

Saved file: CHANGELOG_SUMMARY.md
