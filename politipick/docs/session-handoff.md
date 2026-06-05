# Session Handoff

## Current Branch

- Branch: `codex/league-overview-2024-seeding`
- Latest pushed commit: `0ca0dbf Add league sandbox simulation and 2024 contest coverage`
- Remote: `origin` -> `https://github.com/geodesicorganica/PolitiPiks.git`

## Work Preserved In This Session

- Updated `docs/league-first-mvp.md` earlier as the product/data contract for the league-first MVP.
- Added and expanded `scripts/verify-contests.ts` and `npm run verify-contests`.
- Updated README docs with 2024 sandbox seeding and read-only verification instructions.
- Current working tree has uncommitted follow-up work for league-first navigation, read-only Browse Contests, research coverage verification, MEDSL candidate cleanup, all-at-large House loading, all-House league state rendering, and lazy research drawer UI.

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

- Races: `519`
- Ballot measures: `95`
- States: `51`
- President races: `51`
- Senate races: `33`
- House races: `435`
- Actionable 2024 coverage gaps: `0`
- Data quality issues: `0`
- Candidate research docs: `0/1549`
- Measure research docs: `0/95`

Interpretation: current contest data is structurally clean and complete enough for internal sandbox gameplay. Research subdocuments are modeled, allowed by rules, surfaced in the UI, and reported by the verifier, but still need an ingest/enrichment pass before public readiness.

## Validation Already Run

- `npm run lint`
- `npm run build`
- `npm --prefix ingest run build`
- `npm run verify-contests`
- Browser smoke test on `http://localhost:3000`: no console errors in signed-out render; Global nav and dead Statewide tab absent.

## Next Task

Continue from `docs/league-first-mvp.md`.

Recommended next implementation task:

1. Commit and push the current completed slice if the diff review looks good.
2. Start research enrichment ingest/source discovery for candidate and measure subdocuments.
3. Add authenticated browser coverage for the league pick flow, including House tab/state House rendering and research drawer empty states.
