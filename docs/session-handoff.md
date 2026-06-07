# Session Handoff

## Current Branch

- Branch: `codex/league-results-verification`
- Base: `origin/main` at `ea0d2af Add 2024 research enrichment fallback`
- Remote: `origin` -> `https://github.com/geodesicorganica/PolitiPiks.git`

## Merged Work

- PR #1 merged into `main` as `32d0d4b Port league-first sandbox MVP to main`.
- PR #2 merged into `main` as `ea0d2af Add 2024 research enrichment fallback`.
- The old nested `politipick/` directory remains an ignored local artifact; current project files live at repo root `C:\Projects\Politipiks`.

## Current Branch Work

- Fixed the league state view so missing offices do not render empty placeholder cards.
- `src/pages/Leagues.tsx` now renders only loaded statewide races, House races, and measures for a selected state.

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

## Validation Already Run

- `npm run lint`
- `npm run lint:rules`
- `npm run build`
- `npm --prefix ingest run build`
- `npm run verify-contests`
- Research enrichment write to Firestore with `--force`

For the current branch edit:

- `npm run lint`
- `npm run lint:rules`
- `npm run build`

Browser verification is still pending. The in-app browser controller failed twice with a Windows sandbox process setup error, and the local Express dev server could not start because port `3000` was already occupied by another process returning `404` for `/api/health`.

## Next Task

Recommended next implementation task:

1. Commit and push `codex/league-results-verification` after diff review.
2. Add authenticated browser coverage or a deterministic test harness for the league pick flow:
   - create/join league
   - House tab renders all House contests
   - state view omits missing-office placeholders
   - research drawer loads source-only fallback links
   - simulated leagues lock picks and show results
3. Start official/campaign research enrichment so research drawers move beyond source-only fallback links.
