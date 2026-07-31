# G5.6 — Wave D fixture providers

Status: **completed locally on 2026-07-30**. This record is deliberately not a production-read, Firestore, shadow-copy, activation, deployment, or cutover authorization.

## Safety contract

The Wave D runner is fixture-only and Firebase-free. It accepts reviewed evidence and small, projected provider fixtures; it neither initializes Firebase nor contacts Firestore. `--fetch` is accepted for runner compatibility but reports that no mutable official endpoint is fetched. Private `--snapshot-out` and `--report-out` files are limited to `.artifacts/private/canonical-migration/` and use exclusive create semantics.

Each fixture retains an evidence digest, official source URL, publication phase, source markers, retrieval/review dates, and minimal output records. It rejects digest mismatch, unsafe output paths, malformed snapshots, duplicate record IDs within a fixture, invalid phases, and non-`ineligible` picks. A malformed fixture becomes an isolated `schema_drift` state rather than silently producing records.

## Current coverage

Fixture-backed states are AL, IL, IA, MD, ME, and SD. The six fixtures cover the ten previously proven Wave D capabilities: five candidate-list, two gubernatorial, and three statewide-measure surfaces. All candidate and measure records remain `pickEligibility: ineligible`; a source list is not an eligibility or final-ballot assertion.

South Dakota’s source record was corrected during direct official review: the valid ballot-question URL includes `2026%20Election%20Information` in its path. The fixture projects the four items under the official **2026 General Election Ballot Measures** heading only. It excludes potential and approved-for-circulation items. The candidate URL is the 2026 general list (`eid=774`), not the primary list.

The remaining states produce no unsupported records. AR, CO, HI, ID, NV, PA, TN, and WI are explicit blocked results; the other reviewed mutable sources are `reviewed-manual` with their evidence status, reason, and next-review date retained.

## Determinism and verification

The provider test deliberately sets an invalid Firebase configuration value before running the pure offline builder. It verifies shuffled inputs are digest-stable, meaningful input and plan changes alter the appropriate digest, malformed and duplicate fixtures drift fail-closed, unresolved identity mappings remain visible, and every emitted pick stays ineligible.

Commands run locally so far:

```text
npx tsx scripts/lib/waveDStateProviders.test.ts
npx tsx scripts/audit-2026-wave-d-state-providers.ts --all-wave-d --verify-replay
```

Latest unchanged replay digest set:

- input: `998d750a2af15f144cfd9c8f781b1fe5d3df52230fbee1f545d8fc45a1214ffa`
- evidence: `0f94b249eb6d5e4aad979b57508806865125886777950bd2fd5d29bc4cef8c6d`
- plan: `1ff5479f4c0408e387ce73e0cc97583f9e5d0a5df4b6e7888f0d082393837d71`

The corresponding count is 36 states, 6 fixture-backed states, 30 manual-or-blocked states, 5 candidate-list capabilities, 2 governor capabilities, 3 statewide-measure capabilities, and 6 projected records.

Completed local gates (all exit `0`):

```text
npm run lint
npm run lint:rules
npm run build
npm run test-free-sources
npm run test-ballot-measures
npm run test-ballot-eligibility
npm run test-state-source-registry
npm run test-wave-b-state-providers
npm run test-wave-c-pdf-providers
npm run test-wave-d-source-resolution
npm run test-wave-d-state-providers
npx tsx scripts/audit-2026-state-election-source-registry.ts --verify-replay
npx tsx scripts/audit-2026-wave-d-source-resolution.ts --all-wave-d --verify-replay
npx tsx scripts/audit-2026-wave-d-state-providers.ts --all-wave-d --verify-replay --fetch
npm --prefix politipick/.remote-source run lint
npm --prefix politipick/.remote-source run lint:rules
npm --prefix politipick/.remote-source run verify-close-at-migration
npm --prefix politipick/.remote-source run test-contest-catalog
npm --prefix politipick/.remote-source run build
npm --prefix politipick/.remote-source run verify-firestore-league-flow
npm --prefix politipick/.remote-source run verify-browser-league-flow
```

The nested rules linter emitted one existing open-read warning and no errors. The parent `npm run verify-firestore-league-flow` and `npm run verify-browser-league-flow` are informational only for G5.6 and are not acceptance gates. Both launchers exited `1` before a test ran because an unrelated Java Firestore Emulator already owned `127.0.0.1:8080`. No test ran, and PID 34584 was not attached to, cleared, stopped, or otherwise modified.
