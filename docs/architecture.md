# Architecture

## Principles

1. **Read-only by design** — observe responses produced by normal browsing; do not replay or synthesize gameplay requests.
2. **Local-first** — raw account state and normalized inventory remain on-device unless the user explicitly exports them.
3. **No credentials** — never store passwords, session cookies, auth headers, or login tokens.
4. **Parser isolation** — endpoint-specific parsing lives behind small parser interfaces so GBF response changes do not infect the rest of the application.
5. **Requirements are data** — Eternal/Evoker upgrade recipes are separate from the capture implementation and can be versioned independently.

## Layers

### Capture

Responsible for observing GBF network responses and producing response metadata + parsed JSON input. The concrete Chrome DevTools Protocol implementation is intentionally deferred from the initial scaffold so permissions are introduced only alongside working code.

### Normalization

Transforms endpoint-specific payloads into stable internal records such as `CharacterInstance`, `WeaponInstance`, `SummonInstance`, and `TreasureCount`.

### Storage

IndexedDB stores normalized records. Instance collections use their instance IDs; treasures use the GBF item/master ID.

### Planner

Consumes normalized treasure counts and progression state. It never depends directly on captured network payloads.

### UI

Collection views and planner views consume only normalized local data.

## Capture workflow (planned)

```text
User opens GBF normally
       ↓
User explicitly enables observation
       ↓
Extension attaches read-only network observer
       ↓
XHR/fetch response arrives
       ↓
URL + response schema matched to parser
       ↓
Normalized records written to IndexedDB
       ↓
UI updates scan completeness and planner deficits
```
