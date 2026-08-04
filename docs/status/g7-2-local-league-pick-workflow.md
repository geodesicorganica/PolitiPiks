# G7.2 — Local league and pick workflow

Status: **certified locally on 2026-08-03**. This goal did not access production Firebase/Firestore, call an external enrichment API, rebuild upstream G6 evidence, deploy, activate a selector, delete data, push, or change branches. The certified G7.1R bundle and loopback-only emulator boundary were preserved.

## Synchronization preflight

- Parent G7.1R commit: `a2c3a7cb899f7e7ca394ce67fc7ab0bf9c3d91a1` (`feat: certify local 2026 product bundle`).
- Nested-app G7.1R commit: `ed87a4bf6ad060903d3af13e64c147466ae5fe16` (`feat: surface canonical election evidence`) in the ignored separate repository at `politipick/.remote-source`.
- Certification record: `docs/status/g7-1-local-research-surfacing.md` was present and reported 470 races, 14 measures, 2,384 candidate-research documents, 14 measure-research documents, 470 metrics, one selector, and 3,353 total documents.
- G7.1R was neither rerun nor reimplemented. Only its deterministic builder replay was invoked as an acceptance gate.

## Implemented workflow

The nested app now provides combined state, office/contest, race-versus-measure, and prediction-readiness filters with an explicit clear control. Filter controls are labeled, keyboard-usable, responsive from one to five columns, and distinguish initial loading, source error, unavailable catalog, and filter-empty states. No fallback catalog is rendered on a source failure. Federal cards state that picks remain unavailable until an official candidate allowlist is certified.

League creation now writes the league and owner membership in one Firestore batch, preventing a partial orphan league. Invite codes are normalized before lookup, a successful join opens the joined league directly, and accessible status/error feedback accompanies both flows. The league catalog derives measure buttons from `eligibleOptions`; it no longer assumes hard-coded choices. A user can create and then update a measure prediction before `closeAt`.

The mobile browser workflow uses the exact 14 certified California measure IDs and their certified `no`/`yes` choices. It creates a local league, joins by invite, combines all four filters, finds Proposition 1 among all 14 measures, creates a `yes` pick, updates it to `no`, proves a contradictory filter-empty state and reset, and verifies the federal allowlist explanation at a 390-by-844 viewport.

All federal races remain catalog-visible and have zero prediction-ready races in the certified bundle. Test-only browser and emulator fixtures exercise an eligible race control, non-allowlisted and invalid choices, withdrawn/removed eligibility, changed eligibility, source-error readiness, a closed target, and legacy federal IDs after canonical activation. These fixtures exist only in nested test files; none was added to the certified product bundle or treated as official eligibility.

Rules require the current target to be open and live, the canonical federal generation to be active, the race readiness contract to permit picks, and the candidate to remain in `eligibleCandidateIds`. For non-federal compatibility records that predate `predictionReady`, the existing allowlist remains authoritative unless readiness is explicitly false. Measures continue to require `predictionReady=true` and membership in `eligibleOptions`. Client checks additionally reject candidates marked withdrawn, inactive, unresolved, or ineligible.

Selector-driven reads, valid non-federal contests, ballot measures, and the G7.1 canonical evidence panels remain intact.

## Certified bundle replay

`npm run test-local-product-bundle` exited `0`. Two consecutive direct `--verify-replay` executions also exited `0` and each reported:

| Field | Result |
| --- | --- |
| Races / measures | `470 / 14` |
| Candidate / measure research | `2,384 / 14` |
| Metrics / selectors / total | `470 / 1 / 3,353` |
| Prediction-ready races / measures | `0 / 14` |
| Duplicate paths / orphans / unresolved references / leakage | `0 / 0 / 0 / 0` |
| Input digest | `d674f0cdf194ba800e5bfb9babd1b2b3766b8ae84cf642838df0c1d1fd91384d` |
| Evidence digest | `0c6ad4b9c80601fdbcfa5d26a861a706325b021adac94f2604bdaac1d860ca09` |
| Plan digest | `9c04ce1f256501d9f300cebb700d1d16ea742b1bd5ead642b850e3f0f2c282be` |
| Bundle digest | `41f5c282d05cb13af8a6711781594acabbc48dceb5b0eed315cb36e1dcf6854f` |

## Existing-prediction audit

`npm run audit-g7-2-predictions` is Firebase-free and read-only. Against the certified private publication snapshot and G7.1 bundle it scanned six preserved predictions. All six target 2024 historical contests and are outside the live-2026 bundle; zero live-2026 predictions were present, zero incompatible references were found, zero duplicate prediction IDs were found, and zero predictions were rewritten. This is an offline audit of the certified snapshot, not a claim about current production state; the hard exclusion prohibited a fresh production read.

## Verification

Every command below exited `0`.

### Parent repository

- `npm run test-local-product-bundle`
- `npx tsx scripts/build-2026-local-product-bundle.ts --verify-replay` (run twice; identical output digests)
- `npm run audit-g7-2-predictions`
- `npm run lint`
- `npm run build`
- `git diff --check`

### Nested app

- `npm run lint`
- `npm run lint:rules`
- `npm run test-contest-catalog`
- `npm run test-canonical-evidence`
- `npm run verify-firestore-league-flow` using `scripts/firebase.emulator-test.json` on alternate Firestore port 8082
- `npm run verify-browser-league-flow` (two tests passed)
- `npm run build`
- `npm run verify-deployment-readiness`
- `git diff --check`

Expected warnings were retained: rules lint reports the existing open read for `/test/connection`; the Firestore emulator reports its standard single-database/config notices and expected permission-denied traces; Vite reports the existing large-chunk advisory; and the browser development server reports the existing missing Gemini key and occupied HMR WebSocket port while the HTTP test server and both tests pass. No warning caused credential use or production initialization.

## Commits and remaining boundary

- Nested G7.2 implementation commit: `8a77a316eabb4f1f6bd1dfae8b790942c57f7d97`.
- Parent G7.2 implementation commit: `387b97b37ffa89c0ccc5fd7af37cc47f09fe0264`.
- The documentation commit containing this record is reported in the final handoff because a Git commit cannot embed its own hash.

Production access, fresh production prediction audit, official federal candidate allowlists, deployment, selector activation, and rollout/rollback operations remain separately authorized work. G7.3 is next and is limited to release/rollback runbook readiness.
