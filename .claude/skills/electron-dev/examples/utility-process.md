# Pattern: Utility Process for Heavy Work

```ts
// main.ts — spawn utility process for CPU-intensive work
import { utilityProcess, ipcMain, BrowserWindow } from 'electron'
import path from 'node:path'

let worker: Electron.UtilityProcess | null = null

function spawnWorker(): Electron.UtilityProcess {
  const child = utilityProcess.fork(
    path.join(__dirname, 'worker.js'),
    [],
    { serviceName: 'heavy-computation' }
  )

  child.on('spawn', () => console.log('Worker spawned, pid:', child.pid))

  child.on('message', (result) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('worker:result', result)
  })

  child.on('exit', (code) => {
    console.log('Worker exited with code:', code)
    worker = null
  })

  return child
}

ipcMain.handle('worker:compute', async (_event, data) => {
  if (!worker) worker = spawnWorker()
  worker.postMessage({ type: 'compute', data })
})

ipcMain.handle('worker:cancel', async () => {
  worker?.kill()
  worker = null
})
```

```ts
// worker.ts — runs in the utility process
process.parentPort.on('message', (event) => {
  const { type, data } = event.data

  if (type === 'compute') {
    const result = heavyComputation(data)
    process.parentPort.postMessage({ type: 'result', result })
  }
})

function heavyComputation(data: unknown): unknown {
  // CPU-intensive operation here — won't block main process
  return data
}
```

## Why This Works

- **`utilityProcess.fork()`** runs in a separate process — never blocks the main process
- Always prefer over `child_process.fork()` in Electron (supports MessagePorts)
- Worker crashes don't bring down the app
- Can only be called after `app` ready
- `stdio` defaults to `'inherit'` — set to `'pipe'` to capture stdout/stderr
