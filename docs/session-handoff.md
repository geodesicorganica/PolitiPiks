# Session Handoff

## Current Branch

- Branch: `codex/league-flow-harness`
- Base: `origin/main` at `64a306f Hide missing league state contests`
- Remote: `origin` -> `https://github.com/geodesicorganica/PolitiPiks.git`

## Merged Work

- PR #1 merged into `main` as `32d0d4b Port league-first sandbox MVP to main`.
- PR #2 merged into `main` as `ea0d2af Add 2024 research enrichment fallback`.
- PR #3 merged into `main` as `64a306f Hide missing league state contests`.
- The old nested `politipick/` directory remains an ignored local artifact; current project files live at repo root `C:\Projects\Politipiks`.

## Current Branch Work

- Added shared pure league sandbox logic in `src/lib/leagueSandbox.ts`.
- Refactored `src/pages/Leagues.tsx` to use shared contest summaries, progress, state grouping, result rows, and result stats.
- Refactored `src/pages/Admin.tsx` to use shared eligible-contest and simulation scoring logic while keeping Firestore writes in the admin page.
- Added `scripts/verify-league-flow.ts` and `npm run verify-league-flow`.
- Updated README with the deterministic league-flow verification command.

## Key Product Decisions

- MVP is league-first, not global-ranking-first.
- Internal testing uses 2024 historical sandbox data.
- Public MVP moves to 2026 data after mechanics and UX are proven.
- Default signed-in experience is Leagues.
- Browse Contests is view-only for MVP.
- Global rankings and global pick-making are out of scope.
- League picks are separate from global picks and scoped by `leagueId`.
- Picks save immediately and stay editable until admin simulates results for that league.
- Admin simulation is per league, scores all eligible sandbox contests, and can be reset.
- Correct pick is 1 point; missing picks score 0 and are tracked separately.
- Research drawers are lazy-loaded, source-backed, and do not use AI-generated summaries in MVP.

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

Interpretation: contest coverage and source-backed fallback research are complete enough for internal sandbox gameplay. The research is still fallback-level, not normalized official/campaign enrichment.

## Validation To Run For This Branch

- `npm run verify-league-flow`
- `npm run lint`
- `npm run lint:rules`
- `npm run build`
- `npm --prefix ingest run build`

Browser verification is still useful after this branch, but the current coverage target is deterministic logic coverage that does not depend on Google auth, an occupied port, or the in-app browser controller.

## Next Task

After this branch is merged:

1. Add an authenticated browser path or Firebase-emulator test for create/join/pick/reset interactions.
2. Start official/campaign research enrichment so research drawers move beyond source-only fallback links.
