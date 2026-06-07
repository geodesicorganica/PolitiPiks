# Session Handoff

## Current Branch

- Branch: `codex/research-bucket-enrichment`
- Base: `origin/main` at `f90f195 Add Firestore emulator league flow coverage`
- Remote: `origin` -> `https://github.com/geodesicorganica/PolitiPiks.git`

## Merged Work

- PR #1 merged into `main` as `32d0d4b Port league-first sandbox MVP to main`.
- PR #2 merged into `main` as `ea0d2af Add 2024 research enrichment fallback`.
- PR #3 merged into `main` as `64a306f Hide missing league state contests`.
- PR #4 merged into `main` as `2e8bdaa Add league flow verification harness`.
- PR #5 merged into `main` as `f90f195 Add Firestore emulator league flow coverage`.
- The old nested `politipick/` directory remains an ignored local artifact; current project files live at repo root `C:\Projects\Politipiks`.

## Current Branch Work

- Expanded `scripts/enrich-research-2024.ts` from source-only fallback links to normalized bucket-backed research docs.
- Candidate docs now include `identity` and `electionsHistory` buckets for every 2024 candidate, plus campaign/profile buckets when URLs exist.
- Measure docs now include `summary` and `legalHistory` buckets for every 2024 measure, plus official/profile/fiscal buckets when source fields exist.
- README now documents the enriched research output and explicitly notes that pick research does not expose historical winners.
- Firestore research docs were force-refreshed after the script change.

## Current Data Reality

From `npm run verify-contests` after bucket enrichment:

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
- Candidate source-only fallbacks: `0`
- Measure research docs: `95`
- Measure research missing: `0`
- Measure source-only fallbacks: `0`
- Research buckets present:
  - `candidate.electionsHistory: 1549`
  - `candidate.identity: 1549`
  - `measure.legalHistory: 95`
  - `measure.summary: 95`
- Pickable options with no research/source fallback: `0`

Interpretation: contest coverage, deterministic league logic, authenticated Firestore rule coverage, and normalized fallback research buckets are in place for internal sandbox gameplay. The research is still derived from existing seed fields and source URLs; broader official/campaign source discovery remains future work.

## Validation Run For This Branch

- `npm run lint`
- `npm run lint:rules`
- `npm run build`
- `npm --prefix ingest run build`
- `npm run verify-league-flow`
- `npm run verify-firestore-league-flow`
- `npm run verify-contests`
- `npx tsx scripts\enrich-research-2024.ts --dry-run --force`
- `npx tsx scripts\enrich-research-2024.ts --force`

The Firestore emulator requires Java 11+ on `PATH`. In this session, a portable JRE under ignored `.tools/java` was used because winget JDK installers hung.

## Next Task

After this branch is merged:

1. Add UI/browser coverage for the visual league workflow once a stable auth strategy is available.
2. Start broader official/campaign source discovery for richer candidate/measure research beyond existing seed fields and URLs.
