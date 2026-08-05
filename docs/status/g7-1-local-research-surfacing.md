# G7.1 — Local research and metrics surfacing

Status: **certified locally on 2026-08-03**. No production Firebase/Firestore data access, source-data HTTP capture, activation, deployment, deletion, push, branch change, result ingestion, or scoring operation occurred. Two initial emulator-seeder diagnostics triggered failed ADC metadata lookups to `metadata.google.internal`; they returned DNS errors and accessed no credentials or data. The final implementation uses explicit throwaway emulator credentials, and its successful certification run performed no metadata lookup.

## Certified local product bundle

The Firebase-free builder validates the committed publication, G6.2 finance, G6.3 Congress, and G6.4 historical/CVAP chain before projecting only product-safe structured fields. Legacy narrative buckets, weak inherited source lists, credentials, private paths, post-lock outcomes, winner fields, unsupported values, and unavailable-as-zero substitutions are excluded or rejected.

The ignored private output is `.artifacts/private/canonical-migration/g7-1-local-product-bundle.json`.

| Document class | Count |
| --- | ---: |
| Canonical races | 470 |
| Ballot measures | 14 |
| Candidate research | 2,384 |
| Measure research | 14 |
| Contest metrics | 470 |
| Catalog selectors | 1 |
| Total | 3,353 |

Readiness remains independent: `catalogReady=true`, `researchReady=true`, `metricsReady=true`, zero federal races are prediction-ready in the certified publication snapshot, and all 14 California measures are prediction-ready. This does not promote FEC filing records into ballot eligibility.

Two direct offline builds replayed identically:

- Input digest: `af8a1a8e96cafc02937d7570e5e2d1c70a8bc6462b1a60e77252eaae40cba830`
- Evidence digest: `f022709c58fe2b5a75ad6e76dd8112e6e160323380611d66ba9db6e73f07894f`
- Plan digest: `15726ee867d93d9de5fcc1f52887d6302bc61c606063c90320ebc1c194f62641`
- Bundle digest: `7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7`

The audit reports zero duplicate paths, orphan documents, unresolved references, and leakage.

## Emulator boundary

The seeder rejects a missing or non-loopback `FIRESTORE_EMULATOR_HOST`, uses explicit throwaway emulator credentials to prevent ADC/metadata probing, converts only exact timestamp tags, and writes in batches of at most 400. After the two failed pre-hardening metadata probes noted above, the final port-8081 certification run seeded all 3,353 documents in nine batches, exited `0`, emitted no metadata lookup, and did not initialize or contact production Firebase.

## Product behavior

The active nested app now parses canonical evidence defensively and renders:

- official FEC identity and filing provenance;
- receipts, disbursements, cash on hand, debt, cycle, and filing period;
- congressional profile, sponsored/cosponsored legislation, and reviewed roll calls;
- historical partisan margin, votes/CVAP turnout proxy, and ACS CVAP context;
- field-level source links, retrieval time, vintage, geography, and methodology;
- explicit partial, unavailable, stale, not-applicable, malformed, and source-error states.

Finance is labeled as context rather than a forecast. No AI narrative, winner probability, prediction, model score, or fabricated precision was added. Measure cards now expose authority, qualification, choices, official source, and readiness. California measures remain selectable; catalog-only Georgia remains browsable with picks disabled.

## Verification

All commands exited `0`:

### Parent

- `npm run test-local-product-bundle`
- two direct `npx tsx scripts/build-2026-local-product-bundle.ts --verify-replay` runs
- loopback emulator seed through `scripts/firebase.emulator-test.json`
- `npm run test-historical-cvap-depth`
- `npm run test-free-sources`
- `npm run lint`
- `npm --prefix ingest run build`
- `npm run build`
- `git diff --check`

### Nested app

- `npm run lint`
- `npm run lint:rules`
- `npm run test-contest-catalog`
- `npm run test-canonical-evidence`
- `npm run verify-firestore-league-flow`
- `npm run verify-browser-league-flow`
- `npm run build`
- `npm run verify-deployment-readiness`
- `git diff --check`

Rules lint retained its existing `/test/connection` open-read warning. Existing Vite large-chunk and development-server API-key/WebSocket warnings remain non-blocking and were not broadened by this work.

## Remaining G7 work

G7.2 must certify the complete local create/join-league and pick workflow against catalog-only, prediction-ready, withdrawal/changed-eligibility, closed, invalid-choice, and measure targets. It must also add the planned state/office/type/readiness catalog filters. G7.3 must bring rollout and rollback runbooks to release readiness. Production publication remains G8 and requires separate authorization.
