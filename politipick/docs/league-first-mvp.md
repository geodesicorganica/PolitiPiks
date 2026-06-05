# League-First MVP Spec

## Status

- Date: 2026-06-05
- Scope: League-first MVP using 2024 historical sandbox data for internal testing, then 2026 data before public MVP.
- Decision basis: Requirements grilling session covering league flow, contest coverage, sandbox scoring, results, research drawers, and data verification.

## Product Direction

Politipick should prove the league gameplay loop before investing in global rankings or public discovery.

The MVP loop is:

1. User signs in.
2. User lands on Leagues.
3. User creates or joins a private league by invite code.
4. User makes league-scoped picks across available 2024 sandbox contests.
5. Admin simulates 2024 results for that league.
6. League leaderboard, pick statuses, and results analytics update.
7. Admin can reset the simulation for repeated internal testing.

Global rankings are out of scope for this MVP version. A browse-only contest surface can remain, but pick-making belongs inside a league.

## Data Mode

The MVP uses a hybrid roadmap:

- Internal testing uses 2024 historical data.
- Public MVP moves to 2026 data after mechanics and UX are proven.

For 2024, the app should present the data as a historical sandbox with pre-election mechanics:

- The UI should be clear that 2024 is test/sandbox data.
- Picks are allowed in the sandbox.
- Historical close dates do not lock picks.
- Picks remain editable until admin simulates results for the league.
- Once simulated, picks are locked for that league until admin resets simulation.

## Navigation

Primary tabs for league-first MVP:

- Leagues
- Browse Contests
- Admin, only visible to admins

Behavior:

- Default signed-in tab is Leagues.
- Hide or remove the global leaderboard tab.
- Browse Contests is view-only for MVP.
- Dashboard is not part of the primary MVP loop unless it becomes league-oriented later.

## League Model

League setup:

- New leagues include all available sandbox contests by default.
- Owners do not choose categories or states for MVP.
- Users join by invite code only.
- No public league browsing in MVP.

Pick scope:

- League picks are separate from global picks.
- Predictions use `leagueId` to scope picks.
- A user's pick in one league does not affect another league.

Visibility:

- Members cannot see other members' picks before simulation.
- After simulation, member picks can be revealed as part of the results view.

## Contest Coverage

The 2024 sandbox should include:

- President
- Senate
- House
- Ballot measures where available

Governor is optional for 2024 because most states do not have gubernatorial elections in that cycle. Missing offices should not render as empty placeholders.

State view behavior:

- Render only offices and measures that exist for the selected state.
- President appears when available.
- Senate appears when available.
- House appears as a module that can contain all congressional districts.
- Ballot measures appear in a state-specific measures section when available.
- Governor appears in future cycles or states where it exists.

Category view behavior:

- Category tabs show all contests by default across all states.
- The left state list filters the current category but is not required.
- Ballot measures have both a top-level category tab and state-view placement.
- House category shows all House contests, not a curated single race per state.

## Pick UX

Pick mechanics:

- Picks save immediately when selected.
- A saved state must be visible on the selected option.
- Users can change picks until the league simulation runs.
- Missing picks remain allowed before simulation.

Progress:

- League view should show pick progress prominently.
- Progress includes total completed picks and missing sections.
- Missing states/categories should be easy to identify.

Simulation readiness:

- Admin can simulate even if members have incomplete picks.
- Admin should see a warning with incomplete-pick counts before simulation.
- Missing picks score 0 and are tracked separately from incorrect picks.

## Sandbox Scoring

Simulation:

- Admin simulation is per league.
- Simulation scores all eligible 2024 sandbox contests for that league.
- Simulation uses actual 2024 result fields stored on contest documents.
- Results are not fetched from external sources at simulation time.

Scoring output:

- Correct pick: 1 point.
- Incorrect pick: 0 points.
- Missing pick: 0 points and counted as missing.
- Simulation updates prediction statuses and league member points.

Reset:

- Admin can reset simulation for a league.
- Reset clears scored statuses and member points for that league.
- Reset reopens picks for continued testing.

## Results UX

After simulation, league results should show:

- League leaderboard.
- Member-level correct, incorrect, and missing counts.
- Contest-level pick history per member.
- Results grouped consistently with state/category views.
- Richer analytics where available.

MVP interesting stats:

- Biggest upset pick: lowest-picked correct outcome.
- Most consensus miss: most-picked incorrect outcome.
- Best state: member/state accuracy.
- Unique correct picks: picks only one member got right.
- Perfect states: member got every contest in a state correct.

