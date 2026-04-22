# Example: Adding a New Sidebar Page

## Scenario

A new route `/my-feature` has been added to the React app with a sidebar nav link labeled "My Feature". You need to add a screenshot for it.

## Step 1 — Add to SIDEBAR_PAGES in the crawl spec

Open `e2e/screenshot-crawl.spec.ts` and add an entry to `SIDEBAR_PAGES`:

```typescript
const SIDEBAR_PAGES: SidebarPage[] = [
  { nav: 'Home',       screenshot: 'home--initial' },
  { nav: 'Work',       screenshot: 'work--initial' },
  { nav: 'Insights',   screenshot: 'insights--initial' },
  { nav: 'Learn',      screenshot: 'learn--initial' },
  { nav: 'Configure',  screenshot: 'configure--initial' },
  // Extension routes:
  { nav: 'Backstage',  screenshot: 'ext--backstage',  optional: true },
  // NEW — add here:
  { nav: 'My Feature', screenshot: 'my-feature--initial' },  // ← not optional: it's a core route
]
```

Use `optional: true` only for extension-contributed routes that may not be installed in all environments.

## Step 2 — Capture the baseline

```bash
npm run e2e:screenshots
```

This writes `e2e/screenshots/baseline/my-feature--initial.png`.

## Step 3 — Verify the screenshot

Check the captured PNG to confirm:
- The page rendered (not a blank screen or loading state)
- The sidebar shows "My Feature" highlighted
- No obvious layout regressions

## Step 4 — Update the coverage map

Add a row to [references/coverage-map.md](../references/coverage-map.md) in the "Sidebar Pages" section:

```markdown
| `my-feature--initial.png` | My Feature | `navigateSidebarTo('My Feature')` |
```

## Step 5 — Commit

```bash
git add e2e/screenshots/baseline/my-feature--initial.png
git add e2e/screenshot-crawl.spec.ts
git add .claude/skills/e2e-screenshots/references/coverage-map.md
git commit -m "feat: add my-feature page screenshot baseline"
```

LFS will automatically store the PNG as a pointer in git and the binary in LFS storage.

---

## If the page has async-loaded content

If the page fetches data via IPC on mount and shows a loading state, add `waitForLoadingToSettle()` with a longer timeout. The crawl already calls it after every navigation, but you can increase it for a specific page by temporarily overriding in the test — or just accept that the loading state IS the baseline (as with the Backstage extension page).
