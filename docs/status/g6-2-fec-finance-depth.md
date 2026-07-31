# G6.2 — Comparative FEC finance depth

Status: **certified locally on 2026-07-31**. Certification made no Firebase,
Firestore, deployment, activation, deletion, or push operation. The retained
pre-certification FEC API attempt and this focused local commit are documented
below.

## Retained API 429 history

G6.2.1 repaired root `.env.local` loading with the repository’s established
`dotenv.config({ path: '.env.local', override: false, quiet: true })` contract.
The one authorized Georgia per-candidate FEC API attempt then exited `1` on an
official `429` rate limit. It was not retried. No API capture output was
written, and the API path is retired for this certification.

## Bulk-source correction and provenance

The certified source is the official FEC 2025–2026 all-candidates archive:

```text
https://www.fec.gov/files/bulk-downloads/2026/weball26.zip
```

The initial bulk normalizer incorrectly required a literal header and exited
`1` with `unexpected FEC all-candidates header/schema`. The already saved ZIP
was then structurally reviewed locally: it has one `weball26.txt` entry, 4,268
headerless 30-field rows, no duplicate candidate IDs, valid coverage dates,
3,538 House rows, 624 Senate rows, 106 presidential rows, and 217 signed
selected finance values. No archive was downloaded again.

The corrected parser treats the documented 30-column layout as schema metadata,
retains the first headerless data row, permits an exact header only for fixtures,
and rejects all non-exact headers. It accepts finite signed official monetary
adjustments unchanged and retains blanks as `null`. Presidential records are
audited as out-of-scope, never published. Only exact reviewed canonical FEC IDs
may be normalized, with state and numeric House-district checks; no name match
or personal source column is retained.

The accepted private archive is 192,123 bytes. Its SHA-256 archive digest is:

```text
3903fd82117a29a34482e8a259df7b044e7a4d4faf5c7f0e79975b7c1d9a432a
```

The privacy-projected normalized snapshot was captured at
`2026-07-31T14:09:10.191Z`. It carries the documented schema URL, header state,
raw/H-S/presidential row counts, archive digest, source provenance, only the
approved candidate finance fields, and no names, addresses, ZIP codes, keys,
or unrelated source columns.

## Certified coverage

| Measure | Result |
| --- | ---: |
| Raw archive rows | 4,268 |
| House/Senate rows | 4,162 |
| Ignored presidential rows | 106 |
| Header present | false |
| Matched canonical candidates | 2,368 |
| Explicitly unavailable canonical candidates | 16 |
| Comparable races | 431 |
| Partial/incompatible-period races | 33 |
| Metrics | 470 |
| Candidate-research documents | 2,384 |
| Measure-research documents | 14 |
| Orphans / duplicates / unresolved references / leakage | 0 / 0 / 0 / 0 |

Missing values remain missing, rather than zero. Race comparisons require a
compatible FEC coverage end date; incompatible coverage is surfaced as partial.
Independent-expenditure coverage remains unavailable because the candidate
summary file does not establish it.

## Deterministic evidence

```text
archiveDigest:  3903fd82117a29a34482e8a259df7b044e7a4d4faf5c7f0e79975b7c1d9a432a
inputDigest:    4f6daac55ec7ecd34aa5733eb36aee9fc17d6251eeebc7688866ddd5bbbce95b
evidenceDigest: c4230ecf3cdc4efa97525e5861ea6ca3b212b028ebb7d1bd4df9a3ec2d108f6f
planDigest:     4900bac4289506765a75fbda71af85f2312dd2d46667758ac52b239a29472237
```

The normalized snapshot was replayed twice offline with the explicit publication
snapshot; both reports produced exactly these four digests and the same counts.
Archive-input normalization and both replays reported `firebaseInitialized:false`
and `fecApiCalls:0`.

## Commands and exit codes

All completed commands below exited `0` unless the retained initial failures
are explicitly identified above.

```text
npx tsx scripts/capture-2026-fec-bulk-finance.ts --snapshot-in .artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json --archive-in .artifacts/private/canonical-migration/g6-2-weball26.zip --snapshot-out .artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json --preflight

npx tsx scripts/capture-2026-fec-bulk-finance.ts --snapshot-in .artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json --archive-in .artifacts/private/canonical-migration/g6-2-weball26.zip --snapshot-out .artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json --verify-replay

npx tsx scripts/capture-2026-fec-bulk-finance.ts --snapshot-in .artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json --publication-snapshot .artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json --verify-replay

npx tsx scripts/capture-2026-fec-bulk-finance.ts --snapshot-in .artifacts/private/canonical-migration/g6-2-fec-bulk-finance.json --publication-snapshot .artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json --verify-replay

npm run test-fec-bulk-finance
npm run test-fec-finance-depth
npm run test-fec-finance-capture-cli
npm run test-fec-finance
npm run test-research-metrics-baseline
npm run test-free-sources
npm run lint
npm --prefix ingest run build
npm run build
git diff --check
```

## Next

G6.2 is complete locally. The next research-depth track is G6.3:
source-backed Congress and roll-call depth. Any future refresh must use a new
separately authorized official archive capture and preserve these no-clobber,
privacy, identity, and offline-replay checks.
