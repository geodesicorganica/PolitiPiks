# G8.1 — Fresh catalog-beta capture and offline certification

Status: **certified locally on 2026-08-04 after G6.4.1 offline recertification**.

The single authorized production read-only capture succeeded. Certification then
stopped at the first prospective-bundle guard failure; the drift was then
diagnosed and remediated entirely offline. No second production read, external
enrichment call, Firestore write, shadow copy, deployment, selector change,
rollback, deletion, or branch change occurred.

## Synchronization and preflight

- Parent HEAD: `ec5bee2c9ebd9369f99c810cab8b289cb80c2fdf`.
- Nested active-app HEAD: `8a77a316eabb4f1f6bd1dfae8b790942c57f7d97`.
- Local G8 readiness receipt: `0a370499fc7366ef5adcd87068b941aff40f73e3de3ebebf53fbfd9ab470173c`.
- Certified G6.2, G6.3, G6.4, G7.1, and statewide-measure inputs were present;
  private inputs remained ignored.
- New fresh, approved, prospective, and receipt artifact names were absent
  before capture. Only the fresh snapshot and sanitized receipt now exist.
- Credentials were checked by presence only. Unsafe flags were present but
  disabled; no credential value was printed.

Preflight commands exited `0`:

```powershell
npx tsx scripts/verify-g8-release-readiness.ts
npm run verify-deployment-readiness
# nested repository
npm run verify-deployment-readiness
git diff --check
```

## Authorized capture

Exact command, launched once directly without an npm wrapper or `Tee-Object`:

```powershell
npx tsx scripts/report-canonical-2026-publication.ts --snapshot-out .artifacts/private/canonical-migration/g8-1-fresh-catalog-beta-2026-08-04.json --project-id politipiks --database-id ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a
```

Exit: `0`.

Sanitized capture result:

| Field | Value |
| --- | ---: |
| Raw races / predictions | 467 / 6 |
| Candidate-research / metric reads | 2,625 / 986 |
| Deadlines | 111 |
| Canonical federal races | 470 |
| Federal lock coverage | 470 |
| Official research records / unresolved official research | 111 / 359 |
| Catalog / prediction / publication readiness | true / false / false |
| Prediction-ready federal races | 0 |
| Research-missing candidates / metric-missing races / unresolved predictions | 0 / 0 / 0 |

Sanitized capture digests:

- Input: `3117a383c2452e72ec21ab40e52fa113f34114c1ddabc29faaf0f80e262d3ce7`
- Mapping: `7650db763671b6951c4650b816c31e67e8cafb9594ac651c9f25cbd41dc2861a`
- Plan: `8ed2548eb84b3de61e2267d786d3cfe5c16c0749aebf5d10e48d6b2abfa7a880`
- Lock policy: `cbe521451a3dea2d7ccc7426baa04cd7b425012c1341b8804b8aa02ce04e0dc1`
- Namespace: `c008c8a46205723c8f4fdf6c9e3b7a3520e7de855d448031754bfa500c5b35c9`

## Offline certification stop

The fresh snapshot replay command exited `0` twice:

```powershell
npx tsx scripts/report-canonical-2026-publication.ts --snapshot-in .artifacts/private/canonical-migration/g8-1-fresh-catalog-beta-2026-08-04.json --verify-replay
```

Both replays were deterministic. The first prospective bundle command exited
`1` and was not retried:

```powershell
npx tsx scripts/build-2026-local-product-bundle.ts --publication-snapshot .artifacts/private/canonical-migration/g8-1-fresh-catalog-beta-2026-08-04.json --snapshot-out .artifacts/private/canonical-migration/g8-1-prospective-product-bundle-2026-08-04.json --verify-replay
```

Stop reason: `G6.4 certification digest mismatch`.

The exact sanitized offline differences are:

| Field | Manifest/certified expected | Fresh offline actual |
| --- | --- | --- |
| `depthEvidence` | `7f6e41354136814c13e897e0aef289743379e5da0eb98f14ece33a8036a08ab3` | `efa7cf13bfe1d28b1606ef0042b2b4bc8f87d104baf176d4b29e08ad038f6458` |
| `depthPlan` | `8e752ba5f0555213d431bb307cc212b47d061fef8c91d7e2ae74e82265d5fe98` | `0eb42235d9f80cc50975779b0d119b47aad0b245fb06717d1b4ae6e2bfcc8bc5` |

