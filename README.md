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

Early implementation. The extension can now run an explicitly user-controlled passive scan: while observation is enabled, qualifying GBF XHR/fetch JSON responses produced by normal browsing are captured locally for later endpoint discovery and normalization.

The capture implementation uses the `activeTab` and `debugger` permissions only after the user starts observation from the extension popup. It does not replay or synthesize GBF requests. Captured URLs drop query values and credential-like JSON fields are redacted before local persistence.

After a scan is stopped, the popup can export that scan as a local, versioned JSON bundle. Export is explicit and applies a second sanitization pass that removes secret/auth fields, strips URL query values, and pseudonymizes clear account identifiers before the file is created. Nothing is uploaded automatically.

The extension also includes a full-page **GBF Tool Dashboard** opened from the popup. It reads the latest completed local scan, normalizes it on demand, and exposes collection browsing plus an initial Eternal/Evoker 5★ planner with explicit `known` / `partial` / `unknown` states. The dashboard never performs GBF gameplay requests and does not persist a second normalized copy of account data.

Dashboard entity cards include user-triggered GBF Wiki links. Images currently use local placeholders: the runtime does not request Cygames/GBF asset-CDN images and does not hotlink GBFAL. The image resolver is intentionally allowlisted so a separately approved asset host can be added later without weakening the account boundary.

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

Then load the generated `dist/` directory as an unpacked Chrome extension. Use the popup for scan controls and **Open Dashboard** for the full inventory/planner tab.

## Planned milestones

1. Extension scaffold and local storage schema.
2. Passive response capture and endpoint discovery tooling.
3. Character / weapon / summon normalization.
4. Treasure/material inventory normalization.
5. Eternal and Evoker progression detection.
6. Collection browser and JSON import/export.
7. Upgrade requirement data model.
8. Single-goal and multi-goal planner.
