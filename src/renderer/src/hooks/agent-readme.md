# Hooks — Reusable React logic

## Purpose
This folder contains custom React hooks that encapsulate reusable logic for accessibility, keyboard interaction, and focus management. These hooks are consumed throughout the app to provide consistent behavior for common UI patterns.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| useFocusTrap.ts | Modal/dialog focus confinement — traps Tab key within container | useFocusTrap() |
| useKeyboardShortcuts.ts | Global keyboard shortcut handling for navigation and help | useKeyboardShortcuts() |

## Architecture Notes

### useFocusTrap
- **Hook signature**: `useFocusTrap(containerRef: RefObject<HTMLElement | null>, isActive: boolean): void`
- **Behavior**: When active, Tab key cycles through focusable elements within container; Shift+Tab cycles backward
- **Focus query**: Uses selector `'a[href], button:not([disabled]), input:not([disabled]), ...'` to find focusable elements
- **Restoration**: On cleanup, restores focus to previously focused element before trap was activated
- **Use case**: Dialog modals, popovers, context menus that should prevent focus escape
- **Dependencies**: `containerRef`, `isActive`

### useKeyboardShortcuts
- **Hook signature**: `useKeyboardShortcuts(onShowHelp: () => void): void`
- **Navigation hook**: Uses `useNavigate()` from react-router-dom
- **Accessibility hook**: Reads `useAccessibility()` settings (keyboardShortcutsEnabled)
- **Shortcuts**:
  - `?` — show keyboard help (when `onShowHelp()` called)
  - `Ctrl/Cmd + ,` — navigate to `/configure`
  - `Ctrl/Cmd + /` — focus message input textarea on Work page
  - `Ctrl/Cmd + 1-5` — navigate to route by index (/, /work, /insights, /pr-scores, /configure)
- **Input detection**: Disabled when focused on input, textarea, select, or contentEditable elements
- **Global listener**: Attaches to `document` keydown event
- **Cleanup**: Removes listener on unmount
- **Dependencies**: `settings.keyboardShortcutsEnabled`, `navigate`, `onShowHelp`

## Business Context
- **useFocusTrap**: Ensures compliance with modal dialog patterns (WCAG 2.1 level AA), prevents accidental clicks outside modals
- **useKeyboardShortcuts**: Powers power-user workflow shortcuts, improves accessibility for users who prefer keyboard navigation
