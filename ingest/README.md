# Politipick contest ingest (Cloud Run)

This is a small Cloud Run service intended to be triggered by Cloud Scheduler to upsert contests into Firestore.

## What it does

- Exposes `POST /tasks/ingest` (protected by `X-Ingest-Token`)
- Fetches contest JSON from `INGEST_SOURCE_URL`
- Upserts `races/*` and `ballotMeasures/*` documents
- Preserves called/scoring fields only when the source payload does not provide them

## Required environment variables

- `PROJECT_ID` (e.g. `politipiks`)
- `FIRESTORE_DATABASE_ID` (must match your `firebase.json` database)
- `INGEST_SOURCE_TYPE` (`url`, `medsl2024`, `fec`, or `ballotpedia_state`)
- `INGEST_SOURCE_URL` (HTTPS URL returning contests JSON; required only when `INGEST_SOURCE_TYPE=url`)
- `INGEST_TOKEN` (shared secret for the scheduler request header)

Optional:
- `PORT` (default `8080`)
- `GOOGLE_CIVIC_API_KEY` (only for the non-persistent Civic lookup endpoint)

## Source JSON format

The ingest expects JSON like:

```json
{
  "races": [ { "id": "ga-sen-2026", "state": "GA", "office": "Senate", "district": null, "closeDate": "2026-11-03T19:00:00-05:00", "candidates": [ { "id": "c1", "name": "Jane Doe", "party": "Democrat" } ] } ],
  "ballotMeasures": [ { "id": "ca-measure-1-2026", "state": "CA", "title": "Measure 1", "description": "...", "closeDate": "2026-11-03T20:00:00-08:00" } ]
}
```

## Deploy outline

1. Build + deploy to Cloud Run (set env vars).
2. Create Cloud Scheduler job to `POST https://<cloud-run-url>/tasks/ingest` with header `X-Ingest-Token: <INGEST_TOKEN>`.

This repo intentionally does not include terraform/gcloud scripts yet.

## Built-in free source option: MEDSL 2024 sandbox (post-cert)

If you just want to stand up the pipeline quickly with free, post-cert data, set:
- `INGEST_SOURCE_TYPE=medsl2024`

This fetches President, Senate, House, and statewide ballot-measure results from MEDSL's `2024-elections-official` repository where available. The loader stores historical winners/results for sandbox league simulation.

## One-time local seed command (MEDSL 2024)

If you want to seed Firestore immediately (without running Cloud Run + Scheduler), run:

- PowerShell (from repo root):
  - `$env:FIREBASE_SERVICE_ACCOUNT='C:\Projects\Politipiks\politipick\politipiks-firebase-adminsdk-fbsvc-17ba26e01c.json'; $env:PROJECT_ID='politipiks'; npm --prefix ingest run seed:2024`

Optional flags:
- `--database <id>` (defaults to `FIRESTORE_DATABASE_ID` or `firebase.json`)
- `--service-account <path>` and `--project-id <id>` are supported when invoking `tsx src/seed-medsl2024.ts` directly
- omit service account to use Application Default Credentials

## Free "pre-election contests" option: FEC (2026 federal races)

Loads Senate + House candidate filings for an upcoming cycle from the FEC API and
attaches them only to the canonical voting-seat registry. A filing does not create a
race, prove ballot access, or make a candidate pick-eligible. See
`../docs/canonical-2026-federal-registry.md` for the shadow-cutover contract.
(free key at https://api.data.gov/signup/). Races are written with `mode: 'live'`.

Set:
- `INGEST_SOURCE_TYPE=fec`
- `FEC_API_KEY=...` (DEMO_KEY works for smoke tests, heavily rate-limited)
- `FEC_ELECTION_YEAR=2026` (default)
- `FEC_STATES=GA,TX` (optional state filter)
- `FEC_CANDIDATE_SCOPE=funded` (default) or `all-filed` for the broad review set

Local one-shot seed from the repo root:

```powershell
npx tsx ingest/src/seed-fec2026.ts --state GA --candidate-scope all-filed --dry-run
npx tsx ingest/src/seed-fec2026.ts --state GA --candidate-scope funded
```

Suggested Cloud Scheduler cadence: weekly (candidate filings change often pre-primary).

Governor races and 2026 ballot measures have no uniform nationwide free API. They
flow through `data/2026/curated-contests.json`, assembled from official state
election endpoints and reviewed before `npm run seed-2026-curated`. The seed command
refuses an empty file. See `docs/free-source-data-plan.md`.

## Google Civic lookup (non-persistent)

`POST /tasks/civic-lookup` uses the same `X-Ingest-Token` as the ingest task. Send
`{"listElections":true}` to list elections or `{"address":"..."}` to request an
address-specific ballot lookup. Official-only results are the default; set
`"officialOnly":false` only when the caller explicitly wants partner-sourced data.
The service passes the address to Google for that request but does not log it or
write it to Firestore. This endpoint supplements the contest catalog; it is not a
bulk-ingest source.

## Fastest "pre-election contests" option: Ballotpedia (requires API key)

If you want contests before election day, the quickest path is Ballotpedia's geographic API `/elections_by_state` (candidate lists + ballot measures by state + election date).

Set:
- `INGEST_SOURCE_TYPE=ballotpedia_state`
- `BALLOTPEDIA_API_KEY=...`
- `BALLOTPEDIA_STATE=CA` (state abbreviation)
- `BALLOTPEDIA_YEAR=2026`
- `BALLOTPEDIA_OFFICE_LEVEL=State` (or `Federal`)

Notes:
- The Ballotpedia API requires an API key from Ballotpedia.
