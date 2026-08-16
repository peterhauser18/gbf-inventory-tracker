# Architecture

GBF Tracker is built around one hard product boundary: **observe and analyze; never play the game for the user.**

This document describes the current `main` architecture and the mechanisms used to keep account observation passive, local-first, and auditable.

## Safety invariants

1. **Read-only by design** — observe responses produced by normal user/game activity; never replay, synthesize, intercept, modify, or generate GBF gameplay/account HTTP requests.
2. **Explicit observation** — GBF response capture is inactive until the user explicitly starts it, normally by pressing **Open Dashboard** from a GBF tab or manually using Developer → Start observation.
3. **Dashboard availability is independent from capture** — the Dashboard always opens and can inspect existing local state even when observation is unavailable or inactive.
4. **No page request hooks** — no GBF content script and no replacement/patching of `window.fetch`, XHR methods, WebSocket/EventSource, or other game request primitives.
5. **Verified-family body reads only** — unknown GBF endpoint paths are rejected before response-body retrieval.
6. **One debugger target** — observation attaches to one verified GBF tab at a time rather than attaching to every game tab.
7. **Local-first** — normalized account/combat state remains on-device unless the user explicitly exports sanitized data.
8. **No credentials** — passwords, session cookies, auth headers, login tokens, browser profiles, and credential-bearing request bodies are not normal persisted inputs.
9. **Parser isolation** — endpoint-specific parsing and deterministic calculation logic remain separate from capture/session control where practical.
10. **Unknown stays unknown** — missing evidence must not silently become `0`, `false`, absent, complete, or safe-to-act-on.

## Extension permissions

The Manifest V3 extension requests only:

- `storage`;
- `activeTab`;
- `debugger`;
- host permission `https://gbf.wiki/*`.

There is **no** host permission for `game.granbluefantasy.jp` and no GBF content script.

The permissions represent three separate trust boundaries:

```text
GBF/game traffic        chrome.debugger read of already-received allowlisted responses
Public Wiki traffic     direct credential-free https://gbf.wiki/* reads
Local analysis          extension storage / calculation / UI only
```

## Dashboard launch and observation lifecycle

The normal popup action is **Open Dashboard**.

Current ordering is intentionally asynchronous:

1. The popup tries to resolve the exact active tab as a valid `https://game.granbluefantasy.jp/...` tab.
2. If one exists, it sends `gbfit:start-observation` for that exact `tabId`. If none exists, it requests status only.
3. The popup opens `dashboard.html` immediately; Dashboard availability does not wait for debugger attachment.
4. The observation/status promise finishes independently and the popup reports whether observation is active.

Therefore a failed debugger attachment, a non-GBF active tab, or lack of a suitable active tab does not block local Dashboard use.

Manual Start/Stop observation, account reset, sanitized diagnostic export, and local cleanup controls remain grouped in the popup's collapsed **Developer** section.

Chrome's debugger notification/banner is expected while observation is active.

## Debugger target policy

Observation never attaches broadly.

The background service worker validates the selected target as an exact HTTPS GBF game page before attaching. After explicit observation has started, account collection may follow the active verified GBF tab across browser tabs/windows so normal browsing can continue to populate the cumulative account database.

Only one debugger target is attached at a time.

### Combat raid-instance lock

Combat requires stronger continuity than inventory collection.

When the parser has a concrete raid instance identity, the observation lifecycle treats that fight as locked. A terminal parse releases the lock only when both the source tab and concrete raid instance match the current Combat context.

This prevents normal tab/window focus changes from mixing responses from two fights into one Raid record while still allowing account observation to retarget when the Combat lock permits it.

The lock affects only which tab is observed. It does not load pages, start fights, or send a GBF request.

## Account/combat response capture

The Chrome DevTools Protocol Network domain is enabled only for the explicit debugger session.

`Network.responseReceived` metadata is filtered before a response enters the pending-response buffer. A candidate account/combat response must satisfy the capture policy, including:

- exact HTTPS origin `game.granbluefantasy.jp`;
- resource type XHR or Fetch;
- path matching an existing reviewed account or combat endpoint family.

Variable paths are accepted only inside known families, for example paginated inventory routes or concrete result-instance paths. There is no blanket `game.granbluefantasy.jp/*` body-read policy.

After `Network.loadingFinished`, the same policy is checked again before `Network.getResponseBody`.

`Network.getResponseBody` reads bytes the browser already received. The runtime does not use debugger commands that generate/replay the GBF request, bypass the normal request lifecycle, or turn an unknown URL into a fetch target.

