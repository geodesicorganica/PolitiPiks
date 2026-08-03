# G6.4 — Historical turnout and CVAP depth

Status: **certified locally on 2026-08-03**. This work was Firebase-free and made no production writes, deployment, activation, deletion, push, or branch change.

## Recovery record

- Preserved historical checkpoints: 102.
- Preserved and validated 2024 Census congressional-district checkpoints: 50.
- The initial 2024 statewide Census request returned direct HTTP 200 JSON but failed because its 52 rows included District of Columbia (FIPS 11) and Puerto Rico (FIPS 72). Its private response body, sanitized receipt, and append-only ledger were preserved.
- Recovery verified the saved body, receipt, and ledger against `d36f1915d45bd9d68f0f7d63207f8e8a38fbf5b63de711818528a0aaa2f0f3a9`, then created the 2024 statewide checkpoint with no-clobber semantics and no network access.
- The v6 statewide parser binds the exact `NAME`, `B29001_001E`, and `state` header set by name. It rejects malformed, duplicate, unknown, or incomplete jurisdictions; excludes only FIPS 11 and 72; and records those two exclusions in final provenance.
- The earlier Alaska missing-key redirect, keyed-header order correction, Connecticut `ZZ` non-district sentinel correction, and the saved 2024 statewide response failure remain preserved as private evidence. `ZZ` was ignored only for CT, IL, and NH and was never mapped to a contest.

## Certified capture

The R6 preflight reused 153 validated checkpoints (102 historical, 50 district, 1 recovered statewide), reported two remaining sources, `CENSUS_API_KEY_PRESENT:true`, `httpCalls:0`, and `firebaseInitialized:false`.

The sole R6 capture invocation made exactly two direct official Census requests: 2022 statewide CVAP and 2020 statewide CVAP. Both returned validated direct JSON. All URLs persisted in checkpoints, receipts, provenance, and logs are keyless; the Census key existed only in the ephemeral transport URL.

- Historical coverage: 434 present / 36 unavailable.
- Turnout-proxy coverage: 428 present / 42 unavailable.
- CVAP coverage: 470 present / 0 unavailable.
- Cardinalities: 470 metrics, 2,384 candidate-research documents, 14 measure-research documents.
- Audit: zero duplicate documents, orphan documents, unresolved references, and leakage.
- Statewide exclusions: District of Columbia (11) and Puerto Rico (72).

## Deterministic evidence

- Snapshot digest: `c2ff11afbf184d29cc3d3d5a428ebe43c72875717d63fdd484c65e9858730d29`
- Source digest: `e4598622c3ec18534590503313516489b60bbb1a977a591c36a4a43b3aeab45d`
- Input digest: `535ac1413062b8c5f046b5265ace2b1762e90409aee6e0b3da37e82315a4df8e`
- Evidence digest: `7f6e41354136814c13e897e0aef289743379e5da0eb98f14ece33a8036a08ab3`
- Plan digest: `8e752ba5f0555213d431bb307cc212b47d061fef8c91d7e2ae74e82265d5fe98`

Two offline replays of the private final snapshot produced these identical digests with `httpCalls:0` and Firebase uninitialized.

## Verification commands and exit codes

| Command | Exit |
| --- | ---: |
| `npm run test-historical-cvap-depth` | 0 |
| `npm run test-contest-metrics` | 0 |
| `npm run test-free-sources` | 0 |
| `npm run lint` | 0 |
| `npm --prefix ingest run build` | 0 |
| `npm run build` | 0 |
| direct 2024 recovery/preflight (`--preflight --resume --max-calls 2`) | 0 |
| direct official capture (`--resume --verify-replay --max-calls 2`) | 0 |
| direct offline replay 1 (`--snapshot-in ... --verify-replay`) | 0 |
| direct offline replay 2 (`--snapshot-in ... --verify-replay`) | 0 |
| `git diff --check` | 0 |

Remaining product work is G7: surface the certified evidence with its availability, vintage, and provenance limits; no activation or production publication is authorized by this certification.
