# GitHub Labels Reference

All labels used in the greenpioneersolutions/clearpath repository for bug tracking.

## Creating missing labels

```bash
gh label create "ai-discovered"   --repo greenpioneersolutions/clearpath --color "8957e5" --description "Discovered by AI during automated code analysis"
gh label create "severity: high"  --repo greenpioneersolutions/clearpath --color "b60205" --description "High severity — crash, data loss, or security risk"
gh label create "severity: medium"--repo greenpioneersolutions/clearpath --color "e4a853" --description "Medium severity — incorrect behavior or test failure"
gh label create "severity: low"   --repo greenpioneersolutions/clearpath --color "fef2c0" --description "Low severity — code quality, perf, or dead code"
gh label create "security"        --repo greenpioneersolutions/clearpath --color "d93f0b" --description "Security vulnerability or SSRF/injection risk"
```

## Full label table

| Label | Color | Description | Required for |
|-------|-------|-------------|--------------|
| `bug` | `#d73a4a` | Something isn't working | All bug issues |
| `ai-discovered` | `#8957e5` | Found by AI code analysis | All issues from /file-bug |
| `severity: high` | `#b60205` | Crash, data loss, or security risk | Issues with high impact |
| `severity: medium` | `#e4a853` | Incorrect behavior or test failure | Issues with moderate impact |
| `severity: low` | `#fef2c0` | Code quality, perf, dead code | Minor or cosmetic issues |
| `security` | `#d93f0b` | SSRF, injection, auth bypass | Any security concern |
| `enhancement` | `#a2eeef` | New feature or request | Feature requests |
| `documentation` | `#0075ca` | Docs improvements | Doc-only changes |
| `good first issue` | `#7057ff` | Good for newcomers | Welcoming issues |

## Severity decision guide

**High** — any of:
- Component throws on render (React crash)
- Silent data loss (cost/session never persisted)
- Security bypass (SSRF, auth skip, policy bypass)
- Core feature completely broken

**Medium** — any of:
- Wrong value returned affecting app behavior (wrong interval, wrong routing)
- Test infrastructure broken (env var pollution, mocks not applied, 5+ failing tests)
- IPC handler silently saves invalid state
- macOS-specific path resolution failure (ENOENT on Homebrew git)

**Low** — any of:
- Dead code / unused variable (no functional impact)
- `require()` instead of `import` (works at runtime, consistency issue)
- Minor perf anti-pattern (extra disk I/O, unnecessary allocation)
- Off-by-one in estimation-only logic with no billing impact
