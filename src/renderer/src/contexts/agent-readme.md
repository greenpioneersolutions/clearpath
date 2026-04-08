# Contexts — Global application state providers

## Purpose
This folder contains React Context providers that manage global state for the renderer process. Each context provides a specific concern (accessibility settings, branding/theming, feature flags) with a hook API for consumption throughout the app. Contexts are initialized at the root of the React tree and ensure consistent state across all pages and components.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| AccessibilityContext.tsx | Accessibility settings management and DOM application | AccessibilityContext, useAccessibility(), AccessibilityProvider(), applyToDOM() |
| BrandingContext.tsx | Theming, color scheme, logo, branding configuration and CSS variable injection | BrandingContext, useBranding(), BrandingProvider(), applyCSS(), resolveIsDark() |
| FeatureFlagContext.tsx | Feature flag toggles, presets, and UI visibility control | FeatureFlagContext, useFeatureFlags(), useFlag(), FeatureFlagProvider() |

## Architecture Notes

### AccessibilityContext
- **Hook**: `useAccessibility()` returns `{ settings, updateSetting(), resetAll() }`
- **Settings type**: `AccessibilitySettings` (fontScale, reducedMotion, highContrast, focusStyle, screenReaderMode, keyboardShortcutsEnabled)
- **IPC calls**: `accessibility:get`, `accessibility:set`, `accessibility:reset`
- **DOM integration**: Applies CSS classes (`a11y-reduced-motion`, `a11y-high-contrast`, `a11y-sr-mode`) and inline styles (font scale) to `document.documentElement`
- **Media query sync**: Listens to `prefers-reduced-motion` and `prefers-color-scheme` OS settings and auto-updates context
- **Defaults**: `DEFAULT_ACCESSIBILITY` from `types/accessibility.ts`

### BrandingContext
- **Hook**: `useBranding()` returns `{ brand, isDark, updateBrand(), resetBrand(), applyPreset(), loading }`
- **Brand type**: `BrandingConfig` (24 color properties, borderRadius, colorMode, customLogo)
- **IPC calls**: `branding:get`, `branding:set`, `branding:reset`, `branding:apply-preset`
- **CSS variable injection**: Sets 30+ CSS custom properties (--brand-primary, --brand-page-bg, etc.) for styling
- **Dark mode detection**: `resolveIsDark()` function selects between 'system', 'light', 'dark' modes
- **Presets**: Supports preset application via `applyPreset(presetId)`
- **Defaults**: `DEFAULT` BrandingConfig defined in file (ClearPathAI theme)

### FeatureFlagContext
- **Hook**: `useFeatureFlags()` returns `{ flags, activePresetId, presets, setFlag(), applyPreset(), resetFlags(), loading }`
- **Utility hook**: `useFlag(key)` returns boolean for single flag check
- **Flags type**: `FeatureFlags` (40+ boolean flags for page visibility, experimental features, cost tracking, etc.)
- **IPC calls**: `feature-flags:get`, `feature-flags:set`, `feature-flags:reset`, `feature-flags:apply-preset`, `feature-flags:get-presets`
- **Presets**: Managed presets for grouped flag configurations
- **Defaults**: `ALL_ON` preset with specific flags disabled (showComposer, showSubAgents, showKnowledgeBase, showScheduler, showPlugins, etc.)

### Shared Patterns
1. **Loading state**: All contexts initialize with data from main process via IPC
2. **Provider pattern**: Each context has a `<ContextProvider>` component that wraps app tree
3. **Type exports**: Type definitions are exported from context files for use in pages/components
4. **Error handling**: Contexts gracefully fall back to defaults if main process is unavailable
5. **Persistence**: Changes are persisted to main process electron-store automatically
6. **Performance**: Contexts are consumed selectively via hooks, not via Consumer components

## Business Context
- **Accessibility**: Powers WCAG compliance, supports diverse user needs (vision, hearing, motor, cognitive)
- **Branding**: Enables white-label customization and dark/light mode support for enterprise deployments
- **Feature Flags**: Controls phased rollout, experimental features, and tenant-specific capabilities (PR Scores, Sub-Agents, etc.)
