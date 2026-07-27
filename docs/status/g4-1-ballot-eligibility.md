# G4.1 — source-backed 2026 ballot eligibility

Status: local implementation and certification complete.  No production read, write, capture, activation, deployment, deletion, or push was performed.

## Scope and safety boundary

G3.4's canonical 2026 catalog is preserved.  This layer consumes only the existing private G3.3 publication snapshot and a local, versioned ballot-evidence input.  It never initializes Firebase unless a future caller explicitly requests the adapter's `--fetch` path; the normal CLI defaults to `--dry-run` with an explicit snapshot and local input.

The source contract is schema version 1.  Each resolved entry includes the canonical race ID, FEC candidate ID, qualification status, ballot name and party when published, official authority and HTTPS URL, source-publication date when available, retrieval and review timestamps, and a SHA-256 evidence digest.  The digest is recomputed during validation.  Snapshot projections remain privacy-minimal and do not include user or league identifiers.

FEC records establish only `filed`, `visible`, `ineligible` candidate catalog data.  They never establish an active candidacy, ballot qualification, or pick eligibility.  A candidate becomes eligible only after a valid official ballot record resolves deterministically to its canonical FEC ID.

## Matching and fail-closed policy

The Georgia slice accepts an explicit FEC ID, or an exact normalized ballot-name plus party match.  It rejects missing, ambiguous, conflicting, duplicate, retired/unmapped, malformed, and tampered evidence.  Duplicate identical records and conflicting qualification statuses are distinct blockers; neither makes a candidate eligible.  Withdrawn and ineligible official entries are retained as evidence but are not allowlisted.

Every canonical race remains browseable even with no candidates or no eligible candidates.  It exposes an empty `eligibleCandidateIds` list and the UI shows **Picks not yet available**.  Existing predictions are audited against a changed allowlist; the planner reports any would-be-invalid prediction and never mutates it.  Firestore continues to enforce the race allowlist for both prediction creation and updates.

## Georgia 2026 general-election adapter

The first production-shaped adapter is limited to Georgia, 2026, and the general election.  Its only configured authority is the Georgia Secretary of State Elections Division's [candidate qualifying page](https://sos.ga.gov/candidate-qualifying-elected-office).  That page concerns qualifying, not a final November ballot.  Georgia's [2026 general-election information](https://georgia.gov/georgia-general-election-2026) says sample ballots are available beginning September 19; consequently the checked local input is `not_yet_published` with zero candidate records.  No candidate is eligible until an official, final-list-compatible source is available and independently reviewed.

The adapter supports an injected HTML fetcher for parser tests and has no automatic network activity.  A future explicit `--fetch` uses one HTTP request and returns `not_yet_published` unless it can validate the expected authority page; it cannot infer eligibility from it.

## Offline replay result

The existing snapshot was replayed locally with:

```powershell
npx tsx scripts/report-2026-ballot-eligibility.ts --year 2026 --state GA --snapshot-in .artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json --dry-run --report-out .artifacts/private/canonical-migration/g4-1-ga-ballot-eligibility-report.json
```

Exit code: `0`.

| Field | Result |
| --- | --- |
| Source status | `not_yet_published` |
| Source records / resolved / eligible | `0 / 0 / 0` |
| Catalog readiness | `true` |
| Prediction readiness | `false` |
| Prediction-ready races | `0` |
| Existing predictions evaluated / would be invalid | `0 / 0` |
| Evidence digest | `d01e783cb288ecfc2a9218b8f0679686c40f12159045f92b965c4605ae963b28` |
| Offline publication plan digest | `bd2066d89a522ae8bfa0f633716813226dfb1295c60c1bd7deb1de4f5a035b61` |

The private snapshot and report are intentionally not tracked or reproduced here.

## Changed files

- `data/2026/ballot-eligibility/ga-2026-general.json`
- `scripts/lib/ballotEligibility.ts` and its unit/CLI tests
- `scripts/lib/gaBallotEligibilityAdapter.ts` and adapter test
- `scripts/report-2026-ballot-eligibility.ts`
- `scripts/lib/canonicalPublication.ts` and publication test
- nested application types, browser fixture/spec, and Firestore emulator test

## Verification

All commands below exited `0`.

| Workspace | Command | Exit |
| --- | --- | --- |
| Parent | `npm run test-ballot-eligibility` | 0 |
| Parent | `npm run test-canonical-publication` | 0 |
| Parent | `npm run test-canonical-publication-cli` | 0 |
| Parent | `npm run test-canonical-activation` | 0 |
| Parent | `npm run verify-contests-logic` | 0 |
| Parent | `npm run test-free-sources` | 0 |
| Parent | `npm run lint` | 0 |
| Parent | `npm --prefix ingest run build` | 0 |
| Parent | `npm run build` | 0 |
| Parent | `npx firebase emulators:exec --config scripts/firebase.emulator-test.json --only firestore "npx tsx scripts/verify-firestore-league-flow.ts"` | 0 |
| Nested app | `npm run lint` | 0 |
| Nested app | `npm run lint:rules` | 0 (one existing open-read warning) |
| Nested app | `npm run test-contest-catalog` | 0 |
| Nested app | `npm run verify-firestore-league-flow` | 0 |
| Nested app | `npm run verify-browser-league-flow` | 0 |
| Nested app | `npm run build` | 0 |

The parent emulator used its isolated configuration on port 8081.  Both emulator suites are local-only; their expected permission-denied lines are assertions of rejected writes.  The browser suite proved a verified-candidate control becomes enabled and records a local fixture pick, while the catalog-only control remains disabled.  Production builds emitted only the existing large-chunk advisory.

The same private G3.3 snapshot replayed twice locally with exit codes `0/0`; both reports produced evidence digest `d01e783cb288ecfc2a9218b8f0679686c40f12159045f92b965c4605ae963b28`, plan digest `bd2066d89a522ae8bfa0f633716813226dfb1295c60c1bd7deb1de4f5a035b61`, `catalogReady=true`, and `predictionReady=false`.

## Remaining production gates

1. Obtain and independently review an official Georgia general-election ballot list; qualifying, campaign, FEC, Ballotpedia, news, and name-only data are insufficient.
2. Run the explicit adapter/import against that official source, resolve every candidate deterministically, and separately certify the resulting progressive readiness.
3. Audit any existing predictions made in newly affected races.  Do not alter a prediction automatically.
4. Separate authorization is required for any shadow write, selector activation, rollback, production read, deployment, or cutover.
