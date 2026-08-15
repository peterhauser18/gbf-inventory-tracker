# Architecture

## Principles

1. **Read-only by design** — observe responses produced by normal browsing; do not replay or synthesize gameplay requests.
2. **Local-first** — account state and normalized inventory remain on-device unless the user explicitly exports a diagnostic capture.
3. **No credentials** — never store passwords, session cookies, auth headers, request bodies, or login tokens.
4. **Parser isolation** — endpoint-specific parsing lives behind small parser interfaces so GBF response changes do not infect the rest of the application.
5. **Requirements are data** — Eternal/Evoker upgrade recipes are separate from the capture implementation and can be versioned independently.

## Layers

### Passive account observation

Static content scripts run only on `https://game.granbluefantasy.jp/*`. A small main-world observer wraps the page's existing `fetch`/XHR call path so it can inspect the response **after the page itself initiated the request**. The wrapper forwards the original call exactly once and never creates a second request, retry, poll, prefetch, or gameplay action.

The page observer reads bodies only for the already-verified account endpoint allowlist used by the normalizer. URL query values are removed before the response is relayed to the isolated extension bridge. The background revalidates the GBF origin and verified endpoint family, applies the existing JSON secret redaction boundary, normalizes the record, and persists only the resulting account facts.

Unknown/new endpoints are not read into the normal account database and are never actively probed.

### Diagnostic capture

The existing explicit popup scan remains separate developer/diagnostic tooling. When the user starts it, the background attaches Chrome's debugger transport to the active GBF tab and observes qualifying XHR/fetch responses for a sanitized local scan/export. It is not required for normal account tracking or dashboard use.

Request headers, cookies, post bodies, and auth material are never copied into diagnostic capture records. Query values are removed from captured URLs and credential-like JSON fields are redacted before local persistence. The diagnostic path does not replay, retry, synthesize, or send GBF requests.

### Normalization

Transforms endpoint-specific payloads into stable internal records such as `CharacterInstance`, `WeaponInstance`, `SummonInstance`, and `TreasureCount`.

### Storage

Normal use stores one cumulative normalized account database in extension-local storage. Each observed family carries `known` / `partial` / `unknown` quality plus last-observed timestamps. Newer explicit facts replace older facts; partial observations merge without deleting unseen entities; an authoritative complete family observation may replace stale members.

Diagnostic scan records remain in their dedicated IndexedDB database. They are not the dashboard's source of truth.

### Export

A completed diagnostic capture scan can be exported only from an explicit popup action. The exporter reads that scan's records from the local capture database, applies a second sanitization pass, and creates a local JSON download with no upload or external request. Sensitive/auth fields are removed, URL query values are stripped again, and clear account identifiers are pseudonymized while game/master/instance IDs remain available for parser work.

### Planner

Consumes the cumulative normalized treasure counts and progression state. It never depends directly on captured network payloads.

### UI

The dashboard reads the cumulative local account database and can therefore open without a completed manual scan. Missing coverage remains `partial` / `unknown` while normal play gradually contributes more verified facts.

The popup presents automatic account tracking as the normal mode. Manual start/stop scan controls and scan export are explicitly labeled diagnostic tooling. A local reset removes the accumulated normalized account database without making a GBF request or changing the game account.

## Normal account workflow

```text
User opens/plays GBF normally
       ↓
GBF itself initiates an already-known account request
       ↓
Passive observer mirrors the received response only
       ↓
Background revalidates endpoint + sanitizes JSON
       ↓
Verified response normalized immediately
       ↓
New facts merge into cumulative local account database
       ↓
Dashboard progressively becomes more complete
```
