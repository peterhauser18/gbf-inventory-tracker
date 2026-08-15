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

Early scaffold. The first milestone is to capture and normalize account data safely before implementing the complete upgrade requirement dataset and planner UI.

The initial manifest intentionally requests only local storage permission. Network-observation permissions will be added when the capture implementation lands so the extension starts with the smallest possible permission surface.

## Safety / account risk

Granblue Fantasy does not provide a documented public account API for this use case. Any third-party extension may carry Terms-of-Service or account risk. The design goal here is deliberately conservative: passive observation only, no gameplay automation, no credential handling, and local-first storage.

## Development

```bash
npm install
npm run typecheck
npm run build
```

Then load the generated `dist/` directory as an unpacked Chrome extension.

## Planned milestones

1. Extension scaffold and local storage schema.
2. Passive response capture and endpoint discovery tooling.
3. Character / weapon / summon normalization.
4. Treasure/material inventory normalization.
5. Eternal and Evoker progression detection.
6. Collection browser and JSON import/export.
7. Upgrade requirement data model.
8. Single-goal and multi-goal planner.
