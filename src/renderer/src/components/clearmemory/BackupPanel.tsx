import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BackupFile,
  BackupProgress,
  BackupSchedule,
} from '../../../../shared/clearmemory/types'
import {
  backupCancel,
  backupNow,
  backupPickPath,
  backupScheduleGet,
  backupScheduleSet,
  backupsList,
  importPickPath,
  restoreNow,
  subscribeBackupProgress,
} from '../../lib/clearmemoryClient'
import { toast } from '../../lib/toast'

// ── BackupPanel ──────────────────────────────────────────────────────────────
// Two cards side-by-side:
//   1. Create backup  (pick folder, auto-name, encrypt, run now)
//      + scheduled backup toggle with interval dropdown.
//   2. Restore        (pick .cmb, verify, confirm-with-RESTORE, run)
// Below: list of .cmb files in the configured backup folder.

const DEFAULT_BACKUP_DIR = '~/.clearmemory/backups'

const INTERVALS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1 * 60 * 60 * 1000, label: 'Every 1 hour' },
  { value: 6 * 60 * 60 * 1000, label: 'Every 6 hours' },
  { value: 12 * 60 * 60 * 1000, label: 'Every 12 hours' },
  { value: 24 * 60 * 60 * 1000, label: 'Every 24 hours' },
  { value: 7 * 24 * 60 * 60 * 1000, label: 'Every 7 days' },
]

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString()
  } catch {
    return '—'
  }
}

interface ProgressLog {
  id: string
  status: 'running' | 'done' | 'error'
  percent?: number
  lines: Array<{ kind: BackupProgress['kind']; message: string }>
}

