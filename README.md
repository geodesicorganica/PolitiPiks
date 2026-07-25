# PolitiPiks

PolitiPiks is moving from a seeded demo dataset toward a source-backed election data platform. The current backend already exposes canonical refresh jobs, official federal ingestion paths, ballot-measure ingestion scaffolding, and API surfaces for the frontend.

## Local launch

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the keys you need:

```bash
cp .env.example .env
```

Required by capability:

| Capability | Variable |
| --- | --- |
| Run the app shell and basic read endpoints | none |
| Federal roster + official bill/vote discovery during global refresh | `CONGRESS_API_KEY` |
| AI enrichment endpoint | `GEMINI_API_KEY` |

The app can boot without Firebase Admin credentials, but Firestore-backed reads and writes will be limited until credentials are available in the runtime environment.

### 3. Start the development server

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Verification workflow

Use these commands as the normal confidence check before committing:

```bash
npm run verify
```

That runs TypeScript checking plus a production build.

With the app already running in another terminal, run:

```bash
npm run smoke
```

The smoke test checks:

- `/api/health`
- `/api/data-sources`
- `/api/races`
- `/api/ballot-measures`

It also prints whether Firebase Admin, Congress.gov, and Gemini are configured so you can tell the difference between “the app is up” and “all integrations are available.”

## Production-like local run

```bash
npm run build
npm run start
```

This serves the bundled frontend and compiled backend from `dist/`.

## Current API surfaces

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Runtime and integration readiness |
| `GET` | `/api/data-sources` | Registered source catalog |
| `GET` | `/api/races` | Race records |
| `GET` | `/api/ballot-measures` | Ballot-measure records |
| `POST` | `/api/refresh/global` | Start a backend refresh job |
| `GET` | `/api/refresh/jobs/:id` | Inspect refresh progress |
| `GET` | `/api/candidates/:id/votes` | Candidate vote history |
| `GET` | `/api/candidates/:id/activities` | Candidate non-vote activity history |
| `POST` | `/api/ingest/recorded-vote` | Ingest an official recorded vote payload |
| `POST` | `/api/ingest/ballot-measures` | Ingest normalized ballot measures |
| `POST` | `/api/enrich-candidate` | AI enrichment only; not canonical records |

## Suggested manual smoke path

After `npm run dev`:

1. Load the app in the browser.
2. Open `/api/health` and confirm the configured services you expect are `true`.
3. Trigger one global refresh and inspect `/api/refresh/jobs/:id`.
4. Open a candidate detail page and confirm official votes appear newest-first when canonical data exists.
5. Check `/api/ballot-measures` after ingesting at least one normalized measure payload.

## Next platform work

The next product-facing milestones are:

1. Harden official vote matching and unmatched-row review.
2. Add a provider-specific ballot-measure ingestion adapter.
3. Build out race-catalog ingestion.
4. Add a staging deployment once local verification is routine.
