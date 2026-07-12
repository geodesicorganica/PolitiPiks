# Data Rollout — Implementation Plan

Remaining work to take the platform from "pipeline built and verified" to "accurate,
current data live in every research window." Commands come from
[data-pipeline.md](data-pipeline.md); this document sequences them and marks what only
a human can do. "Agent" steps can run via a dispatched agent or a local Claude Code
session — either works once secrets are in place.

Legend: 🧑 human-only · 🤖 agent-runnable · 🚧 gate (nothing after it proceeds until done)

---

## Step 0 — Commit the pipeline code · 🧑 · ~10 min

The entire pipeline (scripts, ingest sources, UI wiring, rules) exists only in the
working tree. Review the diff and commit/push it before dispatching anything — a cloud
agent clones the repo and will not see uncommitted work.

## Step 1 — Obtain the four free API keys · 🧑 · ~20 min active, email waits

Only a human can do these (email verification):

| Key | Sign-up | Notes |
| --- | --- | --- |
| `CONGRESS_GOV_API_KEY` | https://api.congress.gov/sign-up/ | emailed immediately |
| `FEC_API_KEY` | https://api.data.gov/signup/ | one api.data.gov key |
| `CENSUS_API_KEY` | https://api.census.gov/data/key_signup.html | emailed |
| `OPENSTATES_API_KEY` | https://openstates.org/accounts/signup/ | key on profile page |

`GEMINI_API_KEY` you already have.

## Step 2 — Provision secrets · 🧑 · ~10 min · 🚧

- Local runs: put the four keys (+ `GEMINI_API_KEY`) in `.env.local`, and export
  `FIREBASE_SERVICE_ACCOUNT=<path to service-account JSON>` and `PROJECT_ID=politipiks`.
- Cloud dispatch: add the same values as environment secrets in the dispatch
  environment settings. Never paste the service-account JSON into a prompt.

Gate check: `npm run verify-contests` runs and prints baseline numbers.

## Step 3 — Smoke run (Georgia only) · 🤖 ~15 min, then 🧑 ~5 min

Agent: run Phase A of the dispatch prompt in smoke mode (`--state GA`,
`enrich-research --limit 10`). Human: open the app, Races → GA, confirm the drawer
Overview shows real Historical/Turnout/Demographics and a candidate tab shows real
legislative activity with sources. This validates all keys and write paths for ~$0.

⚠️ Use `npx tsx scripts/enrich-research.ts --state GA --limit 10` (env vars loaded
into the shell first) — `npm run enrich-research -- --state GA --limit 10` has been
observed to drop the flags on this machine and run unscoped. See the Windows note in
[data-pipeline.md](data-pipeline.md). One attempt on 2026-07-11 burned the Gemini
free-tier daily quota (20 req/day) running unscoped from AK before reaching GA —
harmless (7-day freshness skip means it only refreshed already-stale docs, never
overwrote official-sourced buckets) but wasted the day's quota. Confirm the script's
own startup log prints `state=GA` before letting it run unattended.

## Step 4 — Full 2024 backfill · 🤖 · ~3–4 h mostly unattended

In order, each dry-run-first: `seed-2024` (only if gaps) → `enrich-research-2024
--cleanup-legacy-metrics` → `build-contest-metrics` → `link-external-ids` →
`enrich-structured` → `enrich-research` (sharded by state, `--budget` capped; ~1,650
Gemini calls ≈ 2 h at free-tier pacing) → `discover-sources-2024`.

Done when `verify-contests` reports: 0 coverage gaps, 0 races missing metrics,
0 boilerplate research docs. Human involvement: read the final report.

## Step 5 — 2026 federal seed + discovery draft · 🤖 · ~1 h

`seed-2026-federal` (FEC; Senate + House with `mode: 'live'`), then
`discover-2026-contests` which writes `data/2026/curated-contests.json`. The agent
must stop there.

## Step 6 — Review the curated 2026 file · 🧑 · ~20–30 min · 🚧

This is the deliberate human gate: governor candidate lists and ballot measures in
that file are AI-drafted from search. Check each governor race has real declared
candidates, delete anything dubious, fix parties/incumbents, then run
`npm run seed-2026-curated` (and commit the reviewed file). Nothing in Step 7
should run against 2026 until this is done.

## Step 7 — 2026 metrics + research · 🤖 · ~1–2 h

`build-contest-metrics -- --year 2026`, `link-external-ids -- --year 2026`,
`enrich-structured -- --year 2026`, `enrich-research -- --year 2026`.
Expect thinner data than 2024 (no results yet, challengers unmatched) — the
drawer's missing-field/confidence handling covers this by design.

## Step 8 — PIP-S bills pilot · 🤖 · 1–2 h/day, possibly multi-day

`ingest-bills -- --summarize` (CA, TX, NY, FL, GA). OpenStates' free daily cap may
force stopping mid-way; re-runs are idempotent — just run again next day or shard
`--states` across days. Human afterwards (~10 min): open the State Tab, pick a bill,
check L1 TL;DR/fiscal, L2 redline between real versions, L3 graph, calendar hearings.

## Step 9 — Verification + deploy · 🤖 checks, 🧑 deploys · ~30 min · 🚧

Agent: `verify-contests`, `lint`, `build`, `verify-firestore-league-flow`,
`verify-browser-league-flow`, `verify-deployment-readiness`.
Human — two things only a human should trigger:
1. **Deploy the Firestore rules**: `firebase deploy --only firestore:rules`.
   ⚠️ Until this ships, production PIP-S collections remain world-writable
   (the lockdown exists only in the repo).
2. Deploy hosting/app per your normal flow, then spot-check research windows in prod.

## Step 10 — Ongoing operations

| Task | Who | Cadence |
| --- | --- | --- |
| `seed-2026-federal` re-run (filings change) | 🤖 | weekly |
| `discover-2026-contests` refresh → review → `seed-2026-curated` | 🤖 draft, 🧑 review | monthly, more often near certification deadlines |
| `enrich-research` freshness re-runs (7-day skip makes this cheap) | 🤖 | weekly/biweekly |
| `ingest-bills` scale-out beyond pilot states | 🤖 | a few states/day (API cap) |
| Cloud Scheduler → Cloud Run `POST /tasks/ingest` (`INGEST_SOURCE_TYPE=fec`) to automate the weekly FEC refresh | 🧑 one-time setup | optional |
| Decide on paid Ballotpedia key (replaces the curated-file flow entirely) | 🧑 | when budget allows |

## Human checklist (chronological)

- [x] 0. Review + commit/push the pipeline code
- [x] 1. Sign up for the 4 free API keys
- [x] 2. Put keys + service account into `.env.local` / dispatch secrets
- [ ] 3. Kick off smoke run; spot-check a GA drawer
- [ ] 4. Kick off full 2024 backfill; read the report
- [ ] 6. Review & edit `data/2026/curated-contests.json`, then seed + commit it
- [ ] 8. Spot-check the State Tab after the bills pilot
- [ ] 9. `firebase deploy --only firestore:rules`, deploy app, prod spot-check
- [ ] 10. (Optional) set up Cloud Scheduler; calendar a monthly 2026 review
