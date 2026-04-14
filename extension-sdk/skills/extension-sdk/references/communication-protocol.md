# Communication Protocol

Extensions communicate with the host app using a MessagePort-based protocol. This document covers the wire format, message types, lifecycle, and debugging guidance.

## Architecture

```
Renderer (Extension iframe)          Host (ExtensionHost component)
  |                                     |
  |  -- ext:ready ------------------>   |  Extension signals it's ready
  |  <-- ext:init -------------------   |  Host sends theme + config
  |                                     |
  |  -- ext:request { id, method } ->   |  Extension calls SDK method
  |  <-- ext:response { id, result } -  |  Host returns result
  |                                     |
  |  <-- ext:event { event, data } ---  |  Host pushes event
  |                                     |
  |  -- ext:error { error } -------->   |  Extension reports error
  |  -- ext:activated --------------->   |  Extension finished activate()
```

## Port Setup

1. The host creates a `MessageChannel()`, keeping `port1` and transferring `port2` to the iframe:

```javascript
// Host side (ExtensionHost.tsx)
const channel = new MessageChannel()
iframe.contentWindow.postMessage(
  { type: 'ext:port', extensionId: extId },
  '*',
  [channel.port2]  // Transfer port2 to iframe
)
```

2. The iframe's bootstrap script listens for the port:

```javascript
// Inside iframe srcdoc
window.addEventListener('message', function onInit(event) {
  if (event.data?.type !== 'ext:port') return
  window.removeEventListener('message', onInit)

  const port = event.ports[0]
  window.__clearpath_port = port
  window.__clearpath_extension_id = event.data.extensionId
})
```

3. Once the extension code boots, it finds the root element and signals readiness:

```javascript
// The srcdoc creates <div id="ext-root"> — always use ext-root first with fallbacks
var root = document.getElementById('ext-root') || document.getElementById('root') || document.body

port.postMessage({ type: 'ext:ready' })
```

> **Note**: The iframe srcdoc uses `<div id="ext-root">` as the root element, not `<div id="root">`. Always query `ext-root` first.

## Message Types

### `ext:ready` (Extension -> Host)

Signals that the extension's renderer is loaded and ready to communicate.

```javascript
{ type: 'ext:ready' }
```

No payload. The host responds by sending `ext:init`.

### `ext:init` (Host -> Extension)

Sent after the host receives `ext:ready`. Contains initialization data.

```javascript
{
  type: 'ext:init',
  theme: {
    primary: '#5B4FC4',
    sidebar: '#1e1b4b',
    accent: '#1D9E75',
    isDark: true
  },
  extensionId: 'com.example.my-ext'
}
```

### `ext:request` (Extension -> Host)

An SDK method call from the extension to the host.

```javascript
{
  type: 'ext:request',
  id: 'req-1',       // Unique request ID for correlation
  method: 'storage.get',  // SDK method (dot notation) or IPC channel name
  params: { key: 'config' }  // Method-specific parameters
}
```

**Method naming**:
- SDK methods use dot notation: `storage.get`, `github.listRepos`, `notifications.emit`
- Extension IPC channels use namespace prefix: `my-ext:get-data`, `my-ext:process`

### `ext:response` (Host -> Extension)

The host's response to an `ext:request`, correlated by `id`.

**Success**:
```javascript
{
  type: 'ext:response',
  id: 'req-1',
  result: { key: 'config', value: { greeting: 'Hello' } }
}
```

**Error**:
```javascript
{
  type: 'ext:response',
  id: 'req-1',
  error: {
    code: 'SDK_ERROR',
    message: 'Permission denied: storage not granted'
  }
}
```

### `ext:event` (Host -> Extension)

A push event from the host to subscribed extensions.

```javascript
{
  type: 'ext:event',
  event: 'turn:ended',
  data: { sessionId: 'abc-123', tokenUsage: { input: 500, output: 200 } }
}
```

Events are only forwarded to extensions that have subscribed via `sdk.events.on()` (which sends an `events.subscribe` request internally).

### `ext:activated` (Extension -> Host)

Signals that the extension's `activate()` lifecycle hook has completed.

```javascript
{ type: 'ext:activated' }
```

### `ext:error` (Extension -> Host)

Reports an uncaught error from the extension iframe.

```javascript
{
  type: 'ext:error',
  error: {
    message: 'TypeError: Cannot read properties of undefined',
    source: 'clearpath-ext://com.example.my-ext/dist/renderer.js',
    lineno: 42,
    colno: 15
  }
}
```

## Request/Response Correlation

Every `ext:request` includes a unique `id` field. The host echoes this `id` in the corresponding `ext:response`. The SDK client maintains a map of pending requests keyed by ID:

```javascript
var reqCounter = 0
var pending = new Map()

function request(method, params) {
  var id = 'req-' + (++reqCounter)
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      pending.delete(id)
      reject(new Error('Request "' + method + '" timed out'))
    }, 30000)  // 30-second timeout

    pending.set(id, {
      resolve: function (v) { clearTimeout(timer); resolve(v) },
      reject: function (e) { clearTimeout(timer); reject(e) },
    })

    port.postMessage({ type: 'ext:request', id: id, method: method, params: params })
  })
}
```

## Timeouts

- **SDK client timeout**: 30 seconds (in `createSDKClient`)
- **IIFE pattern timeout**: 15 seconds (customizable by the extension)

If a request times out, the pending promise is rejected with an error. The host does not send a response for timed-out requests.

## Event Subscription Protocol

Extensions subscribe to events through the request/response protocol:

1. Extension sends `ext:request` with method `events.subscribe` and params `{ event: 'turn:ended' }`:
   ```javascript
   port.postMessage({
     type: 'ext:request',
     id: 'req-5',
     method: 'events.subscribe',
     params: { event: 'turn:ended' }
   })
   ```

2. Host validates the event name and required permission, then adds the event to the extension's subscription set.

3. When the event fires, the host sends `ext:event` messages to all subscribed extensions.

4. To unsubscribe:
   ```javascript
   port.postMessage({
     type: 'ext:request',
     id: 'req-6',
     method: 'events.unsubscribe',
     params: { event: 'turn:ended' }
   })
   ```

## Slot Data Forwarding

Panels rendered in host UI slots (like `home:widgets`) can receive dynamic data from the host page. When the host page updates its slot data, the `ExtensionHost` forwards it as a `slot:data-changed` event:

```javascript
// Host sends automatically when slotData prop changes:
port.postMessage({
  type: 'ext:event',
  event: 'slot:data-changed',
  data: { /* host-provided data */ }
})
```

No subscription is needed for `slot:data-changed` -- it is always forwarded.

## Debugging Communication Issues

### Extension not loading
- Check that the renderer entry path in the manifest is correct and the file exists
- Look for CSP errors in the iframe's console (blocked scripts or resources)
- Verify `ext:ready` is being sent by the extension

### Requests timing out
- Default timeout is 30 seconds -- long operations may need to be broken into steps
- Check that the host can handle the requested method (unknown methods return an error)
- For IPC channel requests, verify the channel is registered in `ipcChannels` and the main process handler is active

### Events not firing
- Verify the extension has subscribed via `events.subscribe`
- Check that the required permission for the event is granted
- The subscription map is per-instance -- if the extension iframe is recreated, subscriptions are lost

### Error reporting
- Global `window.onerror` in the iframe sends `ext:error` to the host
- The host displays error banners and records errors for potential auto-disable
