# Data Pipeline Runbook

How contest, research, metrics, and legislative-bill data get into Politipiks, and in
what order to run the jobs. All sources are free; the required API keys are listed in
`.env.example`. Every batch script supports `--dry-run`, writes an audit record to the
`pipelineRuns` collection, and is idempotent (merge-writes keyed by stable IDs).

## Key environment variables

| Var | Used by | Where to get it |
| --- | --- | --- |
| `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) | narrative enrichment, discovery, bill summaries | Google AI Studio |
| `CONGRESS_GOV_API_KEY` | `enrich-structured` | https://api.congress.gov/sign-up/ |
| `FEC_API_KEY` | `seed-2026-federal` | https://api.data.gov/signup/ |
| `CENSUS_API_KEY` | `build-contest-metrics` (demographics/turnout rate) | https://api.census.gov/data/key_signup.html |
| `OPENSTATES_API_KEY` | `ingest-bills` | https://openstates.org/accounts/signup/ |
| `PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`, `FIRESTORE_DATABASE_ID` | all Firestore-writing scripts | Firebase console |

## 2024 sandbox (historical) — full sequence

```bash
npm run seed-2024                 # MEDSL official returns → races + ballotMeasures
npm run enrich-research-2024      # deterministic baseline research from contest facts
                                  #   (--cleanup-legacy-metrics once, to delete the old
                                  #    orphaned races/*/contestMetrics docs)
npm run build-contest-metrics     # real ContestMetrics → contestMetrics/{raceId}
                                  #   historical: MEDSL/tonmcg prior-cycle returns
                                  #   demographics/turnout: Census ACS (needs CENSUS_API_KEY)
npm run link-external-ids         # bioguide + FEC IDs onto race candidates
npm run enrich-structured         # Congress.gov official facts (identity, record,
                                  #   legislative activity, service history)
npm run enrich-research           # Gemini narratives (policy positions, campaign,
                                  #   measure summaries/support-opposition/fiscal/legal)
                                  #   flags: --state GA --limit 50 --budget 200 --force
npm run discover-sources-2024     # candidate website / measure full-text URLs
npm run verify-contests           # coverage + quality audit (see below)
```

Scale notes for `enrich-research`: ~1,650 Gemini calls for full 2024 coverage at 4s
spacing ≈ 2 hours. Shard with `--state` and cap with `--budget N`. The 7-day freshness
skip makes re-runs resumable; `--force` overrides.

## 2026 live cycle

```bash
npm run seed-2026-federal          # FEC filings → 2026 Senate + House races (mode=live)
npm run discover-2026-contests     # Gemini drafts governors + measures →
                                   #   data/2026/curated-contests.json (REVIEW IT)
npm run seed-2026-curated          # seed the reviewed file
npm run build-contest-metrics -- --year 2026   # demographics/fundamentals (no results yet)
npm run link-external-ids -- --year 2026
npm run enrich-structured -- --year 2026
npm run enrich-research -- --year 2026
```

Refresh cadence: re-run `seed-2026-federal` weekly (filings change), the discovery +
curated seed monthly (measure certifications land through summer 2026). The Cloud Run
ingest service also supports `INGEST_SOURCE_TYPE=fec` for a Cloud Scheduler-driven
`POST /tasks/ingest` (token-auth, see `ingest/README.md`).

Paid upgrade path: a Ballotpedia API key + the existing `ballotpedia_state` ingest
source replaces the curated governor/measure flow; there is no free equivalent.
Polling data is intentionally absent everywhere (no free polling API) — the research
drawer's confidence model reports it as a missing field rather than faking numbers.

## PIP-S legislative bills (State Tab)

```bash
npm run ingest-bills -- --summarize          # pilot: CA,TX,NY,FL,GA, 25 bills each
npm run ingest-bills -- --states WA,OR --max-bills 50 --summarize   # scale out
```

Writes BILL entities (with Gemini TL;DR + fiscal signal when `--summarize`),
standardized status logs, bill text versions (real redline diffs in L2 when a state
publishes HTML/plain text; PDF-only states degrade to a notice), sponsor POLITICIAN
entities + `SPONSORED_BY` edges (L3 graph), and upcoming hearings (L1 calendar).
OpenStates free tier is ~1 req/sec with a daily cap — shard states across days.

## Verification

```bash
npm run verify-contests               # 2024 + 2026 coverage, duplicate slots, missing
                                      #   winners, metrics coverage, boilerplate-research
                                      #   detector, PIP-S bill/version/hearing counts
npm run lint && npm run build
npm run verify-firestore-league-flow  # emulator rules/flow suite
npm run verify-browser-league-flow    # Playwright: picks + research drawer renders
                                      #   seeded metrics (Historical/Turnout/Demographics)
npm run verify-deployment-readiness   # deploy gate
```

`verify-contests` treats "candidate research docs still containing template
boilerplate" as the signal that `enrich-structured`/`enrich-research` haven't replaced
the deterministic baseline yet — drive it to 0.