The body-read path includes bounded buffering/retry behavior for transient Chrome/Edge CDP timing races. Those retries retry the **debugger body-read command**, not the underlying GBF HTTP request.

Unknown/new GBF endpoints therefore remain unread until explicitly reviewed and added to the verified policy.

## Passive Treasure asset retention

Treasure icons use a separate passive asset-retention path and deliberately do not relax the GBF account-response boundary.

When normal GBF activity has already loaded a Treasure JPEG from the exact proven static asset path, GBF Tracker may retain those already-loaded image bytes in extension-owned local cache storage keyed by the technical item ID.

Important properties:

- it does not make a new GBF/CDN request for a missing Treasure icon;
- it does not prefetch or poll assets;
- a Dashboard cache miss remains a placeholder;
- the asset read is kept off the main debugger event queue so slow image handling does not block account/combat ingestion;
- no session/auth material is stored with the image.

This differs from public Wiki images, which are allowed direct `gbf.wiki` requests through the manifest host permission.

## Account ingestion

Allowlisted account JSON responses pass through sanitization and endpoint-specific normalization before merging into the cumulative local account database.

The database is cumulative rather than "latest scan only":

- partial observations preserve previously known unseen members;
- authoritative complete observations may replace stale members according to the existing family semantics;
- filter/pagination evidence can keep a family partial even when all currently visible rows were observed;
- missing quantities or entities do not automatically become zero/unowned.

The normalized model covers observed Characters, Weapons, Summons, Treasures, Consumables/Tickets, Weapon Stashes, and supported status/progression facts.

### Dashboard account refresh

Dashboard refresh is storage-change driven rather than network polling driven.

Relevant account-family evidence marks only dependent Dashboard surfaces as stale/dirty. Active relevant views can refresh while preserving selection; inactive views refresh when entered. A clean Dashboard that initially has no account snapshot can promote itself when the first valid normalized snapshot appears.

Combat/Raids are not reloaded merely because unrelated account inventory changed.

## Combat ingestion

Allowlisted verified multiraid/result responses pass through the same debugger-only capture boundary and are normalized into live/session Combat state and local Raid history.

The parser retains only facts needed for supported analysis. Examples include direct boss/party state, damage/action evidence, result/reward evidence, and safe identifiers required to correlate one fight.

Unsupported or ambiguous semantics stay unclassified/partial instead of being guessed. In particular, ambiguous concurrent attack lanes do not become invented Echo/Supplemental classifications.

Some correlation and participant-display facts are intentionally session-only. Non-public participant user/viewer IDs are discarded rather than persisted into Raid history.

No battle action is initiated by GBF Tracker.

## Public GBF Wiki boundary

Public Wiki integration is independent from GBF account capture.

Approved Dashboard features may make public requests only to `https://gbf.wiki/*`, using omitted credentials and no referrer where applicable.

Current uses include:

- Character/Weapon/Summon identity metadata and images;
- roster capability metadata;
- Eternal/Evoker/material references;
- Farming source references;
- optional Raid/drop references;
- Character Collection Tracker support.

Where practical, public data is loaded in bulk/account-independent form and then matched locally. Owned entity/search lists are not sent as remote query filters when a bulk public dataset is sufficient.

A Wiki failure must not corrupt account truth: metadata/source/capability conclusions downgrade to unavailable/partial while the normalized local account data remains usable.

## Progressive Wiki image scheduler

Wiki image loading is centralized instead of letting every rendered `<img>` independently create network traffic.

The shared Dashboard scheduler:

- queues active/visible work progressively;
- applies a bounded global concurrency limit;
- coalesces duplicate normalized URLs;
- reuses already resolved images during rerenders;
- stores successful public image responses in extension-owned Cache Storage;
- applies cooldown/backoff behavior after failures or rate limiting;
- bounds cache growth and exposes a local **Clear Wiki image cache** action.

Search results are text-only and do not enqueue images. Collapsed Weapon Stash children are not rendered, so they do not enqueue Wiki images until the stash is expanded (or a local search result requires the child to be surfaced).

The Wiki image cache contains public image bytes only and can be cleared without deleting account/combat data.

## Planner, Goals, Farming, and Roster

All account-sensitive calculations consume normalized local data, not raw captured response bodies.

### Planner / Goals

Eternal/Evoker planning derives modeled requirement stages and compares them with proven local quantities. Shortfalls are clamped at zero only after a quantity is actually known.