Because certification drifted, no prospective bundle was approved, no approved
snapshot was created, and `docs/g8-catalog-beta-release-manifest.json` was not
updated automatically. The private capture and sanitized receipt are preserved
for offline investigation only.

## Evidence boundary

The sanitized receipt is the ignored artifact
`g8-1-capture-receipt-2026-08-04.json`. It contains no candidate or prediction
contents, credentials, or absolute private paths. The fresh snapshot artifact is
`g8-1-fresh-catalog-beta-2026-08-04.json`; the approved and prospective
artifacts were created only after offline certification passed.

The initial post-certification gates were not run because the circuit breaker
required an immediate stop on certification drift. After G6.4.1 recertification,
the preserved capture completed the local catalog-beta gates.

## G6.4.1 offline diagnosis and remediation

The sanitized diagnostic command was:

```powershell
npm run diagnose-g6-4-certification-drift
```

It exited `0` with `firebaseInitialized:false` and `httpCalls:0`. It validated
four preserved snapshots, compared complete projected publication documents,
and found:

- old and fresh publication input digests were both
  `3117a383c2452e72ec21ab40e52fa113f34114c1ddabc29faaf0f80e262d3ce7`;
- complete projected publication documents were identical;
- first differences were only `baselineMetrics/*/asOf`,
  `baselineMetrics/*/retrievedAt`, and derived `evidenceDigest` fields;
- classification was `capture-metadata-only`;
- capture-time and ordering probes produced identical corrected G6.4 evidence
  and plan digests.

G6.4.1 changed the certified evidence digest from
`7f6e41354136814c13e897e0aef289743379e5da0eb98f14ece33a8036a08ab3` to
`17413f6a19620fd628fb2bf60f927c1caba7aed97e23f158c63f942ff6bb5242`, and the
plan digest from
`8e752ba5f0555213d431bb307cc212b47d061fef8c91d7e2ae74e82265d5fe98` to
`23d3ea2290552fbbfee7396a6019fb17213c756e79dcf5409d1fd8d129c6cec7`.
The snapshot, source, and input digests were unchanged. Full output provenance
metadata remains present; only the certification projection excludes unrelated
publication capture metadata and derived nested digests.

## Preserved capture completion

The prospective bundle was rebuilt from the preserved fresh snapshot, with no
new capture:

```powershell
npx tsx scripts/build-2026-local-product-bundle.ts --publication-snapshot .artifacts/private/canonical-migration/g8-1-fresh-catalog-beta-2026-08-04.json --snapshot-out .artifacts/private/canonical-migration/g8-1-prospective-product-bundle-2026-08-04.json --verify-replay
```

The corrected builder exited `0` and replayed identically twice offline. It
produced input `af8a1a8e96cafc02937d7570e5e2d1c70a8bc6462b1a60e77252eaae40cba830`,
evidence `f022709c58fe2b5a75ad6e76dd8112e6e160323380611d66ba9db6e73f07894f`,
plan `15726ee867d93d9de5fcc1f52887d6302bc61c606063c90320ebc1c194f62641`, and
bundle `7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7`.

The required product contract passed: 470 races, 14 measures, 2,384
candidate-research documents, 14 measure-research documents, 470 metrics, one
selector, 3,353 total documents, zero prediction-ready federal races, 14
prediction-ready California measures, and zero duplicate paths, orphans,
unresolved references, leakage, or incompatible live-2026 predictions.

Offline approval created the approved publication snapshot with no-clobber
semantics:

```powershell
npx tsx scripts/report-canonical-2026-publication.ts --snapshot-in .artifacts/private/canonical-migration/g8-1-fresh-catalog-beta-2026-08-04.json --verify-replay --approve-snapshot .artifacts/private/canonical-migration/g8-1-approved-catalog-beta-2026-08-04.json
```

The command exited `0`. The approved and preserved fresh snapshots are byte
identical: SHA-256
`8F2E5244F49DC011F07BB748FF68F0759DFB002598E923E84019A03A28681CED` and
10,769,556 bytes each.
