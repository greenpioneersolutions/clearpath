# Core Developer Agent Memory Index

- [Module-level singleton mocking pattern](feedback_test_mocking_pattern.md) — vi.resetModules + dynamic import required for testing files with module-level singletons like electron-store
- [E2E Testing Infrastructure](project_e2e_setup.md) — WebdriverIO v9 + wdio-electron-service v9, key gotchas: no defineConfig, XPath for nav selectors, Configure is outside nav element
- [Feature flag event bus](project_feature_flag_events.md) — featureFlagEvents EventEmitter in featureFlagHandlers.ts; subscribe to change:<flag> for main-process lifecycle side-effects
- [Shared types between main and renderer](project_shared_types.md) — put dependency-free types in src/shared/**; both tsconfigs use rootDirs to virtually merge it
- [BackendId migration](project_backend_id_migration.md) — 4 backends (copilot-cli/sdk, claude-cli/sdk); providerOf()/transportOf() helpers; SDK adapters feature-gated
