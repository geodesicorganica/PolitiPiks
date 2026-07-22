# Canonical 2026 federal registry and shadow cutover

The 2026 live federal catalog is derived from seats, not FEC filings. Its voting
surface contains 435 House seats, 33 regular Class II Senate seats, and the declared
Florida and Ohio special Senate seats. FEC candidate filings attach to those seats;
they never create a contest. Candidate IDs with an FEC identity are durable
`fec-<candidate_id>` values.

Washington, DC and the territories are deliberately excluded from the voting-House
catalog: DC, AS, GU, MP, and VI elect non-voting delegates, and Puerto Rico elects a
Resident Commissioner. They remain explicit registry exclusions rather than invalid
House districts, so an ingestion attempt is auditable and cannot become a pickable
federal contest by accident.

## Candidate publication contract

An FEC filing is `filed`, active, visible for research, and pick-ineligible. It only
becomes a pickable candidate after an official ballot source supplies both
`ballotVerifiedAt` and `ballotSourceUrl`, with `qualificationStatus: on_ballot` and
`pickEligibility: eligible`. `candidateState` and `visibility` remain separate from
qualification so withdrawals can be retained without being shown or picked.

## Staged shadow migration

`npm run report-canonical-2026-migration` is read-only. It creates a deterministic
old-to-new mapping and SHA-256 digest for a proposed shadow migration, including
contest documents, candidate IDs, candidate research, contest metrics, and each
prediction's `targetId` and `pick` in one transaction-sized logical update.

The command now has no implicit live-read mode. Capture once with
`npx tsx scripts/report-canonical-2026-migration.ts --snapshot-out <snapshot.json> --verify-replay`, then
replay with `--snapshot-in <snapshot.json> --verify-replay`; offline replay never initializes
Firestore. The `--verify-replay` gate runs a second local replay and rejects a report
or digest difference. A snapshot `inputDigest` covers the normalized live contests (including
their candidates), predictions, candidate research, contest metrics, and validated
overrides. Its `planDigest` covers the entire proposed plan: mappings, merged research
output and provenance, metric copies, and retirement dispositions. Replaying the same
snapshot must produce identical reports and both digests.

Before a separately approved shadow copy, capture one fresh snapshot with
`--snapshot-out <fresh.json> --approved-snapshot <approved.json> --verify-replay`. The command fails
unless both the input and complete-plan digests match the approved snapshot. This is a
comparison gate only; it performs no production write.

Snapshots are schema version 2 files in the ignored
`.artifacts/private/canonical-migration/` directory only. They carry capture time,
project/database identity, collection counts, and projected inputs—not raw Firestore
documents. Capture time is auditable but deliberately excluded from deterministic
digests.

The only exceptions to FEC-normalized identities live in
`data/2026/canonical-identity-overrides.json`. The planner validates that artifact
before using it: every candidate override must use the exact official FEC candidate
URL for its target ID; duplicate/contradictory entries and unapproved many-to-one
targets are rejected. Override contents are part of the mapping digest. Approved
many-to-one aliases preserve all distinct sourced research sections, de-duplicate
identical sections, force the canonical FEC identity fields, retain timestamp
provenance, and block on conflicting substantive scalar values.

Before activation, the report must show no unresolved seat or candidate identities
and no orphaned prediction mappings. The canonical documents are written alongside
legacy documents only after separate production-write approval. Navigation and query
surfaces must select one registry generation, never both. After a verified cutover,
legacy documents are retained as aliases; they are not deleted by this migration.

Production application of the mapping and any eventual legacy deletion both require
separate approval. This repository intentionally provides no production apply command.
