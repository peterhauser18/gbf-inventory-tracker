# AGENTS.md

## Purpose

This repository contains **GBF Tracker**, a read-only analysis, inventory, progress, and roster tool for Granblue Fantasy.

The product may read data from the user's own account and calculate inventory state, material requirements, Eternal/Evoker progress, and roster capabilities.

It must not automate gameplay or perform account-changing actions.

## Product boundary

Allowed work includes:

- read-only account, inventory, character, weapon, summon, and roster access;
- parsing and normalizing GBF responses;
- material and progress calculations;
- Eternal and Evoker requirement evaluation;
- roster capability analysis;
- local caches, reports, APIs, and UI based on read-only data.

Do not add or use functionality that performs battles, starts quests, buys, trades, draws, upgrades, uncaps, consumes items or currencies, or changes party, crew, friend, profile, or other account state.

A `GET` request is not automatically safe. Endpoint behavior matters. Unknown or unverified GBF endpoints are potentially writing until demonstrated otherwise and must not be called against a real account without explicit approval.

## Secrets and account data

GBF sessions, cookies, authentication headers, tokens, browser profiles, and credentials are secrets.

Never commit, push, paste, log, fixture, or otherwise persist real secrets in Git, GitHub, issues, PRs, test output, or prompts.

Use local configuration or environment variables for credentials. Sanitize real responses before storing them as fixtures or examples. Avoid retaining unnecessary account identifiers or personal data.

Workers must not obtain or use real GBF credentials unless the task explicitly grants that access.

## Data handling

Internal GBF endpoints and response schemas may change. Parsers should depend only on fields required for the feature being implemented.

Preserve technical IDs where practical. Keep deterministic calculation logic separate from HTTP/session handling where this makes the code simpler to test.

Do not silently treat missing data as `0`, `false`, or absent when that could produce a wrong result. Prefer explicit `known`, `partial`, or `unknown` states.

Material shortfalls should be calculated from proven inventory amounts and clamped at zero.

## Implementation style

Prefer DRY, KISS, and YAGNI. Use the simplest existing solution that satisfies the full approved outcome.

Do not introduce abstractions, mocks, fixtures, compatibility layers, or infrastructure without a concrete need. Mocks and fixtures are appropriate for relevant deterministic tests, especially sanitized GBF response parsing.

Treat reproducible sub-causes of the same approved outcome as part of one bounded implementation rather than creating artificial follow-up scope.

## Before changing code

For an assigned issue or review fix, inspect only what is needed:

1. the issue, comments, and relevant PR information;
2. the current `main` head;
3. applicable `AGENTS.md` files;
4. directly competing or overlapping PRs;
5. relevant implementation files and tests.

Avoid broad repository exploration when the task can be resolved with narrower context.

## Git workflow

Implementation workers must:

- work in an isolated worktree;
- create a task branch from current `main`;
- stay within the approved issue scope;
- commit normally;
- push the task branch;
- open or update a Draft PR against `main`.

Do not amend, rebase, reset, force-push, push directly to `main`, merge, or deploy unless explicitly instructed by the controlling workflow.

## Testing

Run the smallest relevant deterministic tests for the changed behavior.

Prioritize tests for:

- realistic GBF response parsing;
- missing or optional fields;
- inventory and material calculations;
- Eternal/Evoker requirements;
- roster capability calculations;
- `known` / `partial` / `unknown` behavior;
- protection against writing GBF requests.

Prefer calculation tests without network access. Live-account tests are not a normal PR requirement.

Before finishing an implementation, run the relevant tests once, then `git diff --check`. For Python changes also run an appropriate `py_compile` check. Re-run only affected checks after further changes.

## Review severity

Findings should state the trigger, rough likelihood, impact, reversibility, and simplest sufficient correction.

`blocker` and `high` findings normally block merge. `medium` blocks only when likelihood and impact are both material. `low` and hardening findings should normally be documented without delaying merge.

Regardless of severity label, block work that plausibly exposes secrets, performs unintended GBF account writes, introduces serious persistent data risk, or violates the read-only product boundary.

## Merge and account activation

Repository changes are classified as either `repo-only` or `account-relevant`.

A merge of `account-relevant` code does not itself authorize real-account use. New authentication/session handling, new GBF endpoints, or new persistence of real account data require explicit activation approval in the issue before use with real credentials.

Previously approved read-only endpoints do not need a new activation cycle for internal refactors that do not materially change access or risk.

## Stop conditions

Stop and surface the issue only for material base drift, relevant failing tests, substantial scope/outcome expansion, realistic secret or account-data risk, unknown potentially writing GBF behavior, unintended account action, material deployment/persistence risk, missing recovery path, or materially conflicting instructions.

Do not stop for hypothetical edge cases, enterprise hardening, internal mechanism changes within the same outcome, or negligible risks without a plausible serious impact.

Assume unimportant details and keep the implementation focused.