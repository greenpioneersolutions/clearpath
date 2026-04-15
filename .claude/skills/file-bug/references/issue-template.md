# GitHub Issue Body Template

Use this template when creating issues via `gh issue create`. Fill in all sections; remove sections that don't apply.

```markdown
## Summary
<1-2 sentences describing what is wrong and where>

## Location
`src/path/to/file.ts` — `functionName()` (line ~N)

## Symptom
<What the user or test observes — error messages, wrong output, wrong return value>

## Root Cause
<Why it happens — the specific code pattern that causes the problem>

```ts
// Problem code (excerpt)
const example = badPattern()
```

## Suggested Fix
<Concrete code change or approach>

```ts
// Fixed code
const example = correctPattern()
```

## Impact
- <Bullet: who/what is affected>
- <Bullet: severity justification>

## Discovered During
AI-assisted unit test coverage initiative, April 2026
```

## Title conventions

Titles should be: `[Location]: short description of the problem`

Examples:
- `NotificationManager: IPv6 loopback bypass in SSRF protection`
- `SchedulerService.estimateIntervalMs: stepped-hour cron patterns misclassified as daily`
- `ProcessOutputViewer: TypeError when subagent:get-output returns null`

Keep titles under 80 characters. Front-load the component/file name so issues are scannable in the issue list.

## Security issues

For any issue with the `security` label, lead the body with a **Security Impact** section before Summary:

```markdown
## Security Impact
> **SSRF vulnerability** — an attacker who can configure webhook URLs can reach internal services via IPv6 addresses that bypass the existing blocklist.
```