Pinned Goals and next-action calculations are local preferences/derived state. Aggregate deficits subtract a proven owned quantity only once across active goals rather than double-counting inventory.

### Farming Focus

Farming Focus keeps two evidence domains separate:

- public Wiki pages describe possible source references;
- local Raid history describes only the user's empirical observed outcomes.

An empirical local rate is never converted into an official drop rate. Unknown inventory/reward/source identity remains unavailable.

### Roster capabilities

The Roster view joins local owned Character identities to account-independent public Wiki metadata and derives conservative capability signals. Negative capability claims require sufficient public metadata coverage; malformed/missing Wiki data does not become a false negative.

## Local search and comparison

The Dashboard command palette indexes the local `DashboardViewModel` plus already-cached local public metadata where available.

Search terms are never sent to GBF or GBF Wiki. Results are text-only and can navigate to local entity sections/details, including expanding a Weapon Stash before opening a stash-contained Weapon.

The Local Analysis Snapshot feature exports a deliberately small versioned digest rather than a restorable account dump. Imported digests stay in memory for the current Dashboard tab and comparisons only derive deltas when both sides contain sufficient known facts.

## Storage boundaries

Logical local storage domains are intentionally separated:

### Normalized account state

Cumulative local account facts with family freshness/quality. This is the normal source for Dashboard collection/planner/roster views.

### Combat/Raid history

Normalized persistent Raid records, local favorites/notes/drop preferences, plus separate session-only live correlation context where required.

### Diagnostic capture data

Sanitized response records for explicit observation diagnostics. Retention is bounded to the most recent completed scans, and cleanup can remove diagnostic data independently from the account snapshot.

### UI preferences

Theme/layout/navigation/goal preferences and other local presentation state. These do not alter the GBF account.

### Cache Storage

- public Wiki image bytes;
- passively retained already-loaded Treasure image bytes under the stricter asset-retention rule.

Session cookies/auth tokens are not stored in these normal application stores.

## Diagnostic export

A stopped completed observation can be exported only through an explicit Developer action.

Export:

1. reads only the selected local diagnostic records;
2. applies a second deterministic sanitization pass;
3. removes/redacts credential/session/account-identity fields according to the export policy;
4. strips sensitive URL query values;
5. serializes a versioned JSON bundle;
6. creates a local browser download.

No upload, telemetry, clipboard transfer, or external service is part of this path.

## Data-quality model

Internal logic preserves `known`, `partial`, and `unknown` states even where the normal UI uses friendlier wording.

This protects calculations from common false assumptions:

- a missing inventory observation is not quantity zero;
- a filtered roster page is not a complete ownership statement;
- an incomplete reward response is not a zero-drop run;
- incomplete Combat attribution is not complete per-character accounting;
- missing Wiki metadata is not a proven absence of a capability/source.

## End-to-end workflow

```text
Extension loaded, observation OFF
       ↓
No GBF content script / no GBF host permission / no page request hook
       ↓
Dashboard may still open and read existing local data

User presses Open Dashboard from a GBF tab
       ├──────────────────────────────► open extension Dashboard immediately
       │
       └─ exact active tabId ─────────► background validates GBF tab
                                         ↓
                                    chrome.debugger attach
                                         ↓
                                    Network.enable
                                         ↓
                           one verified debugger target at a time
                                         ↓
GBF/user initiates normal request
       ↓
GBF returns response
       ↓
Network.responseReceived metadata
       ↓
XHR/Fetch + exact origin + verified family?
       ├─ no  → ignore before body read
       └─ yes → wait for loadingFinished
                  ↓
              repeat policy check
                  ↓
              Network.getResponseBody
                  ↓
              sanitize + normalize
                  ↓
        ┌─────────┴──────────┐
        ↓                    ↓
 account database       combat/session/history
        ↓                    ↓
 family-aware local     Combat/Raids local UI
 Dashboard refresh

Active GBF tab/window changes
       ↓
account observation may retarget one verified debugger target
       ↓
concrete Combat raid lock prevents cross-fight mixing until matching terminal evidence

User stops observation / Chrome detaches
       ↓
no further GBF response-body capture
```

## Development boundary

Production code changes that add new authentication/session handling, new GBF endpoint families, or new persistence of real account data are `account-relevant` and require explicit review/activation under the repository workflow.

A merge alone is not authorization to activate newly introduced account access against a real account.

Unknown endpoints remain potentially writing until their behavior is understood. A `GET` method by itself is not proof that an endpoint is safe/read-only.
