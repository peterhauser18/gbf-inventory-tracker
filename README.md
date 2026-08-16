# GBF Inventory Tracker

A privacy-first, read-only Granblue Fantasy account companion for tracking collection state, combat observations, and Eternal / Evoker upgrade planning.

## Goals

- Read only verified GBF responses that the browser already received during an explicitly enabled observation session.
- Track characters, weapons, summons, treasures, progression, combat, and relevant raid history locally.
- Provide GBF Roster-style collection search and filtering.
- Calculate missing materials for Eternal and Evoker recruitment, uncaps, and transcendence.
- Keep account data on-device by default.

## Non-goals

This project is intentionally not designed to automate gameplay. It must not farm, battle, start quests, purchase, draw, upgrade, uncap, consume items, replay requests, export session cookies, or store login credentials.

## Capture model

GBF Tool does **not** patch `window.fetch`, `XMLHttpRequest.send`, or other request primitives in the game page. Normal GBF browsing with the extension loaded performs no GBF response capture.

The normal entry point is **Open Dashboard** in the extension popup. When pressed while a `game.granbluefantasy.jp` tab is active, GBF Tool first starts the existing `chrome.debugger` observation session and then opens the dashboard. Manual Start/Stop observation remains available under the popup's collapsed Developer section. Chrome shows its debugging notice while observation is active.

Before a response body can be read, GBF Tool requires all of the following:

- exact HTTPS origin `game.granbluefantasy.jp`;
- XHR or Fetch resource type;
- URL match against the existing verified account/combat endpoint families.

The allowlist is family-based where paths legitimately vary, such as paginated character/weapon/summon lists and result instance IDs. It is **not** a blanket `game.granbluefantasy.jp/*` body-read rule. Unknown GBF endpoints are ignored before `Network.getResponseBody`. The runtime does not replay, retry, intercept, modify, synthesize, or send GBF HTTP requests.

```text
GBF page ──normal request──► browser ──► Cygames
                              │
                              └─ while observation is explicitly active
                                 └─ read allowlisted received response body
                                    └─ normalize/store locally
```

## Local data

Verified account responses are normalized into a cumulative local account database with explicit `known` / `partial` / `unknown` quality. Combat responses are normalized into local combat/raid records. Diagnostic response records remain local and can be exported only through an explicit sanitized export action.

Dashboard collection views refresh from the cumulative account database when newer relevant family evidence arrives. The GBF Wiki character Collection Tracker also uses that cumulative database rather than requiring a completed diagnostic scan.

Dashboard character, weapon, summon, and wiki-reference metadata may use public `https://gbf.wiki/*` requests. Those requests omit credentials/referrers and are separate from the GBF account-request boundary. Cygames/GBF asset-CDN images are not requested by the dashboard resolver.

## Safety / account risk

Granblue Fantasy does not provide a documented public account API for this use case. Third-party extensions can still carry Terms-of-Service or account risk even when they are read-only. The project therefore minimizes the interaction surface: explicit observation only, existing verified response families only, no page request hooks, no credential handling, no request replay/modification, and no gameplay automation.

## Development

Requires **Node.js 22.12 or newer**.

```bash
npm install
npm test
npm run typecheck
npm run build
```

Then load the generated `dist/` directory as an unpacked Chrome extension.

To update local account/combat data:

1. Open GBF in the active tab.
2. Open the extension and press **Open Dashboard**.
3. The existing debugger-only observation starts, then the dashboard opens.
4. Browse or play normally; only verified allowlisted response families are read.
5. Stop observation from **Developer** when you are finished collecting data.

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the capture, normalization, storage, and planner boundaries.
