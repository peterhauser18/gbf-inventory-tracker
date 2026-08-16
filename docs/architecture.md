# Architecture

## Principles

1. **Read-only by design** — observe responses produced by normal user activity; never replay, synthesize, intercept, or modify gameplay requests.
2. **Explicit observation** — GBF response capture is off until the user explicitly opens the Dashboard from an active GBF tab or manually starts observation under Developer.
3. **No page request hooks** — do not replace `window.fetch`, XHR methods, WebSocket/EventSource, or other GBF request primitives.
4. **Local-first** — normalized account/combat state remains on-device unless the user explicitly exports sanitized data.
5. **No credentials** — never store passwords, session cookies, auth headers, request bodies, or login tokens.
6. **Parser isolation** — endpoint-specific parsing remains separate from capture and storage.

## Capture

The extension manifest contains no GBF content script and no GBF host permission. Loading the extension while browsing GBF does not inject a MAIN-world observer and does not modify the game's JavaScript request path.

The normal popup action, **Open Dashboard**, first checks the existing observation status. If observation is inactive, it starts the same `chrome.debugger` session already used by manual Developer observation; only after that succeeds does it open the dashboard. If observation is already active, it opens the dashboard without attaching again. A non-GBF active tab fails before the dashboard opens. Chrome displays its debugging notice while attached.

`Network.responseReceived` metadata is filtered before it enters the pending-response buffer. A candidate must be XHR/Fetch, use the exact GBF game origin, and match an existing verified account or combat endpoint family. Variable paths are matched only inside those verified families, for example paginated inventory routes and result instance IDs; the implementation does not read every XHR/fetch response from `game.granbluefantasy.jp/*`. The same allowlist check is repeated immediately before `Network.getResponseBody`.

Unknown/new GBF endpoints therefore never have their body read. `Network.getResponseBody` reads a response the browser has already received; the runtime does not issue, replay, retry, intercept, modify, or synthesize GBF HTTP requests.

## Account ingestion

Allowlisted account responses pass through the existing sanitization and normalizer path, then merge into the cumulative local account database. Partial observations do not erase unseen facts; authoritative complete observations may replace stale members according to existing database semantics.

Dashboard live refresh is storage-change driven rather than timer driven. Relevant account-family evidence marks only the dashboard sections that depend on it as dirty. An active relevant section reloads while preserving its selection; an inactive relevant section refreshes when the user next navigates to it. Combat/Raids are not reloaded merely because unrelated account data changed.

## Combat ingestion

Allowlisted combat responses pass through the same debugger-only capture boundary and are normalized into local combat/raid records. Combat tracking therefore works while observation is active after the Dashboard launch flow or a manual Developer start. No battle action is initiated by GBF Tool.

## Storage

Normal account state is stored locally with `known` / `partial` / `unknown` quality and observation timestamps. Combat/raid records and user preferences are local. Diagnostic response records are limited and sanitized; request headers, cookies, POST bodies, and auth/session data are not captured.

## Export

A completed observation can be exported only through an explicit Developer action. Export applies a second sanitization pass and creates a local JSON download. Nothing is uploaded automatically.

## Public wiki metadata

Dashboard metadata and optional raid-drop references may make public requests only to `https://gbf.wiki/*`, with credentials omitted and no referrer. This is separate from the GBF account-request boundary. The character Collection Tracker is built from the cumulative normalized account database and does not require a completed diagnostic scan. Cygames/GBF asset hosts are denied for external dashboard images.

## Planner and UI

The dashboard consumes normalized local data only for inventory/progression calculations. Missing coverage remains `partial` / `unknown`; it is not silently treated as zero. Manual observation status/start-stop, account reset, diagnostic export, and local-storage cleanup are grouped under the popup's collapsed Developer section.

## Workflow

```text
Extension loaded, observation OFF
       ↓
No GBF page injection / no response capture

User presses Open Dashboard on active GBF tab
       ↓
status check
       ├─ already active → reuse observation
       └─ inactive       → chrome.debugger attach + Network.enable
                              ↓
                         dashboard opens
                              ↓
GBF/user initiates normal request
       ↓
responseReceived metadata
       ↓
XHR/Fetch + exact origin + verified endpoint family?
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
                  ↓
              relevant dashboard section refreshes from local data

User presses Stop observation under Developer
       ↓
debugger.detach
       ↓
No further GBF response capture
```
