# GBF Tracker

GBF Tracker is a **local-first, read-only Granblue Fantasy companion** for collection tracking, Eternal/Evoker planning, roster analysis, live combat observation, and personal raid/drop history.

The extension is intentionally passive: it observes a small allowlist of responses that **Granblue Fantasy already sent to your browser because of your own normal activity**. It does not farm, battle, start quests, buy, draw, upgrade, uncap, consume items, replay game requests, or expose your GBF login/session credentials.

> **Important:** read-only does not mean zero account risk. GBF Tracker is an unofficial third-party extension and Granblue Fantasy does not provide a documented public account API for this use case. The project therefore keeps the GBF interaction surface deliberately narrow and auditable.

## Table of contents

- [What GBF Tracker does](#what-gbf-tracker-does)
- [Passive and read-only by design](#passive-and-read-only-by-design)
  - [What happens when you open the Dashboard](#what-happens-when-you-open-the-dashboard)
  - [What the extension does not do](#what-the-extension-does-not-do)
  - [Verified response boundary](#verified-response-boundary)
  - [Tab and combat observation behavior](#tab-and-combat-observation-behavior)
- [Features](#features)
  - [Collection and inventory](#collection-and-inventory)
  - [Eternal and Evoker planning](#eternal-and-evoker-planning)
  - [Farming focus](#farming-focus)
  - [Roster capabilities](#roster-capabilities)
  - [Combat](#combat)
  - [Raids and drops](#raids-and-drops)
  - [Search, UI and local comparison](#search-ui-and-local-comparison)
  - [GBF Wiki integration and images](#gbf-wiki-integration-and-images)
- [Network and permission boundaries](#network-and-permission-boundaries)
- [Local data and privacy](#local-data-and-privacy)
- [Data quality](#data-quality)
- [Installation and development](#installation-and-development)
- [Using the extension](#using-the-extension)
- [Non-goals and current limitations](#non-goals-and-current-limitations)
- [Architecture](#architecture)

## What GBF Tracker does

GBF Tracker builds a cumulative local view of account facts that have actually been observed while you browse/play GBF normally. The Dashboard can then use those local facts to:

- browse owned Characters, Weapons, Summons, Treasures, Consumables/Tickets, and Weapon Stashes;
- calculate Eternal and Evoker progression and modeled material shortfalls;
- pin progression goals and aggregate their outstanding material requirements;
- surface public Wiki-backed farming sources alongside your own observed raid history;
- analyze roster utility such as Dispel, Delay, Gravity, Clear, Veil, Heal, Revive, Substitute, Shield, and Damage Cut;
- show live Combat analytics derived from already-received raid responses;
- keep local Raid history, favorites, notes, tracked drops, and personal observed drop rates;
- search local entities across the Dashboard from one command palette;
- export owned Character state to the GBF Wiki Collection Tracker format;
- compare a safe local analysis snapshot with a previously imported snapshot without restoring or overwriting account data.

The Dashboard remains usable without active observation. Existing local data can be inspected at any time.

## Passive and read-only by design

The central design rule is simple:

**GBF Tracker may read selected responses already received by the browser, but it must not cause gameplay/account HTTP requests or mutate game state.**

The extension does not inject a permanent GBF page observer. The manifest contains **no GBF content script and no `game.granbluefantasy.jp` host permission**. Loading the extension while visiting GBF does not patch the page's networking functions or add an automatic request sender.

### What happens when you open the Dashboard

`Open Dashboard` is the normal user-facing entry point.

1. The Dashboard tab is opened immediately.
2. If the popup can identify the currently active tab as `https://game.granbluefantasy.jp/...`, it asks the background service worker to start the existing explicit `chrome.debugger` observation for that exact tab.
3. Dashboard opening does **not** wait for observation to succeed. If no active GBF tab exists, or Chrome rejects the debugger attachment, the Dashboard still opens with the data already stored locally.
4. While observation is active, Chrome shows its debugger notification/banner.
5. Manual Start/Stop observation, sanitized diagnostic export, account reset, and local cleanup controls are grouped under **Developer** in the popup.

Observation remains explicitly bounded to the browser tab selected through this flow; it is not an always-on account crawler.

```text
User / GBF page                   GBF Tracker
-------------------------------   --------------------------------------
normal click / battle / browsing
        │
        ├─ normal GBF HTTP request ───────────────► Cygames
        │
        ◄─ normal GBF response ───────────────────
        │                                      │
        │                                      └─ if observation is active:
        │                                         inspect response metadata
        │                                         apply strict allowlist
        │                                         read already-received body
        │                                         sanitize / normalize locally
        │
Dashboard reads local normalized data ◄───────────┘
```

`Network.getResponseBody` is a Chrome DevTools Protocol read of a response the browser already received. It is **not** a second HTTP request to GBF.

### What the extension does not do

GBF Tracker runtime code must not:

- patch or replace GBF's `window.fetch`, `XMLHttpRequest.send`, WebSocket, EventSource, or similar request primitives;
- issue, replay, retry, prefetch, synthesize, redirect, or modify GBF HTTP requests;
- disable cache or load GBF resources through debugger resource-loading commands;
- click or invoke game actions through the DOM;
- start battles or quests;
- buy, trade, draw, upgrade, uncap, consume items/currencies, or change account/party/crew/friend/profile state;
- store passwords, session cookies, authorization headers, request bodies containing credentials, browser profiles, or login tokens;
- probe unknown GBF endpoints against a real account.

Public `gbf.wiki` metadata requests are a separate, account-independent network boundary described below.

### Verified response boundary

A GBF response is eligible for body reading only when the capture policy accepts all required conditions. In particular:

- the response must come from the exact HTTPS origin `game.granbluefantasy.jp`;
- the Chrome resource type must be XHR or Fetch;
- its path must match an already-reviewed account or combat endpoint family;
- variable paths are accepted only inside those known families, for example pagination or a concrete raid-result instance path;
- the same policy is checked again immediately before `Network.getResponseBody`.

Unknown/new GBF URLs are rejected before their bodies are read. There is no blanket `game.granbluefantasy.jp/*` body-capture rule.

Captured account facts are sanitized and normalized into a cumulative local database. Captured Combat facts are normalized into local live/session context and Raid history. Unsupported or ambiguous fields remain unavailable rather than being guessed.

### Tab and combat observation behavior

After explicit observation starts, account/inventory collection follows the currently active **verified GBF tab**, including when the user moves between browser windows. GBF Tracker keeps **one debugger target attached at a time** rather than attaching to every GBF tab.

Combat is more conservative. Once a concrete raid instance is being tracked, the combat context stays locked to that raid/source until the matching terminal result is observed. This prevents unrelated active-tab changes from mixing two fights into one Combat record. Account tracking can retarget again when the combat lock allows it.

This retargeting is still passive: tab changes affect only which already-received allowlisted responses can be observed. They do not trigger page loads, requests, or gameplay actions.

## Features

### Collection and inventory

The cumulative local account database supports:

- Characters;
- Weapons;
- Summons;
- Treasures/materials;
- Consumables and Tickets/other item families;
- Weapon Stashes;
- observed account/rank/status facts used by the Dashboard.

Collection views update from new observed family evidence instead of requiring a completed diagnostic scan. A partial page/filter observation does not erase previously known members of the same family.

The Character view can generate/open/copy a GBF Wiki Collection Tracker representation from locally observed Character master IDs and proven uncap state. Unsupported entries are omitted rather than guessed.

### Eternal and Evoker planning

The planner uses only normalized local account facts plus deterministic modeled requirements.

It can:

- determine supported next Eternal/Evoker progression targets from observed state;
- show modeled `Have / Required / Missing` material rows;
- clamp proven negative shortfalls to zero;
- keep missing/unsupported facts unavailable instead of treating them as zero;
- expand progression stages for detailed inspection;
- collapse already-reached Eternal uncap/transcendence stages so the remaining path is easier to scan;
- pin one target per modeled Eternal/Evoker;
- show deterministic next actions and aggregate material deficits across active pinned goals.

Pinned goals and UI preferences are local only. They do not change anything in GBF.

### Farming focus

For active pinned-goal deficits, Farming Focus combines two different evidence sources without conflating them:

- **Public GBF Wiki data** can provide possible raid/source references for a material.
- **Your local Raid history** can provide personal empirical evidence such as eligible observed runs, appearances, quantities, and a personal runs-remaining estimate when the evidence is sufficient.

Personal observed rates are never presented as official drop rates. Unknown inventory quantities, incomplete reward evidence, ambiguous raid matching, or unavailable Wiki metadata remain unavailable rather than becoming a recommendation.

A locally known raid/drop can be marked Important/Pinned from Farming Focus using the existing local tracking state. This still performs no GBF action.

### Roster capabilities

The Roster view joins locally observed owned Characters with account-independent public GBF Wiki metadata and exposes conservative capability filters for:

- Dispel;
- Delay;
- Gravity;
- Clear;
- Veil;
- Heal;
- Revive;
- Substitute;
- Shield;
- Damage Cut.

Capability negatives are shown only when public metadata coverage is sufficient. Missing or malformed Wiki data downgrades confidence instead of creating a false "does not have" result.

### Combat

Combat analytics are derived only from already-observed verified multiraid/result response families. GBF Tracker does not initiate the fight or any combat action.

The current live Combat experience includes, where directly supported by evidence:

- boss HP/state;
- current/observed party members including proven backline replacements;
- current HP/max HP for observed actors;
- own summon/supporter observations and observed use/cooldown state;
- party and per-character damage;
- Normal / Skill / Ougi / Echo / other supported breakdowns;
- SA / DA / TA counts and percentages from proven attack-mode samples;
- source-backed critical evidence;
- skill and Ougi use/damage analytics;
- contribution/Honors evidence and observed participant rows;
- direct observed turn evidence;
- action log and safe diagnostics;
- five selectable Combat presentation presets sharing the same normalized facts.

Ambiguous concurrent attack lanes or unsupported damage semantics are kept unclassified instead of being forced into Normal/Echo/Supplemental categories.

Participant display and some live correlation state are session-only and deliberately avoid retaining third-party user/viewer IDs.

### Raids and drops

Completed/left Raid records are stored locally and can include the normalized Combat facts and reward evidence that were actually observed.

The Raids view supports:

- newest-first history with Favorites promoted;
- local notes;
- raid/date/tracked-drop filtering;
- Important and Pinned drops;
- globally surfaced pinned-drop summaries;
- personal observed appearance rates using only eligible complete reward observations as the denominator;
- collapsed/expanded Combat and Drops sections per run;
- comparison of two local records for the same technical raid type when both sides contain the needed facts;
- normalized/sanitized JSON export/import paths for supported Raid data.

A complete reward response with no drops is a valid observed zero-drop run. A missing/incomplete reward response is not treated as one.

### Search, UI and local comparison

The Dashboard uses the Compact Analyst shell with responsive layouts and a persistent light/dark preference. Dark is the default first paint when no explicit preference exists.

`Ctrl+K` / `Cmd+K` opens the local command palette. It can search across:

- Eternals and Evokers;
- Characters;
- Weapons;
- Summons;
- Treasures;
- Consumables;
- Tickets;
- Weapon Stashes;
- weapons contained inside stashes.

Search is local-only. Search terms are not sent to GBF or GBF Wiki, and text-only results do not trigger image downloads.

Settings also provides a versioned **Local Analysis Snapshot** digest containing only a restricted summary such as capture time, rank summary, family counts, and quality states. Imported comparison data stays in memory for the current Dashboard tab and cannot restore or overwrite the local account database.

### GBF Wiki integration and images

Public Wiki integration is deliberately separate from GBF account observation.

Depending on the feature, the Dashboard can use public `https://gbf.wiki/*` data for:

- Character/Weapon/Summon identity metadata and images;
- Character roster capability metadata;
- Eternal/Evoker/material references;
- Farming source references;
- optional Raid/drop references;
- GBF Wiki Collection Tracker support.

Wiki requests use omitted credentials and no referrer where applicable. Account/session credentials are never forwarded to the Wiki, and account-owned entity lists are not used as remote query filters where bulk/account-independent data can be matched locally.

Wiki image downloads use one shared progressive scheduler rather than firing a large burst at page load. Successful public images are cached in extension-owned Cache Storage for reuse on later Dashboard sessions; the cache is bounded and can be cleared independently from account/combat data.

**Treasure icons use an even stricter rule:** the Dashboard does not request missing Treasure images from GBF/Cygames. When a proven Treasure asset has already been loaded by normal GBF activity, GBF Tracker may passively retain those already-loaded image bytes in its local cache keyed by technical item ID. A cache miss remains a placeholder and does not cause a GBF/CDN/Wiki Treasure-image request.

## Network and permission boundaries

The Manifest V3 extension currently requests:

| Permission | Purpose |
| --- | --- |
| `storage` | Store normalized local account state and extension preferences/state. |
| `activeTab` | Resolve the user-selected active tab for explicit observation workflows. |
| `debugger` | Observe already-received allowlisted network responses through Chrome DevTools Protocol. |
| Host permission `https://gbf.wiki/*` | Public, credential-free Wiki metadata/image/reference requests. |

Notably absent:

- no `game.granbluefantasy.jp` host permission;
- no GBF content script;
- no permanent MAIN-world fetch/XHR hook;
- no generic GBF request API owned by the extension.

There are therefore three intentionally separate data paths:

```text
1. GBF account/game traffic
   User/game initiates request -> GBF returns response -> optional debugger read -> local normalization

2. Public Wiki traffic
   Dashboard -> public gbf.wiki metadata/image request -> local public cache/UI

3. Local-only operations
   Dashboard/search/planner/comparison/history -> local normalized stores only
```

## Local data and privacy

GBF Tracker is local-first. It does not automatically upload account or Combat data.

Locally stored data can include:

- cumulative normalized account/inventory/roster facts;
- observation timestamps/family freshness;
- normalized Combat/Raid history and drop preferences;
- local notes/favorites/pins;
- UI/theme/goal preferences;
- bounded sanitized diagnostic scan data;
- public Wiki image cache;
- passively retained proven Treasure image bytes.

The project deliberately excludes GBF passwords, session cookies, Authorization headers, login tokens, browser profiles, and raw credential-bearing request bodies from normal persistence.

Diagnostic scans are bounded to the most recent records and can be cleared independently. A completed stopped observation can be exported only through an explicit **Export sanitized scan** action. Export applies another deterministic sanitization pass and creates a local JSON download; nothing is uploaded automatically.

The popup also exposes local cleanup paths for diagnostic storage and for removing diagnostic/combat data while preserving the normalized account snapshot.

## Data quality

Internal account/planner/combat logic distinguishes:

- `known` — the needed fact is directly supported with sufficient coverage;
- `partial` — some relevant evidence exists but the result may be incomplete;
- `unknown` — the needed fact has not been proven.

The normal UI avoids exposing raw internal quality jargon everywhere, but these states still drive calculation safety.

Examples:

- an unobserved material is not silently treated as quantity `0`;
- a filtered or incomplete roster page does not prove that missing entities are unowned;
- an incomplete reward record is not counted as a zero-drop run;
- incomplete Combat attribution does not become invented per-character damage;
- a failed Wiki lookup does not become a known negative capability/source claim.

## Installation and development

Requirements:

- **Node.js 22.12 or newer**;
- Chromium-based browser with unpacked-extension support (Chrome/Edge during current development).

```bash
npm install
npm test
npm run typecheck
npm run build
```

For development with rebuild-on-change:

```bash
npm run dev
```

Load the generated `dist/` directory as an unpacked extension from the browser's extension developer page.

## Using the extension

Typical flow:

1. Build/load `dist/` as an unpacked extension.
2. Open Granblue Fantasy normally.
3. Open the GBF Tracker popup and press **Open Dashboard**.
4. The Dashboard opens immediately. If the current active tab is a verified GBF tab, read-only debugger observation starts/reuses in parallel.
5. Browse or play normally. Only allowlisted responses produced by that normal activity can update the local account/Combat stores.
6. Inspect Collection, Goals, Roster, Combat, Raids, or other Dashboard views as needed.
7. Use **Developer → Stop observation** when you no longer want new GBF responses to be observed.

You can also open the Dashboard with no active GBF tab to inspect existing local data without starting observation.

## Non-goals and current limitations

GBF Tracker is not a bot, macro system, farming client, account automation framework, or request replay tool.

Current constraints include:

- the local database can only learn facts from supported response families that were actually observed;
- responses that completed before debugger observation began cannot be reconstructed without causing another request, and GBF Tracker intentionally does not do that;
- internal GBF response schemas can change, so parsers intentionally depend on as few required fields as practical;
- unsupported Eternal/Evoker requirements or currencies remain unavailable instead of being guessed;
- public Wiki availability/schema changes can temporarily make metadata, images, farming references, or capability analysis unavailable without affecting the locally observed account facts;
- real-account use of newly introduced endpoint/session/persistence behavior requires explicit review/activation under the repository workflow rather than being implied by merge alone.

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the detailed capture lifecycle, target-retargeting rules, storage boundaries, public Wiki/image caches, normalization flow, and planner/UI separation.