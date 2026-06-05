# Session Handoff

## Current Branch

- Branch: `codex/league-overview-2024-seeding`
- Previous pushed commit: `0b73ba0 Add league overview and 2024 contest seeding`
- Remote: `origin` -> `https://github.com/geodesicorganica/PolitiPiks.git`

## Work Preserved In This Session

- Added `docs/league-first-mvp.md` as the product/data contract for the league-first MVP.
- Added `scripts/verify-contests.ts` and `npm run verify-contests`.
- Updated `README.md` with read-only contest verification instructions.

## Key Product Decisions

- MVP is league-first, not global-ranking-first.
- Internal testing uses 2024 historical sandbox data.
- Public MVP moves to 2026 data after mechanics and UX are proven.
- Default signed-in experience should be Leagues.
- Browse Contests is view-only for MVP.
- Global rankings and global pick-making are out of scope.
- League picks are separate from global picks and scoped by `leagueId`.
- Picks save immediately and stay editable until admin simulates results for that league.
- Admin simulation is per league, scores all eligible sandbox contests, and can be reset.
- Correct pick is 1 point; missing picks score 0 and are tracked separately.
- Results view should include leaderboard, contest-level pick history, and stats: biggest upset pick, most consensus miss, best state, unique correct picks, and perfect states.
- Research drawers are required in pick views, lazy-loaded, and source-backed.
- No AI-generated research summaries in MVP.
- Provenance should be stored in the data model but not shown in the MVP UI.

## Current Data Reality

From `npm run verify-contests` against Firestore:

- Races: `84`
- Ballot measures: `0`
- States: `51`
- President races: `51`
- Senate races: `33`
- Data quality issues: `0`
- State-view coverage gaps: `120`

Interpretation: current data is structurally clean, but the 2024 sandbox still needs House races and ballot measures before the requested league/state/category UX feels complete.

## Validation Already Run

- `npm run lint`
- `npm run verify-contests`

## Next Task

Continue from `docs/league-first-mvp.md`.

Recommended first implementation task:

1. Update TypeScript types and Firestore rules for league sandbox simulation state, contest result fields, missing-pick accounting, and research subdocuments.
2. Then expand ingest/seed to include 2024 House and ballot measures with actual winner/pass/fail result fields.
3. Then extend `verify-contests` to report research coverage once research ingest exists.
