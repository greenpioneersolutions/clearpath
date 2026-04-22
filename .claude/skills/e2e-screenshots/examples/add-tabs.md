# Example: Adding New Tabs to an Existing Page

## Which data table to edit?

| Page | Data table | Navigation method |
|---|---|---|
| Work mode tabs | `WORK_TABS` | Hash: `#/work?tab={key}` |
| Work context panels | `WORK_PANELS` | Hash: `#/work?panel={key}` |
| Insights tabs | `INSIGHTS_TABS` | XPath button by visible label text |
| Configure tabs | `CONFIGURE_TABS` | DOM id: `#tab-{key}` |

---

## Work: new mode tab

A new `?tab=fleet` route has been added to the Work page.

```typescript
const WORK_TABS: WorkTab[] = [
  { key: 'session',  screenshot: 'work--tab-session' },
  { key: 'compose',  screenshot: 'work--tab-compose' },
  { key: 'schedule', screenshot: 'work--tab-schedule' },
  { key: 'memory',   screenshot: 'work--tab-memory' },
  { key: 'fleet',    screenshot: 'work--tab-fleet' },   // ← add here
]
```

The spec navigates via `window.location.hash = '#/work?tab=fleet'` — no selector needed.

---

## Work: new context panel

A new `?panel=git` panel has been added.

```typescript
const WORK_PANELS: WorkPanel[] = [
  { key: 'agents',    screenshot: 'work--panel-agents' },
  { key: 'tools',     screenshot: 'work--panel-tools' },
  { key: 'templates', screenshot: 'work--panel-templates' },
  { key: 'skills',    screenshot: 'work--panel-skills' },
  { key: 'subagents', screenshot: 'work--panel-subagents' },
  { key: 'git',       screenshot: 'work--panel-git' },   // ← add here
]
```

---

## Insights: new tab (extension-contributed)

An extension contributes a new "Security" tab to the Insights page.

```typescript
const INSIGHTS_TABS: InsightsTab[] = [
  { label: 'Analytics',        screenshot: 'insights--tab-analytics' },
  { label: 'Compliance',       screenshot: 'insights--tab-compliance' },
  { label: 'Usage',            screenshot: 'insights--tab-usage' },
  { label: 'Catalog Insights', screenshot: 'insights--tab-catalog-insights' },
  { label: 'Efficiency',       screenshot: 'insights--tab-efficiency' },
  { label: 'PR Health',        screenshot: 'insights--tab-pr-health' },
  { label: 'Security',         screenshot: 'insights--tab-security' },   // ← add here
]
```

The `label` must match the **visible button text** exactly. The selector used is:
```typescript
$(`//button[contains(., '${tab.label}')]`)
```

Existence is checked before clicking — if the tab button isn't found the test skips with a log message (safe for optional/extension tabs).

---

## Configure: new tab

A new `#tab-audit` tab has been added to the Configure page.

```typescript
const CONFIGURE_TABS: ConfigureTab[] = [
  // ... existing 14 tabs ...
  { key: 'audit', label: 'Audit Log', screenshot: 'configure--tab-audit' },  // ← add here
]
```

The `key` must match the DOM id `#tab-{key}` on the tab button element. If unsure, inspect the DOM or check `src/renderer/src/pages/Configure.tsx`.

**Do not** use `navigateToConfigureTab()` inside the Configure tab loop — it re-navigates to the page and causes loading flashes. The loop already has a `before()` that navigates to Configure once, then the loop clicks tabs directly.

---

## After adding

1. Run `npm run e2e:screenshots` to capture the new baseline PNG(s)
2. Visually inspect the output in `e2e/screenshots/baseline/`
3. Update [references/coverage-map.md](../references/coverage-map.md) with the new row(s)
4. Commit: `git add e2e/screenshots/baseline/ e2e/screenshot-crawl.spec.ts && git commit -m "feat: add {name} screenshot"`
