# Free-Source Data Rollout

This is the execution sequence for the deterministic pipeline described in
[free-source-data-plan.md](free-source-data-plan.md). Gemini is not part of the
production path. Run commands directly with `npx tsx` on this Windows machine so
PowerShell/npm cannot strip scoped flags.

## Step 1 — Configure keys and credentials

Put these free API keys in the root `.env.local`:

| Variable | Source |
| --- | --- |
| `CONGRESS_GOV_API_KEY` | Congress.gov |
| `FEC_API_KEY` | api.data.gov / FEC |
| `CENSUS_API_KEY` | Census |
| `OPENSTATES_API_KEY` | OpenStates |
| `GOOGLE_CIVIC_API_KEY` | Google Cloud, optional address lookup |

Also set `PROJECT_ID`, `FIRESTORE_DATABASE_ID`, and
`FIREBASE_SERVICE_ACCOUNT`. The scripts load `.env.local` automatically and do not
override values already supplied by the shell or CI.

## Step 2 — Georgia dry-run gate

```powershell
npx tsx ingest/src/seed-fec2026.ts --year 2026 --state GA --candidate-scope all-filed --dry-run
npx tsx scripts/prune-invalid-federal-races.ts --year 2026 --state GA
npx tsx scripts/build-contest-metrics.ts --year 2026 --state GA --dry-run
npx tsx scripts/link-external-ids.ts --year 2026 --state GA --dry-run
npx tsx scripts/enrich-structured.ts --year 2026 --state GA --dry-run
npx tsx scripts/enrich-fec-finance.ts --year 2026 --state GA --limit 1 --max-calls 3 --dry-run
npx tsx scripts/enrich-roll-calls.ts --year 2026 --state GA --max-votes 2 --dry-run
npx tsx scripts/ingest-bills.ts --states GA --max-bills 1 --skip-events --dry-run
```

The gate passes when every command identifies only Georgia data and exits without
an authentication, schema, or rate-limit error.

## Step 3 — Georgia write and product spot-check

Start with bounded batches:

```powershell
npx tsx ingest/src/seed-fec2026.ts --year 2026 --state GA --candidate-scope funded
npx tsx scripts/prune-invalid-federal-races.ts --year 2026 --state GA
# Review the IDs above, then remove only impossible unreferenced races:
npx tsx scripts/prune-invalid-federal-races.ts --year 2026 --state GA --apply
npx tsx scripts/build-contest-metrics.ts --year 2026 --state GA
npx tsx scripts/link-external-ids.ts --year 2026 --state GA
npx tsx scripts/enrich-structured.ts --year 2026 --state GA
npx tsx scripts/enrich-fec-finance.ts --year 2026 --state GA --limit 10 --max-calls 30
npx tsx scripts/enrich-roll-calls.ts --year 2026 --state GA --max-votes 20
npx tsx scripts/ingest-bills.ts --states GA --max-bills 25
npm run verify-contests
```

In the app, inspect a Georgia incumbent and a challenger. Confirm both show an FEC
filing profile and campaign-finance section; the incumbent should additionally show
official legislative activity and recent votes. Challenger-only congressional
sections should say not applicable instead of looking like failed ingestion.

## Step 4 — Federal scale-out

Run the 2024 and 2026 pipelines in this order: contest seed, metrics, external-ID
linking, Congress enrichment, FEC finance, roll calls, verification. Shard FEC
finance by state because it makes three paced calls per candidate. Re-runs are
resumable through the seven-day freshness check.

Use `FEC_CANDIDATE_SCOPE=funded` for the product catalog. Use `all-filed` only for
an audit/review export; an FEC filing is not proof of ballot qualification.

## Step 5 — State elections and ballot measures

There is no uniform free nationwide API for certified governor candidates and
state ballot measures. Add one official state adapter at a time through
`ingest/src/sources/stateElectionProvider.ts`, retaining the official URL and
qualification status on every normalized record.

Until a state adapter exists, add reviewed records to
`data/2026/curated-contests.json`. Do not seed AI-discovered or unattributed data.
The seed script rejects an empty payload.

Google Civic is available only as a protected, non-persistent address lookup via
`POST /tasks/civic-lookup`; it does not replace the state catalog.

## Step 6 — Verification and deployment

```powershell
npm run test-free-sources
npm run lint
npm --prefix ingest run build
npm run build
npm run verify-contests
npm run verify-firestore-league-flow
npm run verify-browser-league-flow
npm run verify-deployment-readiness
```

After the gates pass, deploy Firestore rules and the application through the normal
release workflow, then spot-check production.

## Ongoing cadence

| Job | Cadence |
| --- | --- |
| FEC federal contest refresh | weekly |
| Congress structured record and roll calls | weekly |
| FEC finance | weekly, state-sharded |
| OpenStates bills and hearings | daily batches within the free quota |
| Official state candidate/measure review | monthly, then more often near certification |
| Full verification report | after every backfill and before deploy |

Polling remains an explicit gap because there is no suitable free authoritative API.
The UI should report it as missing rather than synthesize a value.
