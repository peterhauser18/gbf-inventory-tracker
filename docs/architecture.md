# Architecture

## Principles

1. **Read-only by design** — observe responses produced by normal user activity; never replay, synthesize, intercept, or modify gameplay requests.
2. **Explicit observation** — GBF response capture is off until the user starts a Chrome debugger observation session.
3. **No page request hooks** — do not replace `window.fetch`, XHR methods, WebSocket/EventSource, or other GBF request primitives.
4. **Local-first** — normalized account/combat state remains on-device unless the user explicitly exports sanitized data.
5. **No credentials** — never store passwords, session cookies, auth headers, request bodies, or login tokens.
6. **Parser isolation** — endpoint-specific parsing remains separate from capture and storage.

## Capture

The extension manifest contains no GBF content script and no GBF host permission. Loading the extension while browsing GBF does not inject a MAIN-world observer and does not modify the game's JavaScript request path.

When the user explicitly starts observation from the popup, the background attaches `chrome.debugger` to the active `https://game.granbluefantasy.jp/` tab and enables the Chrome DevTools Protocol Network domain. Chrome displays its debugging notice while attached.

`Network.responseReceived` metadata is filtered before it enters the pending-response buffer. A candidate must be XHR/Fetch, use the exact GBF game origin, and match an existing verified account or combat endpoint family. The same allowlist check is repeated immediately before `Network.getResponseBody`.

Unknown/new GBF endpoints therefore never have their body read. `Network.getResponseBody` reads a response the browser has already received; the runtime does not issue, replay, retry, intercept, modify, or synthesize GBF HTTP requests.

## Account ingestion

Allowlisted account responses pass through the existing sanitization and normalizer path, then merge into the cumulative local account database. Partial observations do not erase unseen facts; authoritative complete observations may replace stale members according to existing database semantics.

## Combat ingestion

Allowlisted combat responses pass through the same debugger-only capture boundary and are normalized into local combat/raid records. Combat tracking therefore works only while explicit observation is active. No battle action is initiated by GBF Tool.

## Storage

Normal account state is stored locally with `known` / `partial` / `unknown` quality and observation timestamps. Combat/raid records and user preferences are local. Diagnostic response records are limited and sanitized; request headers, cookies, POST bodies, and auth/session data are not captured.

## Export

A completed observation can be exported only through an explicit popup action. Export applies a second sanitization pass and creates a local JSON download. Nothing is uploaded automatically.

## Public wiki metadata

Dashboard metadata and optional raid-drop references may make public requests only to `https://gbf.wiki/*`, with credentials omitted and no referrer. This is separate from the GBF account-request boundary. Cygames/GBF asset hosts are denied for external dashboard images.

## Planner and UI

The dashboard consumes normalized local data only for inventory/progression calculations. Missing coverage remains `partial` / `unknown`; it is not silently treated as zero. The popup exposes explicit Start/Stop observation controls and states that Chrome's debugging notice is expected while observation is active.

## Workflow

```text
Extension loaded, observation OFF
       ↓
No GBF page injection / no response capture

User presses Start observation on GBF tab
       ↓
chrome.debugger attach + Network.enable
       ↓
GBF/user initiates normal request
       ↓
responseReceived metadata
       ↓
XHR/Fetch + exact origin + verified allowlist?
       ├─ no  → ignore before body read
       └─ yes → loadingFinished
                  ↓
              allowlist check again
                  ↓
              Network.getResponseBody
                  ↓
              sanitize + normalize locally
                  ↓
              account/combat storage

User presses Stop observation
       ↓
debugger.detach
       ↓
No further GBF response capture
```
