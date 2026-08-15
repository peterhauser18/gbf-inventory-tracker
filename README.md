# GBF Inventory Tracker

A privacy-first, read-only Granblue Fantasy account companion for tracking collection state and planning Eternal / Evoker upgrades.

## Goals

- Passively observe data already loaded by `game.granbluefantasy.jp` while you browse normally.
- Track characters, weapons, summons, treasures, and relevant progression state locally.
- Provide GBF Roster-style collection search and filtering.
- Calculate missing materials for Eternal and Evoker recruitment, uncaps, and transcendence.
- Support multi-goal planning so shared materials are not double-counted.
- Keep account data on-device by default.

## Non-goals

This project is intentionally not designed to automate gameplay. It should not farm, battle, purchase, replay requests, export session cookies, or store login credentials.

## Architecture

```text
Granblue browser tab
        │
        │ normal browsing only
        ▼
Passive capture layer
        │
        ▼
Normalizer / parsers
        │
        ▼
Local account database
  ├─ characters
  ├─ weapons
  ├─ summons
  ├─ treasures
  └─ progression
        │
        ├──────────────► Collection UI
        │
        └──────────────► Upgrade planner
                         ├─ Eternal goals
                         ├─ Evoker goals
                         └─ aggregate deficits
```

## Project status

The normal extension flow now passively observes **already verified account-response families** while the user plays or browses GBF normally. Those responses are normalized immediately and merged into a durable local account database, so the dashboard becomes progressively more complete without starting/stopping a scan or following a menu checklist.

Automatic tracking does not synthesize, replay, retry, poll, prefetch, or otherwise add GBF requests. The page observer only mirrors the response from the request GBF itself was already making, strips URL query values before handing it to the extension, and the background accepts only the verified account endpoint allowlist. Normal-mode persistence contains normalized account facts and coverage timestamps rather than raw response dumps, headers, cookies, request bodies, or session material.

The existing `activeTab` + `debugger` scan remains available from the popup as optional developer/diagnostic tooling. It is not required for the dashboard. After a diagnostic scan is stopped, the popup can export that scan as a local, versioned JSON bundle; export is explicit and applies a second sanitization pass before download. Nothing is uploaded automatically.

The full-page **GBF Tool Dashboard** reads the cumulative local account database and exposes collection browsing plus an Eternal/Evoker planner with explicit `known` / `partial` / `unknown` states. Partial observations can refresh or add facts without deleting unseen cached entities; authoritative complete observations may replace stale members. Eternal details expose 1★–5★ plus the modeled Transcendence stages through Lv150 as expandable steps; Evoker details expose 1★–5★ plus only currently verified Transcendence stages instead of guessing unreleased recipes.

Dashboard character, weapon and summon cards resolve public names and thumbnails from GBF Wiki metadata where available, including stash weapons. Wiki metadata/image requests are limited to `https://gbf.wiki/*`, omit credentials/referrers, and fall back to technical IDs plus local placeholders on failure. The runtime does not request Cygames/GBF asset-CDN images and does not hotlink GBFAL.

## Safety / account risk

Granblue Fantasy does not provide a documented public account API for this use case. Any third-party extension may carry Terms-of-Service or account risk. The design goal here is deliberately conservative: passive observation only, no gameplay automation, no credential handling, and local-first storage.

## Development

Requires **Node.js 22.12 or newer**. Windows PowerShell is supported directly; WSL is not required.

```bash
npm install
npm test
npm run typecheck
npm run build
```

Then load the generated `dist/` directory as an unpacked Chrome extension. Browse/play GBF normally to let the local database fill over time, and use **Open Dashboard** for the full inventory/planner tab. The manual scan controls in the popup are diagnostic/export tooling only.

## Planned milestones

1. Extension scaffold and local storage schema.
2. Passive response capture and endpoint discovery tooling.
3. Character / weapon / summon normalization.
4. Treasure/material inventory normalization.
5. Eternal and Evoker progression detection.
6. Collection browser and JSON import/export.
7. Upgrade requirement data model.
8. Single-goal and multi-goal planner.
