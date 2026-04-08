# Scheduler — Cron-based scheduled task execution

## Purpose
Manages scheduled jobs that spawn sub-agents on a cron schedule. Each job runs a prompt through the CLI (Copilot or Claude) at defined intervals with configurable budget and turn limits. Tracks execution history, detects missed runs, and notifies on completion/failure.

## Files
| File | Description | Key Exports / Functions |
|------|-------------|------------------------|
| SchedulerService.ts | Cron task registration, job execution, history tracking, CRUD | `SchedulerService` class; `start()`, `stop()`, `executeJob()`, `listJobs()`, `getJob()`, `saveJob()`, `deleteJob()`, `toggleJob()`, `duplicateJob()`, `getTemplates()` |

## Architecture Notes

### Core Types
- **ScheduledJob**: Job definition with cron expression, prompt, model, CLI, budget/turn limits, flags, enabled state
  - `id`, `name`, `description`, `prompt`, `cronExpression`, `cli`, `model?`, `permissionMode?`, `workingDirectory?`
  - `flags`, `enabled`, `maxBudget?`, `maxTurns?`, `createdAt`, `lastRunAt?`, `executions[]`
- **JobExecution**: Single execution record
  - `id`, `startedAt`, `endedAt?`, `duration?`, `exitCode?`, `output`, `status`, `estimatedCost?`
  - Status: `'running' | 'success' | 'failed' | 'rate-limited' | 'timeout' | 'missed'`

### Cron Integration
- Uses `node-cron` to register validated cron expressions
- One task per job ID in `tasks` Map
- Jobs must have valid cron syntax (validated via `cron.validate()`)

### Job Execution Flow
1. `registerCronTask(job)` schedules callback via `cron.schedule()`
2. When triggered, calls `executeJob(jobId)`
3. Spawns sub-agent via `cliManager.spawnSubAgent()` with job's prompt/config
4. Polls status every 2 seconds up to 10 minutes
5. Collects output via `cliManager.getSubAgentOutput()`
6. Records execution (status, duration, output up to 50KB) in job's `executions[]` array
7. Emits notification via `notificationManager.emit()` with type `'schedule-result'`

### Missed Run Detection
- On startup, `checkMissedRuns()` estimates intervals and flags jobs that missed runs
- Marks with status `'missed'` and reason "App was closed during scheduled run time"
- Emits notification with navigation action to scheduler UI

### Storage
- Uses `electron-store` with encryption key from `storeEncryption.ts`
- Store name: `clear-path-scheduler`
- Schema: `SchedulerStoreSchema` with `jobs[]`
- Execution history capped at 50 per job

### Built-in Schedule Templates (`SCHEDULE_TEMPLATES`)
- Nightly Test Runner (0 0 * * *)
- Weekly Security Audit (0 9 * * 1)
- Daily Dependency Check (0 8 * * 1-5)
- Friday Documentation Update (0 17 * * 5)
- Hourly Build Verification (0 9-17 * * 1-5)

## Business Context
Powers the Scheduler feature for automated maintenance and monitoring:
- Run tests/builds on a schedule
- Perform security audits
- Check for dependency vulnerabilities
- Update documentation
- Maintain CI/CD-like tasks without external infrastructure

Users set permissionMode to control agent behavior:
- `'plan'`: Agent proposes changes, doesn't execute
- `'acceptEdits'`: Agent can make code changes automatically
- Budget/turn limits prevent runaway costs

## Integration Points
- Depends on `CLIManager` (to spawn sub-agents)
- Depends on `NotificationManager` (to emit schedule-result notifications)
- Rate-limited via `rateLimiter.ts` (max 3 manual executions per minute)
- Uses `getStoreEncryptionKey()` from `../utils/storeEncryption.ts`
- IPC handlers: `scheduler:list-jobs`, `scheduler:save-job`, `scheduler:run-now`, etc.
