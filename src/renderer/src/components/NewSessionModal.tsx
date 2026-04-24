/**
 * Back-compat re-export. The real component lives in `SessionSettingsModal.tsx`
 * — it's a dual-mode modal that handles both "new session" (create) and
 * "edit session" (mid-session) flows. This file exists so older call sites
 * keep compiling; new code should import from `./SessionSettingsModal` directly.
 */
export { default } from './SessionSettingsModal'
