# Data Pipeline Runbook

How contest, research, metrics, and legislative-bill data get into Politipiks.
The production path is deterministic and source-backed; Gemini is optional legacy
enrichment and is not required. See `free-source-data-plan.md` for the current contract.

> **Windows/PowerShell note:** `npm run <script> -- --flag value` has been observed to
> silently strip every `--flag`-prefixed token on this machine's npm/PowerShell setup —
> the script receives bare positional values with no flag names, so filters like
> `--state`/`--limit`/`--budget` are dropped and the job runs unscoped. Confirmed fix:
> invoke the script directly instead, e.g.
> `npx tsx scripts/enrich-fec-finance.ts --year 2026 --state GA --limit 10`.
> Pipeline scripts load the root `.env.local` without overriding values already set
> in the shell or CI. Verify flags
> landed by checking the script's own startup log line before trusting a run.

## Key environment variables

| Var | Used by | Where to get it |
| --- | --- | --- |
| `CONGRESS_GOV_API_KEY` | `enrich-structured` | https://api.congress.gov/sign-up/ |
| `FEC_API_KEY` | federal seed + finance enrichment | https://api.data.gov/signup/ |
| `CENSUS_API_KEY` | `build-contest-metrics` (demographics/turnout rate) | https://api.census.gov/data/key_signup.html |
| `OPENSTATES_API_KEY` | `ingest-bills` | https://openstates.org/accounts/signup/ |
| `GOOGLE_CIVIC_API_KEY` (optional) | non-persistent `/tasks/civic-lookup` | Google Cloud Console |
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
npm run enrich-fec-finance        # FEC committees, totals, cash/debt, independent spending
npm run enrich-roll-calls         # official House and Senate roll-call actions
npm run verify-contests           # coverage + quality audit (see below)
```

Scale notes: FEC finance uses three paced calls per candidate. Shard with `--state`
and cap with `--max-calls`; the 7-day freshness skip makes re-runs resumable. The
same command also writes an FEC filing profile to the candidate `campaign` bucket.
If finance is already fresh but the profile is missing, the profile backfill uses
zero API calls.

## 2026 live cycle

The federal live catalog is a canonical seat registry, not a list of FEC filings.
Read [the canonical-registry cutover contract](canonical-2026-federal-registry.md)
before seeding or migrating 2026 data. In particular, FEC filings are research-visible
but not ballot-verified or pick-eligible, and the migration report is read-only.

```powershell
npx tsx ingest/src/seed-fec2026.ts --year 2026 --candidate-scope funded
npx tsx scripts/prune-invalid-federal-races.ts --year 2026 # read-only validation
npx tsx scripts/build-contest-metrics.ts --year 2026       # 2024 House / 2020 regular Senate priors + Census
npx tsx scripts/link-external-ids.ts --year 2026
npx tsx scripts/enrich-structured.ts --year 2026
npx tsx scripts/enrich-fec-finance.ts --year 2026
npx tsx scripts/enrich-roll-calls.ts --year 2026
npm run seed-2026-curated          # human-reviewed official-source governor/measure file
```

FEC Form 2 district values are filer-entered. The seed now rejects impossible
state/district combinations and recognizes district `00` as at-large for one-seat
states. For records seeded before that validation existed, inspect the read-only
prune report and add `--apply` only after reviewing the listed race IDs. Referenced
races are never removed.

For 2026, historical metrics use the latest comparable completed general election:
2024 for House and 2020 for regular Class 2 Senate seats. Special Senate races stay
unlinked until the race schema carries seat-class/special-election identity. Turnout
is explicitly labeled as prior-election turnout; it is not presented as 2026 turnout.

Refresh cadence: re-run `seed-2026-federal` weekly (filings change), the discovery +
curated seed monthly (measure certifications land through summer 2026). The Cloud Run
ingest service also supports `INGEST_SOURCE_TYPE=fec` for a Cloud Scheduler-driven
`POST /tasks/ingest` (token-auth, see `ingest/README.md`).

The curated governor/measure file remains the free-only state-data gate. The existing
Ballotpedia adapter is a paid optional upgrade, not part of this runbook.
Polling data is intentionally absent everywhere (no free polling API) — the research
drawer's confidence model reports it as a missing field rather than faking numbers.

## PIP-S legislative bills (State Tab)

```bash
npm run ingest-bills                         # pilot: CA,TX,NY,FL,GA, 25 bills each
npx tsx scripts/ingest-bills.ts --states WA,OR --max-bills 50       # scale out
```

Writes BILL entities with source-provided title/abstract,
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

`verify-contests` treats candidate research docs still containing template
boilerplate as incomplete. Drive that count to 0 with the structured, finance, and
roll-call enrichers; no generative model is required.
