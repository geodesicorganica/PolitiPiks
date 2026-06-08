<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run the app locally

This is a Vite + React + Firebase app.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Verify Firebase web config in `firebase-applet-config.json` points at your project.
3. Start dev server: `npm run dev`
4. Open: `http://localhost:3000`

## Local browser auth testing

Browser automation should use Firebase emulators instead of Google popup auth.

1. Start Auth and Firestore emulators:
   - `npm run emulators`
2. In a second shell, enable local test auth and start the app:
   - PowerShell:
     - `$env:VITE_USE_FIREBASE_EMULATORS='true'; $env:VITE_ENABLE_TEST_AUTH='true'; npm run dev`
3. Open `http://localhost:3000` and use the `Test sign in` button.

The test sign-in path is guarded to localhost and requires both `VITE_USE_FIREBASE_EMULATORS=true` and `VITE_ENABLE_TEST_AUTH=true`. It creates or signs into the emulator user configured by `VITE_TEST_AUTH_EMAIL`, `VITE_TEST_AUTH_PASSWORD`, and `VITE_TEST_AUTH_DISPLAY_NAME`.

For admin browser tests, sign in first, read the Firebase Auth emulator UID from the browser session, then seed `admins/<uid>` directly into the Firestore emulator before navigating to the Admin tab.

## Deploy Firestore Rules (required for tamper-resistance)

The security rules in `firestore.rules` must be deployed to your Firebase project.

- Login: `npx firebase-tools login`
- Deploy rules: `npx firebase-tools deploy --only firestore:rules --project politipiks`

## Make yourself an admin (to call results + score picks)

Admins are determined by the existence of a Firestore doc at `admins/<uid>`.

Options:
- Manual: Create `admins/<your-uid>` in the Firestore console (any fields are fine).
- Scripted (requires a service account JSON; do not commit it):
  - `npm run grant-admin -- --uid <UID> --service-account <path-to-service-account.json>`

## Real contest data (automated ingest)

For production, contests should be written by a backend ingest job (not by the client).

- Ingest service scaffold: `ingest/README.md`
- The UI can be developed against mock contests by setting `VITE_USE_MOCK_CONTESTS=true` (see `.env.example`).
- Quick start for free post-cert data: set `INGEST_SOURCE_TYPE=medsl2024` in the ingest service (see `ingest/README.md`).

## Seed Firestore with 2024 data (one-time local run)

This writes 2024 sandbox contests from MEDSL into Firestore: President, Senate, House, and statewide ballot measures where MEDSL includes them. It also stores historical `winnerId` / `result` fields used by league simulation.

1. Install ingest deps: `npm --prefix ingest install`
2. Run seed:
   - PowerShell:
     - `$env:FIREBASE_SERVICE_ACCOUNT='C:\Projects\Politipiks\politipick\politipiks-firebase-adminsdk-fbsvc-17ba26e01c.json'; $env:PROJECT_ID='politipiks'; npm run seed-2024`

Notes:
- Database id is auto-resolved from `FIRESTORE_DATABASE_ID` or `firebase.json` (you can also pass `--database <id>` if running the ingest script directly).
- If `FIREBASE_SERVICE_ACCOUNT` is omitted, Application Default Credentials are used.

## Remove 2026 mock contests (cleanup)

If you seeded 2024 data and want to remove old 2026 mock contests:

- PowerShell:
  - `$env:FIREBASE_SERVICE_ACCOUNT='C:\Projects\Politipiks\politipick\politipiks-firebase-adminsdk-fbsvc-17ba26e01c.json'; $env:PROJECT_ID='politipiks'; npm run clear-2026-mock-contests`

This removes the mock contest docs and any predictions tied to those mock target IDs.

## Verify contest data

Run this after ingesting or seeding data to check whether the current Firestore contests support the league/state/category views:

- PowerShell:
  - `$env:FIREBASE_SERVICE_ACCOUNT='C:\Projects\Politipiks\politipick\politipiks-firebase-adminsdk-fbsvc-17ba26e01c.json'; $env:PROJECT_ID='politipiks'; npm run verify-contests`

This is read-only. It reports totals by office, year, and state, plus malformed dates, empty candidate lists, duplicate slots, actionable 2024 coverage gaps, and informational research coverage.

## Verify league flow logic

Run the deterministic league harness after touching league pick, scoring, progress, or results code:

```sh
npm run verify-league-flow
```

This does not require Firebase auth or a browser. It checks state-view contest grouping, missing-pick progress, league simulation scoring, result stats, and source-only research fallback shape against in-memory fixtures.

## Verify Firestore league interactions

Run the Firestore emulator coverage after touching rules or league create/join/pick/simulate/reset behavior:

```sh
npm run verify-firestore-league-flow
```

This starts the local Firestore emulator and runs authenticated rules coverage for league creation, invite-code joining, league-scoped picks, simulated pick locking, post-simulation pick reveal, and admin reset/reopen behavior. The Firebase Firestore emulator requires Java 21+ on `PATH`.

## Enrich 2024 research docs

The league pick drawer reads source-backed research subdocuments. This writes conservative research docs for the 2024 sandbox using existing contest, candidate, measure, and URL fields. It does not generate AI summaries or expose historical winners in pick research:

- `races/{raceId}/candidateResearch/{candidateId}`
- `ballotMeasures/{measureId}/research/profile`

Candidate docs include identity, campaign/profile links when available, and contest-context buckets. Measure docs include summary, official/profile links when available, fiscal metrics when present, and legal/ballot-context buckets.

Dry run:

```sh
npx tsx scripts/enrich-research-2024.ts --dry-run --service-account ./politipiks-firebase-adminsdk-...json
```

Write missing docs:

```sh
npx tsx scripts/enrich-research-2024.ts --service-account ./politipiks-firebase-adminsdk-...json
```

Use `--force` to refresh existing generated docs.
