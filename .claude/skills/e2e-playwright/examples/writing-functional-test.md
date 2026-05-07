# Example: Writing a Functional Test

A complete spec file demonstrating Playwright Test patterns: imports, describe groups, hooks, web-first assertions, IPC, and Electron-specific access.

## Anatomy of a Playwright spec

```ts
// e2e/sessions.spec.ts
import { test, expect } from './fixtures';
import { invokeIPC, navigateSidebarTo, navigateToHash } from './helpers/app';

// ── File-level config (optional) ─────────────────────────────────────────────
test.describe.configure({ mode: 'serial' });          // tests run in order in this file
test.use({ trace: 'retain-on-failure' });             // override config for this file

// ── Top-level describe ───────────────────────────────────────────────────────
test.describe('Sessions page', () => {
  test.beforeAll(async ({ electronApp }) => {
    // One-time setup that needs Electron — clear all stored sessions
    await electronApp.evaluate(({ ipcMain }: any) => {
      // hypothetical reset handler
    });
  });

  test.beforeEach(async ({ page }) => {
    await navigateSidebarTo(page, 'Sessions');
    await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  });

  test('shows empty state when no sessions exist', async ({ page }) => {
    await expect(page.getByText(/no sessions yet/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'New session' })).toBeEnabled();
  });

  test('creates a new session via the launchpad', async ({ page }) => {
    await page.getByRole('button', { name: 'New session' }).click();

    // Form fields
    await page.getByLabel('Session name').fill('Smoke session');
    await page.getByLabel('Agent').selectOption({ label: 'Code Reviewer' });

    // Submit
    await page.getByRole('button', { name: 'Create' }).click();

    // Web-first assertion — auto-retries until the new session appears
    await expect(page.getByRole('row', { name: /Smoke session/ })).toBeVisible();
    await expect(page.getByTestId('toast')).toContainText('Session created');
  });

  test('archives a session', async ({ page, electronApp }) => {
    // Seed a session via IPC (faster than clicking through the UI)
    const sessionId = await invokeIPC<string>(page, 'cli:start-session', {
      name: 'Doomed session',
      agent: 'general-purpose',
    });

    // Reload the list to reflect the IPC change
    await navigateToHash(page, '#/work');
    const row = page.getByRole('row', { name: /Doomed session/ });
    await expect(row).toBeVisible();

    // Open menu, archive
    await row.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Row disappears from the active list
    await expect(row).toBeHidden();

    // ...and is in the archive
    await page.getByRole('tab', { name: 'Archived' }).click();
    await expect(page.getByRole('row', { name: /Doomed session/ })).toBeVisible();

    // Cleanup — direct IPC delete (don't depend on UI for teardown)
    await invokeIPC(page, 'cli:delete-session', sessionId);
  });
});

// ── Second describe — different concerns, isolated state ─────────────────────
test.describe('Sessions advanced settings', () => {
  test.beforeEach(async ({ page }) => {
    await navigateSidebarTo(page, 'Sessions');
    await page.getByRole('button', { name: 'New session' }).click();
  });

  test('skill picker is per-session, not global', async ({ page, electronApp }) => {
    // Pre-condition — global skills list
    const skillsBefore = await invokeIPC<{ id: string; enabled: boolean }[]>(
      page,
      'skills:list',
    );

    await page.getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('checkbox', { name: 'web-search' }).check();

    // Confirm checkbox is checked WITHOUT mutating the global skill registry
    const skillsAfter = await invokeIPC<{ id: string; enabled: boolean }[]>(
      page,
      'skills:list',
    );
    expect(skillsAfter).toEqual(skillsBefore);   // global state unchanged
  });
});

// ── Data-driven tests ────────────────────────────────────────────────────────
const SIDEBAR_LINKS = [
  { label: 'Home',     hash: '/'       },
  { label: 'Sessions', hash: '/work'   },
  { label: 'Notes',    hash: '/notes'  },
  { label: 'Insights', hash: '/insights' },
  { label: 'Settings', hash: '/configure' },
];

test.describe('Sidebar navigation', () => {
  for (const { label, hash } of SIDEBAR_LINKS) {
    test(`navigates to ${label}`, async ({ page }) => {
      await navigateSidebarTo(page, label);
      await expect(page).toHaveURL(new RegExp(`#${hash.replace('/', '\\/')}`));
    });
  }
});
```

## Imports

```ts
import { test, expect } from './fixtures';
```

Always use the project's `fixtures.ts` re-export — it gives you the Electron-aware `page` fixture and any custom POMs/options.

## Test definition

| Pattern | When to use |
|---------|-------------|
| `test('does X', async ({ page }) => {...})` | Plain test |
| `test.skip('does X', ...)` | Don't run, but keep visible |
| `test.fixme('broken — see #1234', ...)` | Known broken; signals intent to fix |
| `test.fail('demonstrates the bug', ...)` | Test must fail; passing fails the suite |
| `test.only('focus this', ...)` | Only run this; CI fails if `forbidOnly` is on |
| `test('long', async ({page}) => { test.slow(); ... })` | Triple the timeout |
| `test('long', async ({page}) => { test.setTimeout(120_000); ... })` | Set explicit timeout |
| `test('a @smoke @login', ...)` | Tag in title |
| `test('a', { tag: ['@smoke'] }, ...)` | Tag in details |
| `test('a', { annotation: { type: 'issue', description: '...' } }, ...)` | Annotation |

## Hooks

```ts
test.beforeAll(async ({ electronApp }) => { /* once per worker */ });
test.afterAll(async ({ electronApp }) => { /* once per worker */ });
test.beforeEach(async ({ page }) => { /* before every test */ });
test.afterEach(async ({ page }, testInfo) => {
  // testInfo.status === 'passed' / 'failed' / 'timedOut' / 'skipped' / 'interrupted'
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({ path: testInfo.outputPath('failure.png') });
  }
});
```

## Web-first assertions (always `await`)

```ts
await expect(page).toHaveTitle(/CoPilot/);
await expect(page).toHaveURL(/#\/work/);
await expect(page.getByRole('heading')).toBeVisible();
await expect(page.getByRole('listitem')).toHaveCount(3);
await expect(page.getByLabel('Email')).toHaveValue('a@b.com');
await expect(page.getByTestId('toast')).toContainText('Saved');
```

Don't wrap a non-locator boolean — that loses retry:
```ts
expect(await loc.isVisible()).toBe(true);    // ❌
await expect(loc).toBeVisible();             // ✅
```

## `test.step` for grouping

```ts
test('full purchase flow', async ({ page }) => {
  await test.step('open new session dialog', async () => {
    await page.getByRole('button', { name: 'New session' }).click();
  });

  await test.step('fill in details', async () => {
    await page.getByLabel('Name').fill('My session');
    await page.getByRole('button', { name: 'Create' }).click();
  });

  await test.step('verify creation', async () => {
    await expect(page.getByRole('row', { name: 'My session' })).toBeVisible();
  });
});
```

Steps appear as collapsible blocks in the HTML report and trace viewer.

## Conditional skip

```ts
test('mac-only feature', async ({ page }) => {
  test.skip(process.platform !== 'darwin', 'macOS only');
  // ...
});
```

## Test scope: file-level

```ts
test.use({ trace: 'on' });           // override config for everyone in this file
test.describe.configure({ retries: 0 }); // no retries in this file
```

## Test scope: describe-level

```ts
test.describe('integration', () => {
  test.use({ actionTimeout: 30_000 });
  test('one', ...);
  test('two', ...);
});
```

## Working with Electron specifics

```ts
test('reads main-process state', async ({ electronApp }) => {
  const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  expect(userDataPath).toMatch(/userData/);

  const winCount = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().length
  );
  expect(winCount).toBe(1);
});

