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

## Active-catalog activation contract

`canonical-2026-shadow-v1` is an immutable identity-migration artifact and is not
publication-ready: its exact plan has no `closeAt` values or candidate arrays. It
must never be activated. The next candidate generation is
`canonical-2026-shadow-v2`, whose race payload includes the approved versioned
product prediction lock, optional reviewed official-poll-close research, and
complete candidate publication data.

The G3 release candidate adds a separately guarded activation tool, not an
authorized production operation. It promotes the already-certified shadow
generation into active `races`, nested `candidateResearch`, and `contestMetrics`
paths alongside legacy aliases, then flips exactly one selector document:
`catalogActivations/canonical-2026`.

The selector is authoritative for federal identity. Its `pending` state fails
closed, `active` selects the certified canonical generation, and `rollback`
returns to `legacy-2026` without deleting either generation. Canonical writes must
verify exactly before the selector becomes active. Client reads must use the shared
catalog abstraction; migration namespaces are never application data sources.

Any production mode requires a clean committed implementation, direct `npx tsx`
launch, an ignored approved snapshot, every project/database/source/digest/count
guard, and a successful bounded shadow verification. On this Windows workstation,
do not use `npm run` for these modes because its wrapper can strip named flags.

```powershell
npx tsx scripts/activate-canonical-2026.ts --snapshot-in <private-snapshot>
npx tsx scripts/activate-canonical-2026.ts --apply --snapshot-in <private-snapshot> <all-certified-guards>
npx tsx scripts/activate-canonical-2026.ts --verify-only --snapshot-in <private-snapshot> <all-certified-guards>
npx tsx scripts/activate-canonical-2026.ts --rollback --snapshot-in <private-snapshot> <all-certified-guards>
```

The default command is a credential-free dry-run. Apply, verification, rollback,
and any eventual legacy deletion each require a separate production authorization.

## v2 prediction lock, official research, and capture boundary

The v2 publication input has one approved product policy:
`canonical-2026-pre-election-lock-v1`, `2026-11-03T00:00:00.000Z`
(Timestamp seconds `1793664000`, nanoseconds `0`), covering all 470 canonical
federal contests. It locks picks before Election Day begins in every covered U.S.
timezone. `closeAt` is exclusively this product safety lock, never an official
poll-close assertion. Schema version 3 also retains strict, reviewed state/local
authority rules and assignments as optional `officialPollClose*` research; 111 of
470 records are currently reviewed. Incomplete research is reported, not a
publication blocker. Invalid reviewed evidence remains a hard failure. A later
policy can shorten a lock only with complete official evidence and separate review;
it cannot automatically extend one.

`report-canonical-2026-publication.ts` accepts `--snapshot-in`, `--snapshot-out`,
`--verify-replay`, `--approved-snapshot`, and `--approve-snapshot`. Snapshot paths
are private JSON files only. Offline replay never imports Firebase; a future live
capture requires explicit matching project/database IDs and uses exclusive output
creation. An approval is a separate non-overwriting local copy after an offline
replay and review, never an implicit acceptance of v1/v2 evidence.
