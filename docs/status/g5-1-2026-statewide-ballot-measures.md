# G5.1 — 2026 statewide ballot measures

Status: local-only canonical pipeline. No Firebase/Firestore access, capture, write, activation, deployment, or production mutation was performed.

## Official-source coverage

| State | Authority | Status | Records |
| --- | --- | --- | ---: |
| CA | California Secretary of State | available | 14 |
| TX | Texas Secretary of State Elections Division | not_yet_published | 0 |
| NY | New York State Board of Elections | not_yet_published | 0 |
| FL | Florida Division of Elections | not_yet_published | 0 |
| GA | Georgia Secretary of State Elections Division | not_yet_published | 0 |

California's June 25, 2026 Secretary of State certification identifies 14 measures qualified for the November 3 general-election ballot.  The registry carries those official proposition numbers, legislative or Attorney General aliases, official titles, neutral descriptions, source URL, and review timestamps.  The other state entries are explicit authority checks, not a claim that no measures exist.

Each canonical document has a durable `2026-<state>-proposition-*` ID, statewide jurisdiction, official aliases, provenance digest, `yes`/`no` choices, an independent `publicationReady` flag, and `predictionReady` only when qualification is `on_ballot`.  Filed, circulating, pending, failed, and withdrawn entries would remain research-visible with an empty `eligibleOptions` list.

The measure policy is `canonical-2026-statewide-measure-lock-v1`. It reuses the approved conservative UTC safety instant without changing the federal policy or digest, and is explicitly not an official poll-close assertion.

## Offline certification

The CLI is Firebase-free for input and replay:

```powershell
npx tsx scripts/report-2026-statewide-ballot-measures.ts --input data/2026/statewide-ballot-measures.json --dry-run --verify-replay
```

Two local executions exited `0/0` and matched:

- input digest: `4067ad62bf849d83a3dea52b1602aaa519d3666ff14ee694b141cd37837f0764`
- plan digest: `fc5f7cae6a79f4364596b1ce7c4623f8cc37de950b48b2787c2e4f361591c1d2`
- research-ready: `14`; prediction-ready: `14`; duplicate IDs, invalid options, conflicts: `0/0/0`.

The report supports `--state`, `--input`, `--snapshot-in`, no-clobber `--snapshot-out`, `--dry-run`, and `--verify-replay`. Snapshot output is restricted to the ignored private migration-artifact directory.

## Safeguards

The nested UI surfaces authority and qualification status, provides explicit unavailable controls, and only enables officially eligible options. Firestore rules require a live 2026 measure, a timestamp before `closeAt`, `predictionReady=true`, and a pick included in `eligibleOptions` for both create and update. Local emulator tests cover eligible, catalog-only, invalid-option, and closed measure predictions.

## Verification

All completed gates exited `0`: `npm run test-ballot-measures`, `npm run test-free-sources`, `npm run test-canonical-publication`, `npm run verify-contests-logic`, `npm run lint`, `npm --prefix ingest run build`, `npm run build`, and the port-8081 `firebase emulators:exec` league-flow test. Nested: `npm run lint`, `npm run lint:rules` (one existing open-read warning), `npm run test-contest-catalog`, `npm run verify-firestore-league-flow`, `npm run verify-browser-league-flow`, and `npm run build`. The measure CLI deterministic replay exited `0/0`.

One initial nested browser/build attempt exited `1` because the new client-side availability guard had an unmatched parenthesis.  No data operation occurred; the guard was corrected, and the affected nested lint, browser, and build reruns exited `0`.

Remaining production gates are separate authorization for an eventual source refresh, publication write, and selector/cutover; none is implied by this local certification.
