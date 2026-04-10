# CLI & Test Filtering

Complete reference for Vitest CLI commands, flags, and test filtering mechanisms.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `vitest` | Start in watch mode (dev) or run mode (CI) |
| `vitest run` | Single run without watch |
| `vitest watch` | Watch mode (same as `vitest` without args) |
| `vitest dev` | Alias for `vitest watch` |
| `vitest bench` | Run benchmark tests only |
| `vitest related <files>` | Run tests covering specific source files |
| `vitest list` | Print list of matching tests (no execution) |
| `vitest init <name>` | Setup project config (e.g., `vitest init browser`) |
| `vitest complete <shell>` | Enable shell autocompletions |

---

## Key CLI Flags

### Config & Root

| Flag | Description |
|------|-------------|
| `--root, -r <path>` | Project root path |
| `--config, -c <path>` | Path to config file |
| `--mode <name>` | Override Vite mode |

### Test Filtering

| Flag | Description |
|------|-------------|
| `--testNamePattern, -t <pattern>` | Filter by test name (regex) |
| `--dir <path>` | Base directory to scan for tests |
| `--project <name>` | Run specific project(s) |
| `--changed [commit/branch]` | Run tests for changed files only |
| `--shard <index>/<count>` | Execute specific test shard |
| `--tagsFilter <expr>` | Run tests matching tag expression |
| `--strictTags` | Error if test uses undefined tag |
| `--listTags [type]` | List available tags |

### Execution Control

| Flag | Description |
|------|-------------|
| `--watch, -w` | Enable watch mode |
| `--run` | Disable watch mode |
| `--bail <n>` | Stop after `n` test failures |
| `--retry.count <n>` | Retry failed tests `n` times |
| `--retry.delay <ms>` | Delay between retries |
| `--passWithNoTests` | Pass when no tests found |
| `--allowOnly` | Allow `.only` tests |
| `--sequence.concurrent` | Run all tests concurrently |
| `--sequence.shuffle.files` | Randomize file order |
| `--sequence.shuffle.tests` | Randomize test order |

### Timeouts

| Flag | Default | Description |
|------|---------|-------------|
| `--testTimeout <ms>` | `5000` | Default test timeout |
| `--hookTimeout <ms>` | `10000` | Default hook timeout |
| `--teardownTimeout <ms>` | — | Teardown function timeout |

### Reporters & Output

| Flag | Description |
|------|-------------|
| `--reporter <name>` | Set reporter(s): `default`, `verbose`, `dot`, `json`, `junit`, `html`, `tap`, `tree`, `github-actions` |
| `--outputFile <path>` | Write results to file |
| `--silent [value]` | Suppress console output (`'passed-only'` for failing only) |
| `--hideSkippedTests` | Hide skipped test logs |
| `--no-color` | Remove colors from output |

### Performance & Pools

| Flag | Description |
|------|-------------|
| `--pool <pool>` | Pool type: `forks` (default), `threads`, `vmForks`, `vmThreads` |
| `--maxWorkers <n>` | Maximum worker count |
| `--fileParallelism` | Run test files in parallel |
| `--maxConcurrency <n>` | Max concurrent tests in a file |

### Snapshots

| Flag | Description |
|------|-------------|
| `--update, -u [type]` | Update snapshots: `boolean`, `'new'`, `'all'`, `'none'` |
| `--expandSnapshotDiff` | Show full snapshot diffs |

### Debugging

| Flag | Description |
|------|-------------|
| `--inspect [[host:]port]` | Enable Node.js inspector |
| `--inspectBrk [[host:]port]` | Enable inspector + break before tests |
| `--ui` | Open Vitest UI |
| `--open` | Auto-open UI |
| `--logHeapUsage` | Show heap size per test |
| `--clearCache` | Delete all Vitest caches |

### Environment

| Flag | Description |
|------|-------------|
| `--environment <name>` | Test environment: `node`, `jsdom`, `happy-dom`, `edge-runtime` |
| `--globals` | Inject test APIs globally |
| `--dom` | Mock browser API with happy-dom |

---

## Filtering by Filename

Pass filename patterns as positional arguments:

```bash
vitest basic              # files containing "basic"
vitest src/utils          # files under src/utils/
vitest basic-foo.test.ts  # specific file
```

## Filtering by Test Name

Use `-t` to match test/describe names by regex:

```bash
vitest -t "should parse"       # tests with "should parse" in name
vitest -t "Math.*addition"     # regex pattern
```

## Filtering by File + Line Number

Since Vitest 3, target specific tests by line:

```bash
vitest basic/foo.test.ts:10              # test at line 10
vitest basic/foo.test.ts:10,basic/foo.test.ts:25  # multiple lines
vitest ./src/utils.test.ts:42            # relative path
```

Requires the full filename (relative or absolute). Short names like `vitest foo:10` won't work.

## Using .only, .skip, .todo

```ts
test.only('run this one', () => { ... })    // only this test runs
test.skip('not yet', () => { ... })         // skipped
test.todo('implement later')                // placeholder, no body

describe.only('focused suite', () => { ... })
describe.skip('skipped suite', () => { ... })
```

## Conditional Filtering

```ts
test.skipIf(process.env.CI)('local only', () => { ... })
test.runIf(process.env.CI)('CI only', () => { ... })
```

## Tag-Based Filtering

```ts
test('renders a form', { tags: ['frontend'] }, () => { ... })
test('calls API', { tags: ['backend', 'integration'] }, () => { ... })
```

```bash
vitest --tagsFilter=frontend              # run frontend tests
vitest --tagsFilter="frontend|backend"    # logical OR
vitest --tagsFilter="frontend&slow"       # logical AND (if supported)
```

## Watch Mode Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `a` | Rerun all tests |
| `f` | Rerun failed tests only |
| `u` | Update failing snapshots |
| `p` | Filter by filename pattern |
| `t` | Filter by test name pattern |
| `q` | Quit |

---

## Common CLI Recipes

```bash
# Run tests matching pattern, verbose output
vitest run -t "login" --reporter=verbose

# Run with coverage, fail if below threshold
vitest run --coverage --coverage.thresholds.lines=80

# Run in CI with JSON output
vitest run --reporter=json --outputFile=results.json

# Shard across 3 CI machines
vitest run --shard=1/3 --reporter=blob
vitest run --shard=2/3 --reporter=blob
vitest run --shard=3/3 --reporter=blob
vitest --merge-reports
```

<!-- References:
- https://vitest.dev/guide/cli
- https://vitest.dev/guide/filtering
- https://vitest.dev/guide/test-tags
-->
