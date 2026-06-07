# Session Handoff

## Current Branch

- Branch: `codex/firebase-emulator-league-coverage`
- Base: `origin/main` at `2e8bdaa Add league flow verification harness`
- Remote: `origin` -> `https://github.com/geodesicorganica/PolitiPiks.git`

## Merged Work

- PR #1 merged into `main` as `32d0d4b Port league-first sandbox MVP to main`.
- PR #2 merged into `main` as `ea0d2af Add 2024 research enrichment fallback`.
- PR #3 merged into `main` as `64a306f Hide missing league state contests`.
- PR #4 merged into `main` as `2e8bdaa Add league flow verification harness`.
- The old nested `politipick/` directory remains an ignored local artifact; current project files live at repo root `C:\Projects\Politipiks`.

## Current Branch Work

- Added Firebase emulator authenticated coverage in `scripts/verify-firestore-league-flow.ts`.
- Added `npm run verify-firestore-league-flow`, backed by `firebase emulators:exec --only firestore`.
- Added local Firestore emulator port config in `firebase.json`.
- Added `@firebase/rules-unit-testing` and local `firebase-tools` dev dependencies.
- Updated README with the emulator coverage command and Java prerequisite.

## Coverage Added

The Firestore emulator script verifies:

- Signed-in owner can create a league.
- Signed-in users can join by creating only their own member docs.
- League members can create league-scoped picks while simulation is open.
- Non-members cannot create league-scoped picks.
- Members can edit picks before simulation.
- Admin simulation scoring updates predictions, member scores, and league simulation state.
- League members can read other members' picks after simulation.
- Members cannot edit picks while simulated.
- Admin reset can reopen the league, reset scores, delete synthetic missing-pick records, and allow picks again.

## Current Data Reality

From the latest verifier run after research enrichment:

- Races: `519`
- Ballot measures: `95`
- States: `51`
- President races: `51`
- Senate races: `33`
- House races: `435`
- Actionable 2024 coverage gaps: `0`
- Data quality issues: `0`
- Candidate research docs: `1549/1549`
- Candidate research missing: `0`
- Candidate source-only fallbacks: `1549`
- Measure research docs: `95`
- Measure research missing: `0`
- Measure source-only fallbacks: `95`
- Pickable options with no research/source fallback: `0`

Interpretation: contest coverage, source-backed fallback research, deterministic league logic, and authenticated Firestore rule coverage are in place for internal sandbox gameplay.

## Validation To Run For This Branch

- `npm run verify-firestore-league-flow`
- `npm run verify-league-flow`
- `npm run lint`
- `npm run lint:rules`
- `npm run build`
- `npm --prefix ingest run build`
- `npm run verify-contests`

The Firestore emulator requires Java 11+ on `PATH`. In this session, a portable JRE under ignored `.tools/java` was used because winget JDK installers hung.

## Next Task

After this branch is merged:

1. Add UI/browser coverage for the visual league workflow once a stable auth strategy is available.
2. Start official/campaign research enrichment so research drawers move beyond source-only fallback links.
