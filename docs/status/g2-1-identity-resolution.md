# G2.1 canonical identity resolution

Status: activation-ready dry run only. No Firestore write, shadow copy, cutover,
deployment, deletion, commit, or push was performed.

## Source-backed overrides

The typed and validated artifact is
`data/2026/canonical-identity-overrides.json`. It maps the legacy candidates to
official FEC candidate records:

- CA-40: Esther Kim Varet → [H6CA40309](https://www.fec.gov/data/candidate/H6CA40309/);
  Young Kim → [H8CA39240](https://www.fec.gov/data/candidate/H8CA39240/).
- FL-11: Daniel Webster → [H0FL08208](https://www.fec.gov/data/candidate/H0FL08208/);
  Royal Mr. Webster → [H6FL11241](https://www.fec.gov/data/candidate/H6FL11241/).
- NJ-08: both Robert Menendez spellings → [H2NJ08232](https://www.fec.gov/data/candidate/H2NJ08232/),
  as approved merge group `2026-NJ-house-008-robert-menendez`.
- TX-22: Troy Nehls → [H0TX22302](https://www.fec.gov/data/candidate/H0TX22302/);
  Trever Nehls → [H6TX22283](https://www.fec.gov/data/candidate/H6TX22283/).

The planner rejects malformed, duplicate, contradictory, stale-snapshot, and
unsourced overrides. The full validated override contents participate in the mapping
digest.

## Retired legacy contests

- `2026-GA-house-023`: `retire_invalid`, no successor.
- `2026-NM-house-066`: `retire_invalid`, no successor.
- `2026-MP-house-001`: `retire_nonvoting`, audit alias
  `2026-MP-delegate`; never a voting or pickable successor.

Legacy records are retained as aliases. A prediction targeting any retired contest
blocks activation; none were found in the read-only report.

## Merge and provenance policy

Approved many-to-one candidate research is grouped at canonical race/candidate ID.
Identical sourced sections are de-duplicated, distinct sourced sections are sorted
and retained, canonical FEC identity fields win, and distinct timestamp values are
retained as provenance. Any conflicting non-timestamp scalar field is reported as an
unresolved blocker. Contest metrics stay contest-scoped; their existing provenance is
carried in the copy plan without rewriting it.

## Read-only report evidence

The last successful read-only run produced digest
`7650db763671b6951c4650b816c31e67e8cafb9594ac651c9f25cbd41dc2861a`.
Its immediate repeat and one bounded retry failed with Firestore
`RESOURCE_EXHAUSTED: Quota exceeded` while reading the `candidateResearch`
collection group. The mapping implementation is deterministic, but the required
second live-snapshot comparison cannot be certified until read quota is available.

The report now supports an offline snapshot workflow, so quota recovery requires only
one live capture: `--snapshot-out <snapshot.json>` captures the complete input,
`--snapshot-in <snapshot.json>` replays it without Firestore, and
`--approved-snapshot <approved.json>` requires a fresh capture's input and full-plan
digests to equal an approved snapshot before any future copy approval. Add
`--verify-replay` to require two identical local report replays from that same
snapshot.

Counts: 470 canonical voting seats; 35 race mappings; 2,385 candidate mappings;
0 prediction migrations; 538 candidate-research source documents folded into 537
canonical documents; 35 contest-metric copies; 4 duplicate research sections;
0 research conflicts. The report has zero unresolved races/candidates, ambiguous
references, orphaned predictions, and predictions targeting retired contests, with
`safeToActivate: true`.

## Changed files

- `data/2026/canonical-identity-overrides.json`
- `scripts/lib/canonicalMigration.ts`
- `scripts/lib/canonicalMigration.test.ts`
- `scripts/report-canonical-2026-migration.ts`
- `docs/canonical-2026-federal-registry.md`
- `docs/status/g2-1-identity-resolution.md`

## Verification

The following commands exited `0`:

```text
npm run test-canonical-federal-registry
npm run test-canonical-shadow-migration
npm run verify-contests-logic
npm run test-free-sources
npm run lint
npm --prefix ingest run build
npm run build
npm run report-canonical-2026-migration   # one successful clean run
```

The subsequent repeat-report check exited `1` due solely to the Firestore read-quota
error above; it made no writes.

## Remaining production gates

Separate authorization is still required to write canonical shadow documents, copy
the planned dependent documents, atomically migrate predictions, switch the active
surface, and later delete any legacy data. This G2.1 work adds no apply command.
Before any production approval, restore Firestore read quota and run the report twice
against an unchanged snapshot. Both digests must match the successful digest above.
