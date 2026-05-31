# Politipick contest ingest (Cloud Run)

This is a small Cloud Run service intended to be triggered by Cloud Scheduler to upsert contests into Firestore.

## What it does

- Exposes `POST /tasks/ingest` (protected by `X-Ingest-Token`)
- Fetches contest JSON from `INGEST_SOURCE_URL`
- Upserts `races/*` and `ballotMeasures/*` documents
- Never overwrites called/scoring fields (`status`, `winnerId`, `result`)

## Required environment variables

- `PROJECT_ID` (e.g. `politipiks`)
- `FIRESTORE_DATABASE_ID` (must match your `firebase.json` database)
- `INGEST_SOURCE_TYPE` (`url`, `medsl2024`, or `ballotpedia_state`)
- `INGEST_SOURCE_URL` (HTTPS URL returning contests JSON; required only when `INGEST_SOURCE_TYPE=url`)
- `INGEST_TOKEN` (shared secret for the scheduler request header)

Optional:
- `PORT` (default `8080`)

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

## Built-in free source option: MEDSL 2024 statewide (post-cert)

If you just want to stand up the pipeline quickly with free, post-cert data, set:
- `INGEST_SOURCE_TYPE=medsl2024`

This will fetch statewide President + Senate candidate lists from MEDSL's `2024-elections-official` repository.

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
