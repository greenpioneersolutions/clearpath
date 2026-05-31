# Core Developer Agent Memory Index

- [Module-level singleton mocking pattern](feedback_test_mocking_pattern.md) — vi.resetModules + dynamic import required for testing files with module-level singletons like electron-store
- [E2E Testing Infrastructure](project_e2e_setup.md) — Playwright (library-mode `_electron.launch`); multi-config (functional / screenshots / experimental / extensions); fixtures own electronApp + page + consoleErrors
- [Feature flag event bus](project_feature_flag_events.md) — featureFlagEvents EventEmitter in featureFlagHandlers.ts; subscribe to change:<flag> for main-process lifecycle side-effects
- [Shared types between main and renderer](project_shared_types.md) — put dependency-free types in src/shared/**; both tsconfigs use rootDirs to virtually merge it
- [BackendId migration](project_backend_id_migration.md) — 4 backends (copilot-cli/sdk, claude-cli/sdk); providerOf()/transportOf() helpers; SDK adapters feature-gated
- [Token Coach initiative](project_token_coach.md) — 5-phase plan to surface and reduce token waste before June 2026 usage-based billing
- [Middleware pipeline architecture](project_middleware_pipeline.md) — Pre-send pipeline in CLIManager.runTurn; normalize → lint → measure; extension point for phases 3-5
- [path-security tmpdir /var gotcha](project_path_security_tmpdir.md) — isSensitiveSystemPath exempts OS temp dir; macOS tmpdir under /var causes env-dependent test failures
