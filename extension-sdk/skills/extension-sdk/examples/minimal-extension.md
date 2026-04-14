# Minimal Extension Example

The absolute minimum files needed for a working ClearPathAI extension.

## Directory Structure

```
extensions/com.example.hello/
  clearpath-extension.json
  dist/
    main.cjs
```

## clearpath-extension.json

```json
{
  "id": "com.example.hello",
  "name": "Hello Extension",
  "version": "1.0.0",
  "description": "A minimal extension that stores and retrieves a greeting",
  "author": "Your Name",
  "main": "dist/main.cjs",
  "permissions": [
    "storage"
  ],
  "ipcNamespace": "hello",
  "ipcChannels": [
    "hello:get-greeting",
    "hello:set-greeting"
  ]
}
```

Key points:
- Only one permission (`storage`) -- the minimum needed for persistence
- No `renderer` -- this is a main-process-only extension
- No `contributes` -- no UI contributions
- `ipcNamespace` and `ipcChannels` declare the IPC handlers the extension registers

## dist/main.cjs

```javascript
'use strict'

const DEFAULT_GREETING = 'Hello, World!'

async function activate(ctx) {
  ctx.log.info('Hello extension activating...')

  // Initialize storage on first run
  if (!ctx.store.get('greeting')) {
    ctx.store.set('greeting', DEFAULT_GREETING)
  }

  // Handler: get the current greeting
  ctx.registerHandler('hello:get-greeting', async () => {
    return {
      success: true,
      data: { greeting: ctx.store.get('greeting') },
    }
  })

  // Handler: update the greeting
  ctx.registerHandler('hello:set-greeting', async (_event, args) => {
    const newGreeting = args?.greeting
    if (!newGreeting || typeof newGreeting !== 'string') {
      return { success: false, error: 'Missing or invalid greeting' }
    }

    ctx.store.set('greeting', newGreeting)
    ctx.log.info('Greeting updated to: %s', newGreeting)

    return { success: true, data: { greeting: newGreeting } }
  })

  ctx.log.info('Hello extension activated')
}

function deactivate() {
  // Nothing to clean up -- handlers auto-unregister
}

module.exports = { activate, deactivate }
```

Key patterns:
- `module.exports = { activate, deactivate }` -- CommonJS format required
- All handlers return `{ success, data?, error? }` envelopes
- Input validation on handler arguments
- Default initialization on first run
- `deactivate()` is empty -- IPC handlers are auto-cleaned by the host

## What This Gets You

- Extension is loaded and activated by the host on app startup
- Other extensions (or the renderer, if you later add one) can call `hello:get-greeting` and `hello:set-greeting` via IPC
- Greeting persists across app restarts in encrypted storage
- Logging visible in the host's log system

## Adding a Renderer Later

To add UI, create a `dist/renderer.js` and update the manifest:

```json
{
  "renderer": "dist/renderer.js",
  "contributes": {
    "navigation": [
      {
        "id": "hello-page",
        "path": "/hello",
        "label": "Hello",
        "icon": "MessageCircle"
      }
    ]
  }
}
```

See [renderer-patterns.md](renderer-patterns.md) for renderer code examples.
