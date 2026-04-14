# Changelog

All notable changes to the `@clearpath/extension-sdk` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-12

### Added
- `createExtension()` factory function for bootstrapping renderer entry points
- `useSDK()` React hook for accessing the SDK from any extension component
- `ClearPathProvider` React context provider for SDK access in the component tree
- `createSDKClient()` MessagePort-based client with request correlation and 30s timeout
- Full SDK API surface with 13 namespaces:
  - `github` -- Repository, PR, issue, and search APIs
  - `notifications` -- Emit user-visible notifications with severity levels
  - `storage` -- Encrypted per-extension key-value store with quotas
  - `env` -- Read app-configured environment variables
  - `http` -- Proxied HTTP requests with domain allowlisting
  - `theme` -- App theme access and change subscriptions
  - `sessions` -- Query active AI sessions and message history
  - `cost` -- Token usage, budget tracking, and per-session aggregates
  - `featureFlags` -- Read and write feature flag toggles
  - `localModels` -- Ollama and LM Studio detection and chat
  - `context` -- Token estimation utilities
  - `events` -- Subscribe to host app events (session lifecycle, theme, cost)
  - `navigate` -- Programmatic app navigation
- 17 granular permissions for security model:
  - `storage`, `notifications:emit`, `integration:github:read`, `integration:github:write`
  - `env:read`, `http:fetch`, `navigation`, `compliance:log`
  - `sessions:read`, `sessions:lifecycle`, `cost:read`
  - `feature-flags:read`, `feature-flags:write`
  - `local-models:access`, `context:estimate`, `notes:read`, `skills:read`
- TypeScript types for all APIs (`ExtensionSDK`, `ExtensionManifest`, `ExtensionMainContext`, `ClearPathTheme`, `CreateExtensionOptions`, and all contribution types)
- Manifest schema with contributions system:
  - `navigation` -- Sidebar navigation items with feature gating
  - `panels` -- Render into named host UI slots (`sidebar:status`, `home:widgets`, `session-summary:after-stats`)
  - `widgets` -- Dashboard grid-layout widgets with default sizing
  - `tabs` -- Tabs on existing pages (currently `insights`)
  - `sidebarWidgets` -- Compact sidebar widgets with position control
  - `sessionHooks` -- Session lifecycle event hooks (`session:started`, `session:stopped`, `turn:started`, `turn:ended`)
  - `contextProviders` -- Data sources injectable into AI sessions with parameterized forms
  - `featureFlags` -- Extension-managed feature flag declarations
- MessagePort communication protocol with `ext:request`/`ext:response`/`ext:event` message types
- `ExtensionMainContext` for main-process entries with IPC handler registration, scoped store, and structured logging

## [0.1.0] - 2026-04-10

### Added
- Initial SDK scaffold with TypeScript types
- React context and provider pattern (`SDKContext`, `ClearPathProvider`)
- Extension lifecycle hooks (`activate`, `deactivate`)
- Package configuration with React 18 peer dependencies
