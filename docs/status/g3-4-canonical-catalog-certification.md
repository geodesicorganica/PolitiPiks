# G3.4 canonical 2026 catalog certification

Status: catalog-certified offline. The existing schema-v3 G3.3 snapshot was
replayed and approved without Firebase initialization, Firestore access, or any
production write. This is not a prediction or activation certification.

## Readiness split

- `catalogReady: true`: the 470 canonical 2026 federal races are safe to browse
  and research.
- `predictionReady: false`: FEC filings are deliberately `filed`, visible, and
  `ineligible` until an official ballot authority establishes pick eligibility.
- `publicationReady: false`: it remains the stricter, pick-capable/activation
  gate and cannot be satisfied by this catalog certification.

Every canonical race now has `eligibleCandidateIds`. The approved payload has an
empty list for every captured FEC candidate; an empty list means “Picks not yet
available,” not a missing catalog record. The app disables those controls and
Firestore rules independently reject a race prediction whose `pick` is absent
from that list on either create or update.

## Offline certification evidence

- Parent implementation commit: `29b41f76e195e4e967a3a924a85357e53a06a003`
- Nested-app implementation commit: `38f001f620e46a4b8d0068af7d28c0ee1bc7a07d`
- Generation: `canonical-2026-shadow-v2`
- Fresh/approved snapshot input digest: `3117a383c2452e72ec21ab40e52fa113f34114c1ddabc29faaf0f80e262d3ce7`
- Canonical mapping digest: `7650db763671b6951c4650b816c31e67e8cafb9594ac651c9f25cbd41dc2861a`
- Canonical plan digest: `51ea9f9aec0dcf13e046937ee89cf2b853a430dc105f0df2f4f0e65f59098078`
- Product-lock digest: `cbe521451a3dea2d7ccc7426baa04cd7b425012c1341b8804b8aa02ce04e0dc1`
- Catalog namespace digest: `c008c8a46205723c8f4fdf6c9e3b7a3520e7de855d448031754bfa500c5b35c9`

The offline replay was run twice internally by `--verify-replay`, then replayed
again against the no-clobber approved private snapshot. All compared receipts and
digests matched. The private artifacts remain ignored and their contents are not
copied here.

| Active output | Count |
| --- | ---: |
| Canonical races | 470 |
| Candidate-research documents | 537 |
| Contest-metric documents | 464 |
| Output orphan research | 0 |
| Output orphan metrics | 0 |
| Unresolved identities/predictions | 0 |

Source coverage excluded from the active v2 namespace is retained in the source
snapshot and reported, not deleted: 1,550 candidate-research documents and 522
contest-metric documents are historical or unmapped to a canonical 2026 race.

## Verification (all exit 0)

Parent (`C:\Projects\Politipiks`):

```powershell
npm run test-canonical-publication
npm run test-canonical-publication-cli
npm run test-canonical-activation
npm run test-canonical-federal-registry
npm run test-canonical-shadow-migration
npm run test-canonical-shadow-executor
npm run test-canonical-activation-emulator
npm run test-deadline-registry
npm run audit-2026-deadline-registry
npm run verify-contests-logic
npm run test-free-sources
npm run lint
npm --prefix ingest run build
npm run build
npx firebase emulators:exec --config scripts/firebase.emulator-test.json --only firestore "npx tsx scripts/verify-firestore-league-flow.ts"
npx tsx scripts/report-canonical-2026-publication.ts --snapshot-in .artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json --verify-replay --approve-snapshot .artifacts/private/canonical-migration/publication-v2-approved-2026-07-25.json
npx tsx scripts/report-canonical-2026-publication.ts --snapshot-in .artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json --verify-replay --approved-snapshot .artifacts/private/canonical-migration/publication-v2-approved-2026-07-25.json
```

Nested app (`C:\Projects\Politipiks\politipick\.remote-source`):

```powershell
npm run lint
npm run lint:rules
npm run test-contest-catalog
npm run verify-firestore-league-flow
npm run verify-browser-league-flow
npm run build
```

`lint:rules` exits 0 with the pre-existing open-read warning. Browser and rules
tests cover the 2026/live default, closed controls, unavailable pick controls,
and rejection of ineligible race picks.

The default parent `npm run verify-firestore-league-flow` launcher could not
start because a pre-existing July 24 Java process owned port 8080; it performed
no test writes. The same parent test passed with exit 0 through the repository's
existing port-8081 emulator test configuration shown above. No process was
stopped or modified.

## Remaining production gates

No selector has changed and this goal does not authorize activation, shadow copy,
deployment, deletion, or push.
Before any future pick-capable publication, an approved source-backed ballot
qualification process must populate eligible candidates and a separately
authorized offline certification must make `predictionReady` true. A later
activation requires separate review and authorization.
