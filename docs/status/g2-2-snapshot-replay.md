# G2.2 private snapshot and deterministic replay

Status: Local acceptance complete; one-live-capture certification pending separate user authorization.

## Schema and privacy boundary

Snapshot schema version 2 contains `schemaVersion`, `capturedAt`, `projectId`,
`databaseId`, `collectionCounts`, `inputDigest`, and projected inputs. The accepted
project/database are `politipiks` and
`ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a`.

Race inputs contain only seat identity and candidate ID/FEC identity. Prediction
inputs contain only `id`, `targetId`, and `pick`; user IDs, league IDs, and every
other prediction field are stripped. Research and metric inputs retain their complete
document payloads because the merge/copy plan must preserve their sourced content and
provenance. Unsupported Firestore values, malformed records, duplicate identities,
wrong project/database, unsupported versions, count mismatches, and digest tampering
are rejected.

`capturedAt` is excluded from deterministic digests. `inputDigest` covers every
projected contest/candidate, prediction, research document, metric document, and
validated override. `planDigest` covers the complete resulting plan: mappings,
canonical merged-research documents (including provenance), complete metric-copy
documents, and retirement dispositions.

## Files and commands

Only `--snapshot-out` can read Firestore, and it dynamically imports the bootstrap
only after its private path is validated. Output is allowed only below the ignored
`.artifacts/private/canonical-migration/` directory; all other paths are refused.
`--snapshot-in` uses Node filesystem/JSON and planner code only, with no Firebase
bootstrap or credentials loaded.

## Firestore Timestamp codec

At the live-capture boundary only, native Firestore `Timestamp` instances are encoded
losslessly as `{ "__firestoreType": "timestamp/v1", "seconds": <integer>,
"nanoseconds": <integer> }`. Seconds and nanoseconds retain exact signed/integer
precision; timestamps are never converted to ISO strings or milliseconds. Offline
validation accepts only that exact three-key tag and rejects malformed tags, native
class instances, Date values, and all other unsupported Firestore types. Tagged values
participate unchanged in JSON replay, research provenance, input digests, and plan
digests. A future apply tool must decode this tag back to a Firestore Timestamp without
loss; no apply tool exists today.

```text
# Future one-live-capture procedure; do not run without authorization.
npx tsx scripts/report-canonical-2026-migration.ts --snapshot-out .artifacts/private/canonical-migration/fresh.json --verify-replay

# Offline replay, no Firestore.
npx tsx scripts/report-canonical-2026-migration.ts --snapshot-in .artifacts/private/canonical-migration/fresh.json --verify-replay

# Future approved-plan gate; both inputDigest and planDigest must match.
npx tsx scripts/report-canonical-2026-migration.ts --snapshot-out .artifacts/private/canonical-migration/fresh.json --approved-snapshot .artifacts/private/canonical-migration/approved.json --verify-replay
```

Local G2.2 verification commands and recorded exit codes:

```text
npm run test-canonical-federal-registry   # 0
npm run test-canonical-shadow-migration  # 0
npm run verify-contests-logic             # 0
npm run test-free-sources                 # 0
npm run lint                             # 0
npm --prefix ingest run build             # 0
npm run build                             # 0
```

The migration test includes an offline CLI replay with deliberately missing Firebase
credential paths and verifies it exits 0; it also checks unsafe output paths fail
before the live-import branch.
