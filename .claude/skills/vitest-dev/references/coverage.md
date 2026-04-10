# Coverage

Complete reference for code coverage collection, providers, reporters, and threshold enforcement.

---

## Coverage Providers

| Provider | Package | How It Works | Best For |
|----------|---------|-------------|----------|
| **V8** (default) | `@vitest/coverage-v8` | Uses V8 engine's native `node:inspector` | Speed, low memory, Node.js environments |
| **Istanbul** | `@vitest/coverage-istanbul` | Pre-instruments source via Babel | Cross-runtime, battle-tested accuracy |

```bash
npm install -D @vitest/coverage-v8      # recommended
# or
npm install -D @vitest/coverage-istanbul
```

---

## Configuration

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',           // or 'istanbul'
      enabled: false,           // set true to always collect
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/__mocks__/**'],
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: './coverage',
      all: true,                // include files with no tests
    },
  },
})
```

### Key Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | `string` | `'v8'` | Coverage provider |
| `enabled` | `boolean` | `false` | Collect coverage on every run |
| `include` | `string[]` | `['**']` | Files to include (glob patterns) |
| `exclude` | `string[]` | — | Files to exclude |
| `all` | `boolean` | `true` | Show files with no test coverage |
| `reporter` | `string[]` | `['text', 'html', 'clover', 'json']` | Output formats |
| `reportsDirectory` | `string` | `'./coverage'` | Output directory |
| `clean` | `boolean` | `true` | Clean output before each run |
| `skipFull` | `boolean` | `false` | Skip fully covered files in text output |

---

## Running Coverage

```bash
# Via CLI flag
vitest run --coverage

# Or add to package.json
{
  "scripts": {
    "test:coverage": "vitest run --coverage"
  }
}
```

Set `enabled: true` in config to collect coverage on every `vitest run` without the flag.

---

## Coverage Reporters

| Reporter | Output | Use Case |
|----------|--------|----------|
| `text` | Terminal table | Quick local check |
| `text-summary` | Summary line | CI logs |
| `html` | Interactive HTML | Detailed local browsing |
| `html-spa` | Single-page HTML app | Vitest UI integration |
| `lcov` | `lcov.info` file | CI tools (Codecov, Coveralls) |
| `json` | JSON file | Programmatic analysis |
| `json-summary` | Summary JSON | Badges, dashboards |
| `clover` | XML file | Jenkins, CI tools |
| `cobertura` | XML file | Azure DevOps, GitLab |

### Multiple Reporters

```ts
coverage: {
  reporter: [
    'text',                           // terminal output
    ['html', { subdir: 'html' }],     // HTML with custom subdir
    ['lcov', { projectRoot: '.' }],   // lcov for CI
    'json-summary',                    // summary for badges
  ],
}
```

### Output to Files

```ts
coverage: {
  reporter: ['json', 'text'],
  reportOnFailure: true,  // generate report even if tests fail
}
```

---

## Thresholds

Enforce minimum coverage — CI fails if thresholds aren't met:

```ts
coverage: {
  thresholds: {
    statements: 80,
    branches: 80,
    functions: 80,
    lines: 80,
  },
}
```

### Per-File Thresholds

```ts
coverage: {
  thresholds: {
    'src/utils/**': {
      statements: 90,
      branches: 90,
    },
    'src/api/**': {
      statements: 70,
    },
  },
}
```

### Auto-Update Thresholds

```ts
coverage: {
  thresholds: {
    autoUpdate: true,  // update config to match current coverage
    statements: 80,
  },
}
```

---

## Ignoring Code

### V8 Provider

```ts
/* v8 ignore next -- @preserve */
const ignored = unreachableCode()

/* v8 ignore start -- @preserve */
function ignoredFunction() {
  // entire block ignored
}
/* v8 ignore end -- @preserve */

/* v8 ignore file -- @preserve */
// entire file ignored from coverage
```

### Istanbul Provider

```ts
/* istanbul ignore next -- @preserve */
const ignored = unreachableCode()

/* istanbul ignore if -- @preserve */
if (debugMode) {
  console.log('debug')
}
```

**Note:** When using TypeScript with esbuild, include `@preserve` to prevent comment stripping.

---

## Vitest UI Integration

Coverage reports integrate with `vitest --ui`:

```ts
coverage: {
  reporter: ['html'],  // or 'html-spa'
  // HTML report viewable in Vitest UI
}
```

---

## Test Reporters (Non-Coverage)

Configure how test results are displayed:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    reporters: ['default'],  // or array of reporters
  },
})
```

### Built-in Reporters

| Reporter | Description |
|----------|-------------|
| `default` | Hierarchical results with diffs |
| `verbose` | Same as default but shows every test |
| `dot` | Minimal — one dot per test |
| `json` | JSON output for programmatic use |
| `junit` | JUnit XML for CI systems |
| `html` | Interactive HTML report |
| `hanging-process` | Shows processes preventing exit |
| `github-actions` | GitHub annotations on failures |
| `blob` | Binary format for merging sharded runs |

### Multiple Reporters + Output Files

```ts
test: {
  reporters: ['default', 'json', 'junit'],
  outputFile: {
    json: './test-results/results.json',
    junit: './test-results/junit.xml',
  },
}
```

<!-- References:
- https://vitest.dev/guide/coverage
- https://vitest.dev/guide/reporters
- https://vitest.dev/config/
-->