test('handles new window opens', async ({ page, electronApp }) => {
  const [settingsWindow] = await Promise.all([
    electronApp.waitForEvent('window'),
    page.getByRole('button', { name: 'Open external settings' }).click(),
  ]);
  await settingsWindow.waitForLoadState('domcontentloaded');
  await expect(settingsWindow).toHaveTitle(/Settings/);
});
```

## Cleanup

Prefer in-test cleanup for resources you created (especially when `workers > 1` and the next test would see them). For per-worker resources, `afterAll` is fine.

```ts
test('creates and cleans up a session', async ({ page }) => {
  const id = await invokeIPC<string>(page, 'cli:start-session', { name: 'temp' });
  try {
    // ...test the session...
  } finally {
    await invokeIPC(page, 'cli:delete-session', id);
  }
});
```

## Reading testInfo

```ts
test('reads its own context', async ({ page }, testInfo) => {
  console.log(testInfo.title);          // 'reads its own context'
  console.log(testInfo.outputDir);      // test-results/sessions-spec-...
  console.log(testInfo.project.name);   // 'electron'
  console.log(testInfo.workerIndex);    // 1
  console.log(testInfo.retry);          // 0 on first run, 1 on first retry, ...
  
  // Attach an artifact
  await testInfo.attach('debug-state', {
    body: JSON.stringify({ x: 1 }),
    contentType: 'application/json',
  });
});
```

## Common patterns

### Wait for IPC-driven state to settle
```ts
await invokeIPC(page, 'cli:start-session', { name: 'test' });
await expect.poll(async () => (await invokeIPC<unknown[]>(page, 'cli:list-sessions')).length).toBe(1);
```

### Retry a flaky block
```ts
await expect(async () => {
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByTestId('status')).toHaveText('Ready');
}).toPass({ timeout: 30_000 });
```

### Soft-assert multiple checks
```ts
await expect.soft(page.getByTestId('a')).toBeVisible();
await expect.soft(page.getByTestId('b')).toBeVisible();
await expect.soft(page.getByTestId('c')).toBeVisible();
expect(test.info().errors).toHaveLength(0);
```