export default function BackupPanel(): JSX.Element {
  // ── Create backup state ───────────────────────────────────────────────────
  const [backupPath, setBackupPath] = useState<string>(DEFAULT_BACKUP_DIR)
  const [autoName, setAutoName] = useState(true)
  const [encrypt, setEncrypt] = useState(true)
  const [backupBusy, setBackupBusy] = useState(false)

  // ── Schedule state ────────────────────────────────────────────────────────
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null)

  // ── Restore state ─────────────────────────────────────────────────────────
  const [restorePath, setRestorePath] = useState<string | null>(null)
  const [restoreStat, setRestoreStat] = useState<BackupFile | null>(null)
  const [verify, setVerify] = useState(true)
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [restoreConfirmText, setRestoreConfirmText] = useState('')
  const [restoreBusy, setRestoreBusy] = useState(false)

  // ── Backup list ───────────────────────────────────────────────────────────
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [listing, setListing] = useState(false)

  // ── Shared progress log ───────────────────────────────────────────────────
  const [progress, setProgress] = useState<ProgressLog | null>(null)
  const progressUnsubRef = useRef<(() => void) | null>(null)

  const refreshList = useCallback(async (path: string) => {
    setListing(true)
    setListError(null)
    const r = await backupsList(path)
    if (!r.ok) {
      setListError(r.error)
      setBackups([])
    } else {
      setBackups(r.data)
    }
    setListing(false)
  }, [])

  // Initial load: schedule + backup list.
  useEffect(() => {
    void (async () => {
      const r = await backupScheduleGet()
      if (r.ok) {
        setSchedule(r.data)
        // If the user previously chose a path, default the folder chooser to it.
        if (r.data.path) setBackupPath(r.data.path)
      }
    })()
  }, [])

  useEffect(() => { void refreshList(backupPath) }, [backupPath, refreshList])

  // Clean up progress subscription on unmount.
  useEffect(() => () => { progressUnsubRef.current?.() }, [])

  const attachProgress = useCallback((id: string) => {
    // Swap out any prior subscription.
    progressUnsubRef.current?.()
    setProgress({ id, status: 'running', lines: [] })
    const off = subscribeBackupProgress(id, (evt) => {
      setProgress((prev) => {
        if (!prev || prev.id !== id) return prev
        const nextLines = prev.lines.concat({ kind: evt.kind, message: evt.message }).slice(-200)
        if (evt.kind === 'done') {
          void refreshList(backupPath)
          return { ...prev, status: 'done', percent: 100, lines: nextLines }
        }
        if (evt.kind === 'error') {
          return { ...prev, status: 'error', lines: nextLines }
        }
        return {
          ...prev,
          percent: evt.percent ?? prev.percent,
          lines: nextLines,
        }
      })
    })
    progressUnsubRef.current = off
  }, [backupPath, refreshList])

  // ── Folder pickers ────────────────────────────────────────────────────────

  const pickBackupFolder = useCallback(async () => {
    const r = await backupPickPath()
    if (!r.ok) {
      if (r.error !== 'Cancelled') toast.error(r.error)
      return
    }
    setBackupPath(r.data.path)
  }, [])

  const pickRestoreFile = useCallback(async () => {
    // Reuse the import file picker — same dialog, same path-safety. We just
    // validate .cmb extension on the return.
    const r = await importPickPath('file')
    if (!r.ok) {
      if (r.error !== 'Cancelled') toast.error(r.error)
      return
    }
    const picked = r.data.path
    if (!picked.toLowerCase().endsWith('.cmb')) {
      toast.error('Please choose a .cmb backup file')
      return
    }
    setRestorePath(picked)
    // Fill in a stat row by finding it in the current list, or create one.
    const match = backups.find((b) => b.path === picked)
    if (match) setRestoreStat(match)
    else setRestoreStat({ name: picked.split('/').pop() ?? 'backup.cmb', path: picked, sizeBytes: 0, modifiedAt: Date.now() })
  }, [backups])

  // ── Actions ───────────────────────────────────────────────────────────────

  const doBackupNow = useCallback(async () => {
    if (!backupPath) {
      toast.error('Choose a backup folder first')
      return
    }
    setBackupBusy(true)
    const r = await backupNow({ path: backupPath, autoName, encrypt })
    setBackupBusy(false)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    attachProgress(r.data.id)
  }, [backupPath, autoName, encrypt, attachProgress])

  const doRestore = useCallback(async () => {
    if (!restorePath) return
    setRestoreBusy(true)
    const r = await restoreNow({ path: restorePath, verify })
    setRestoreBusy(false)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    setRestoreConfirmOpen(false)
    setRestoreConfirmText('')
    attachProgress(r.data.id)
  }, [restorePath, verify, attachProgress])

  const doCancel = useCallback(async () => {
    if (!progress || progress.status !== 'running') return
    await backupCancel(progress.id)
  }, [progress])

  const setRestoreFromList = useCallback((b: BackupFile) => {
    setRestorePath(b.path)
    setRestoreStat(b)
  }, [])

  // ── Schedule handlers ─────────────────────────────────────────────────────

  const toggleSchedule = useCallback(async () => {
    if (!schedule) return
    const enabled = !schedule.enabled
    // When turning on, reuse the current folder chooser path if the stored one is empty.
    const path = enabled && !schedule.path ? backupPath : schedule.path
    const r = await backupScheduleSet({
      enabled,
      path,
      intervalMs: schedule.intervalMs,
      encrypt: schedule.encrypt,
      autoName: schedule.autoName,
    })
    if (!r.ok) { toast.error(r.error); return }
    setSchedule(r.data)
    toast.success(enabled ? 'Scheduled backups enabled' : 'Scheduled backups disabled')
  }, [schedule, backupPath])

  const changeInterval = useCallback(async (ms: number) => {
    if (!schedule) return
    const r = await backupScheduleSet({ ...schedule, intervalMs: ms })
    if (!r.ok) { toast.error(r.error); return }
    setSchedule(r.data)
  }, [schedule])

  const changeSchedulePath = useCallback(async () => {
    if (!schedule) return
    const r = await backupPickPath()
    if (!r.ok) {
      if (r.error !== 'Cancelled') toast.error(r.error)
      return
    }
    const updated = await backupScheduleSet({ ...schedule, path: r.data.path })
    if (updated.ok) setSchedule(updated.data)
  }, [schedule])

  const restoreConfirmValid = useMemo(
    () => restoreConfirmText.trim() === 'RESTORE',
    [restoreConfirmText],
  )

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Snapshot the Clear Memory store to a portable .cmb bundle, or restore from one.
        Scheduled backups are managed locally — they run whether or not the daemon was
        launched with <code className="text-gray-300">--scheduled</code>.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Create backup ──────────────────────────────────────────────── */}
        <section className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Create backup</h3>
            <p className="text-xs text-gray-500 mt-0.5">Snapshot the live store into a .cmb bundle.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Backup folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={backupPath}
                onChange={(e) => setBackupPath(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
              />
              <button
                onClick={() => { void pickBackupFolder() }}
                className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-sm"
              >
                Choose…
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <Checkbox
              checked={autoName}
              onChange={setAutoName}
              label="Auto-name file with timestamp"
            />
            <Checkbox
              checked={encrypt}
              onChange={setEncrypt}
              label="Encrypt backup"
            />
          </div>

          <button
            onClick={() => { void doBackupNow() }}
            disabled={backupBusy || !backupPath}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {backupBusy ? 'Starting…' : 'Create backup now'}
          </button>

          {/* ── Scheduled backups ─────────────────────────────────────── */}
          <div className="pt-4 border-t border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium text-white">Scheduled backups</h4>
                <p className="text-xs text-gray-500 mt-0.5">Runs even when the app is in the background.</p>
              </div>
              <button
                onClick={() => { void toggleSchedule() }}
                disabled={!schedule}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                  schedule?.enabled ? 'bg-indigo-600' : 'bg-gray-600'
                }`}
                role="switch"
                aria-checked={!!schedule?.enabled}
                aria-label="Toggle scheduled backups"
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    schedule?.enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {schedule && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400 w-20">Interval</label>
                  <select
                    value={schedule.intervalMs}
                    onChange={(e) => { void changeInterval(Number(e.target.value)) }}
                    disabled={!schedule.enabled}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 disabled:opacity-50"
                  >
                    {INTERVALS.map((i) => (
                      <option key={i.value} value={i.value}>{i.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-gray-400 w-20">Folder</label>
                  <input
                    type="text"
                    value={schedule.path || '(none)'}
                    readOnly
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 font-mono"
                  />
                  <button
                    onClick={() => { void changeSchedulePath() }}
                    disabled={!schedule.enabled}
                    className="px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-gray-200 text-xs"
                  >
                    Change…
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Restore ────────────────────────────────────────────────────── */}
        <section className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Restore from backup</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Overwrites current memories. The daemon restarts automatically when done.
            </p>
          </div>

          <button
            onClick={() => { void pickRestoreFile() }}
            className="px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-sm"
          >
            Pick .cmb file…
          </button>

          {restoreStat && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
              <div className="text-sm text-gray-200 font-medium truncate" title={restoreStat.path}>
                {restoreStat.name}
              </div>
              <div className="text-[11px] text-gray-500 mt-1 flex gap-3">
                <span>{formatBytes(restoreStat.sizeBytes)}</span>
                <span>{formatDate(restoreStat.modifiedAt)}</span>
              </div>
              <div className="mt-3">
                <Checkbox
                  checked={verify}
                  onChange={setVerify}
                  label="Verify integrity first"
                />
              </div>
              <button
                onClick={() => setRestoreConfirmOpen(true)}
                disabled={!restorePath || restoreBusy}
                className="mt-4 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium transition-colors"
              >
                Restore
              </button>
            </div>
          )}
        </section>
      </div>

      {/* ── Progress log ───────────────────────────────────────────────── */}
      {progress && (
        <section className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                progress.status === 'done' ? 'bg-teal-400'
                  : progress.status === 'error' ? 'bg-red-500'
                  : 'bg-amber-400 animate-pulse'
              }`} />
              <h3 className="text-sm font-semibold text-white">
                {progress.status === 'running' ? 'In progress'
                  : progress.status === 'done' ? 'Complete'
                  : 'Failed'}
              </h3>
            </div>
            {progress.status === 'running' && (
              <button
                onClick={() => { void doCancel() }}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200"
              >
                Cancel
              </button>
            )}
          </div>
          {typeof progress.percent === 'number' && (
            <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
              />
            </div>
          )}
          <pre className="text-[11px] bg-black/40 border border-gray-700/50 rounded p-2 text-gray-200 font-mono max-h-48 overflow-auto">
            {progress.lines.map((l, i) => (
              <div key={i} className={
                l.kind === 'error' ? 'text-red-300' :
                l.kind === 'done' ? 'text-teal-300' :
                'text-gray-300'
              }>{l.message}</div>
            ))}
          </pre>
        </section>
      )}

      {/* ── Existing backups ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Existing backups in {backupPath}
          </div>
          <button
            onClick={() => { void refreshList(backupPath) }}
            className="text-xs px-2.5 py-1 rounded-md bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700"
          >
            Refresh
          </button>
        </div>
        {listError && (
          <div className="bg-red-900/30 border border-red-700/60 rounded-lg p-3 text-xs text-red-200 mb-2">
            {listError}
          </div>
        )}
        {listing ? (
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-500">
            Loading…
          </div>
        ) : backups.length === 0 ? (
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-500">
            No .cmb files found here yet. Backups you create will show up in this list.
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-700 rounded-lg divide-y divide-gray-700/60">
            {backups.map((b) => (
              <div key={b.path} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm text-gray-200 truncate" title={b.path}>{b.name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 flex gap-3">
                    <span>{formatBytes(b.sizeBytes)}</span>
                    <span>{formatDate(b.modifiedAt)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setRestoreFromList(b)}
                  className="text-xs px-3 py-1.5 rounded-md border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 flex-shrink-0 ml-4"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Restore confirm modal ──────────────────────────────────────── */}
      {restoreConfirmOpen && restoreStat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Restore will overwrite current data</h3>
            <p className="text-sm text-gray-300 mb-4">
              Restoring from <span className="font-mono text-gray-100">{restoreStat.name}</span> will
              replace your current ClearMemory store. This cannot be undone.
            </p>
            <p className="text-sm text-gray-400 mb-2">Type <span className="font-mono text-white">RESTORE</span> to confirm.</p>
            <input
              type="text"
              autoFocus
              value={restoreConfirmText}
              onChange={(e) => setRestoreConfirmText(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 mb-4 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder="RESTORE"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setRestoreConfirmOpen(false); setRestoreConfirmText('') }}
                className="px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-200 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => { void doRestore() }}
                disabled={!restoreConfirmValid || restoreBusy}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-sm font-medium"
              >
                {restoreBusy ? 'Starting…' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}): JSX.Element {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-gray-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-indigo-600 focus:ring-1 focus:ring-indigo-500"
      />
      {label}
    </label>
  )
}
