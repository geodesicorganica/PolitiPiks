# G2.3 live certification

Status: certified by one authorized read-only capture. This is a dry-run
certification only; it does not authorize a Firestore write, shadow copy,
cutover, deployment, deletion, commit, or push.

## Capture and replay

- Capture time: `2026-07-22T03:27:26.295Z`
- Project/database: `politipiks` /
  `ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a`
- Snapshot schema: `2`
- Private, ignored paths:
  - `.artifacts/private/canonical-migration/fresh-after-timestamp-codec.json`
  - `.artifacts/private/canonical-migration/approved.json`
- The two private files are byte-identical. No snapshot contents are recorded
  here.
- `offlineReplayVerified=true`, `operation=dry-run`, and `applied=false` for
  both the live capture's local replay and the approved-file offline replay.

## Sanitized result

- `safeToActivate=true`; unresolved races/candidates, ambiguous references,
  orphaned predictions, retired-contest predictions, and research conflicts are
  all zero.
- Canonical voting federal seats: `470`.
- Mapping counts: `35` races, `2,385` candidates, and `0` predictions.
- Candidate-research copy inputs/documents: `538` / `537`.
- Metric copies: `35`.
- Captured collection counts: `467` races, `6` predictions, `2,088`
  candidate-research documents, and `986` contest-metric documents.
- Digests:
  - `inputDigest`: `d37f86d5dfdb168a1e98b190b61b00f0def1303175cafedfa578403f07e604eb`
  - `mappingDigest`: `7650db763671b6951c4650b816c31e67e8cafb9594ac651c9f25cbd41dc2861a`
  - `planDigest`: `79e6d71411c675f01508618cbb138551d4c9f4f7cf9508f2d66d62d780dad7b0`
- The input and plan digests are valid 64-character SHA-256 values. All `2,495`
  Firestore timestamp tags validated as the exact `timestamp/v1` form.

## Commands and exit codes

```powershell
npx tsx scripts/report-canonical-2026-migration.ts --snapshot-out .artifacts/private/canonical-migration/fresh-after-timestamp-codec.json --verify-replay
# exit 0

npx tsx scripts/report-canonical-2026-migration.ts --snapshot-in .artifacts/private/canonical-migration/approved.json --verify-replay
# exit 0

cmd.exe /d /c fc /b "C:\Projects\Politipiks\.artifacts\private\canonical-migration\fresh-after-timestamp-codec.json" "C:\Projects\Politipiks\.artifacts\private\canonical-migration\approved.json"
# exit 0; no byte differences
```

## Remaining production gates

The approved snapshot is an immutable input to a future, separately approved
production decision. Before any shadow copy or cutover, obtain explicit write
authorization, re-evaluate the approved plan against a newly authorized live
capture, and require matching input and plan digests. Legacy documents remain
aliases until a separately approved retirement process; no apply command exists.
