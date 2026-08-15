# Architecture

## Principles

1. **Read-only by design** — observe responses produced by normal browsing; do not replay or synthesize gameplay requests.
2. **Local-first** — raw account state and normalized inventory remain on-device unless the user explicitly exports them.
3. **No credentials** — never store passwords, session cookies, auth headers, or login tokens.
4. **Parser isolation** — endpoint-specific parsing lives behind small parser interfaces so GBF response changes do not infect the rest of the application.
5. **Requirements are data** — Eternal/Evoker upgrade recipes are separate from the capture implementation and can be versioned independently.

## Layers

### Capture

The user explicitly starts observation from the extension popup while a `game.granbluefantasy.jp` tab is active. The background worker attaches Chrome's debugger transport, enables only the CDP Network observer, remembers qualifying XHR/fetch response metadata, and reads the already-received body after `Network.loadingFinished`.

Only JSON bodies from the exact GBF game origin are retained. Request headers, cookies, post bodies, and auth material are never copied into capture records. Query values are removed from captured URLs and credential-like JSON fields are redacted before local persistence. The capture path does not replay, retry, synthesize, intercept, modify, or send GBF requests.

### Normalization

Transforms endpoint-specific payloads into stable internal records such as `CharacterInstance`, `WeaponInstance`, `SummonInstance`, and `TreasureCount`.

### Storage

A dedicated IndexedDB database stores sanitized raw capture records and per-scan candidate status. The normalized account database remains separate; instance collections use their instance IDs and treasures use the GBF item/master ID.

### Export

A completed capture scan can be exported only from an explicit popup action. The exporter reads that scan's records from the local capture database, applies a second sanitization pass, and creates a local JSON download with no upload or external request. Sensitive/auth fields are removed, URL query values are stripped again, and clear account identifiers are pseudonymized while game/master/instance IDs remain available for parser work.

### Planner

Consumes normalized treasure counts and progression state. It never depends directly on captured network payloads.

### UI

The popup controls observation and reports captured JSON-response counts plus heuristic category candidates. A category marked `seen` means only that matching response evidence was observed; it is not a completeness claim. Collection and planner views will consume normalized local data.

## Capture workflow

```text
User opens GBF normally
       ↓
User explicitly enables observation
       ↓
Extension attaches passive Network observer
       ↓
User clicks through relevant GBF menus
       ↓
XHR/fetch response finishes loading
       ↓
JSON body sanitized + stored locally
       ↓
Candidate categories shown as seen/unknown
       ↓
Later normalizers consume the local capture set
```
