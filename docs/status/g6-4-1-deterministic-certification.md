# G6.4.1 — Deterministic historical/CVAP certification recertification

Status: **recertified locally on 2026-08-04**. This is an offline
recertification of the preserved G6.4 snapshot; it made no Census, Firebase,
Firestore, or other network request.

## Cause and classification

The G8.1 old and fresh publication snapshots had the same input digest and the
same complete projected publication documents. The G6.4 projection nevertheless
used the unrelated publication `capturedAt` as synthetic baseline `asOf` and
`retrievedAt` metadata. Those fields then changed nested derived evidence
digests and the G6.4 evidence/plan digests. This was **capture-metadata drift**,
not source-data, turnout, CVAP, research, metric, geography, vintage, or
provenance-value drift.

The corrected certification projection removes only capture-derived metadata
and derived nested evidence digests from G6.4 evidence/plan hashing. The full
product documents retain their source and freshness fields for provenance.
Unstable source ordering is canonicalized before hashing.

## Digest recertification

| Digest | Prior G6.4 | G6.4.1 corrected |
| --- | --- | --- |
| Snapshot | `c2ff11afbf184d29cc3d3d5a428ebe43c72875717d63fdd484c65e9858730d29` | unchanged |
| Source | `e4598622c3ec18534590503313516489b60bbb1a977a591c36a4a43b3aeab45d` | unchanged |
| Input | `535ac1413062b8c5f046b5265ace2b1762e90409aee6e0b3da37e82315a4df8e` | unchanged |
| Evidence | `7f6e41354136814c13e897e0aef289743379e5da0eb98f14ece33a8036a08ab3` | `17413f6a19620fd628fb2bf60f927c1caba7aed97e23f158c63f942ff6bb5242` |
| Plan | `8e752ba5f0555213d431bb307cc212b47d061fef8c91d7e2ae74e82265d5fe98` | `23d3ea2290552fbbfee7396a6019fb17213c756e79dcf5409d1fd8d129c6cec7` |

The old pre-remediation fresh replay had evidence `efa7cf13bfe1d28b1606ef0042b2b4bc8f87d104baf176d4b29e08ad038f6458` and plan `0eb42235d9f80cc50975779b0d119b47aad0b245fb06717d1b4ae6e2bfcc8bc5`.

## Content and coverage proof

- Old and fresh publication input digests: identical `3117a383c2452e72ec21ab40e52fa113f34114c1ddabc29faaf0f80e262d3ce7`.
- Complete projected publication documents: identical.
- Metadata-only first differing paths were `baselineMetrics/*/asOf`,
  `baselineMetrics/*/retrievedAt`, and derived `evidenceDigest` fields.
- Historical facts: 434 present / 36 unavailable.
- Turnout proxies: 428 present / 42 unavailable.
- CVAP: 470 present / 0 unavailable.
- Product coverage preserved: 470 metrics, 2,384 candidate-research documents,
  and 14 measure-research documents.
- Audits: zero duplicate documents, orphans, unresolved references, and
  leakage.

## Deterministic replay and regression proof

The sanitized diagnostic passed with `firebaseInitialized:false` and
`httpCalls:0`. It validated four preserved snapshots, found no semantic
publication differences, classified the old/fresh differences as
capture-metadata-only, and showed identical evidence/plan digests for both
capture-time and ordering probes.

The historical/CVAP test suite passed, including regression assertions that
semantically identical publication snapshots with different capture times or
ordering produce identical G6.4 evidence and plan digests. The corrected
product builder replayed twice identically from the preserved fresh snapshot.