Vote totals and margins are out of scope for the first scoring version. The MVP needs only winner/pass/fail.

## Research Drawers

Pick cards should stay compact. Research should be available without forcing users to leave the pick flow.

Card-level display:

- Candidate name.
- Party.
- Incumbent marker if available.
- Contest office/state/district from the contest header.
- Selected/saved state.
- Info icon button per candidate or measure row.

Drawer behavior:

- Info icon opens a side drawer.
- Drawer lazy-loads research data when opened.
- Drawer shows detailed in-app information when normalized data exists.
- External links are present for provenance and further investigation.
- Leaving the app should be optional, not required for basic decision-making.
- If no normalized content exists but source links exist, show a concise no-additional-info state plus links.
- Missing research never blocks pick-making.

Research content model:

- Define capability buckets and rendering rules, not fixed required fields.
- Sections appear only when source-backed data exists.
- Empty sections are omitted.
- No AI-generated summaries in MVP.
- Store provenance in the data model, but do not show provenance labels in MVP UI.

Candidate research buckets:

- Identity/profile
- Campaign presence
- Public record
- Legislative activity
- Policy/issue positions
- Elections/history
- Source/provenance

Measure research buckets:

- Plain-English summary
- Official text/source
- Fiscal/implementation effects
- Support/opposition
- Legal/history/context
- Source/provenance

Storage:

- Contest documents stay lean for pick rendering.
- Candidate research lives in separate subdocuments keyed by candidate.
- Measure research lives in separate research subdocuments.
- Research subdocuments can be enriched independently from contest ingest.

Suggested shape:

- `races/{raceId}`
- `races/{raceId}/candidateResearch/{candidateId}`
- `ballotMeasures/{measureId}`
- `ballotMeasures/{measureId}/research/profile`

## Source Strategy

Source priority:

1. Official sources first.
2. High-quality civic datasets second.
3. Aggregators as fallback or enrichment.

Official and civic sources should anchor the data model where possible:

- State election offices
- Official candidate filings
- Legislature and Congress APIs
- Official ballot-measure pages
- Candidate campaign websites and social links
- OpenStates
- Congress.gov
- GovTrack/Bioguide where useful
- FEC where useful
- MEDSL for historical election data
- Ballotpedia or similar for enrichment and coverage gaps

The spec does not prescribe exact research fields until source discovery confirms what is reliably available.

## Verification And Readiness

The verifier should cover contest data and research enrichment.

Contest verification:

- Counts by office/category.
- Counts by state.
- Counts by year.
- Empty candidate lists.
- Malformed dates.
- Duplicate contest slots.
- State-view coverage gaps.

Research verification:

- Candidate count.
- Candidate research docs present/missing.
- Candidate source-only fallbacks.
- Measure research docs present/missing.
- Research buckets present by category.
- Contests with pickable options but no research or source fallback.
- Stale research timestamps later.

Research coverage is an admin readiness gate before public use, not a blocker for internal testing.

## Data Model Additions

These fields or equivalent structures are needed before the MVP is complete:

- Contest mode/year metadata.
- Race result: `winnerId`.
- Measure result: `result`.
- League simulation state.
- Prediction status scoped to league.
- Missing-pick accounting.
- League member points derived from simulation.
- Candidate and measure research subdocuments.
- Source/provenance metadata stored with research data.

Exact field names should be finalized during implementation, but the concepts above are required.

## Implementation Sequence

1. Keep this spec as the contract for the next implementation pass.
2. Update types and Firestore rules for league sandbox simulation state, result fields, and research subdocuments.
3. Expand ingest/seed to include 2024 House and ballot measures, plus actual winner/pass/fail result fields.
4. Extend `verify-contests` to include research coverage after research ingest exists.
5. Refactor navigation to league-first: default to Leagues, hide global leaderboard, make Browse Contests view-only.
6. Build league pick progress and missing-section UX.
7. Build admin simulate/reset flow per league.
8. Build post-simulation results view and stats.
9. Add research drawer UI with lazy-loaded subdocuments.
10. Run the verifier as a readiness gate before public testing.

## Explicit Non-Goals For MVP

- Global rankings.
- Global pick-making.
- Public league browsing.
- Configurable league scoring.
- AI-generated candidate or measure summaries.
- Vote margin analytics.
- Public-ready 2026 live data before sandbox mechanics are proven.
