# G3.1 canonical publication-payload remediation

Status: local implementation is complete; prediction-lock publication is no longer
blocked by incomplete official poll-close research. The approved product lock is
`canonical-2026-pre-election-lock-v1` at `2026-11-03T00:00:00.000Z` for all 470
canonical federal races. v1 is explicitly blocked from activation. No production Firestore read,
capture, write, shadow copy, activation, rollback, deployment, deletion, commit,
or push is authorized or performed.

## Discovered v1 limitation

The offline audit of the actual `canonical-2026-shadow-v1` promotion plan reports:

- 470 federal races;
- 470 races missing `closeAt`;
- 470 races with no candidates;
- 2,389 source candidate identities but zero canonical candidates in promoted race arrays;
- 537 research documents whose candidate is absent from the corresponding race;
- `publicationReady: false`.

The v1 snapshot projection retained identity-only candidates. It cannot recreate
candidate names, party, eligibility, ballot verification, provenance, or a
source-backed deadline. v1 remains immutable historical evidence and is rejected
by the v2 activation contract.

## v2 contract

`canonical-2026-shadow-v2` is a publication schema, not a mutation of v1. Every
race must carry the canonical registry identity, 2026/live/status fields, real
lossless product-lock Timestamp `closeAt`, compatibility-only `closeDate`,
`deadlineKind: product_safety_lock`, policy identity/version/reason, and
source/verification
metadata, and a complete canonical candidate array. Every deadline must provide an
election ID, jurisdiction, local poll-closing time, IANA timezone, UTC timestamp,
official URL, and retrieved/reviewed times. Multi-timezone jurisdictions need
explicit records; date-only or workstation-timezone conversion is rejected.

Candidates retain canonical FEC identity, name, party, external IDs, state,
visibility, qualification and pick eligibility, ballot evidence, and provenance.
Filed or unqualified candidates remain browseable but cannot be picked. An eligible
candidate must be `on_ballot` with official ballot timestamp and URL. A race with
no eligible candidate remains browseable and fails closed for picks.

The publication audit reads the exact active-document plan and reports race/deadline
coverage, candidate mapping/merge/disposition coverage, missing fields and IDs,
eligible-evidence failures, duplicate/orphaned references, research and metric
integrity, unresolved prediction mappings, and `publicationReady`.

Only a `publicationReady` v2 plan can produce its immutable schema-v3
certification: input, mapping, plan, and namespace digests plus expected counts and
source commit are derived from the actual documents. The v2 activation builder
requires that certification to match the same audited 470-seat plan.
The activation emulator fixture is generated through this real 470-seat builder
chain before promotion; it is not hand-written race data.

The schema-version-3 registry contains one approved product policy and 11 reviewed
official authority rules covering 111 supplemental poll-close records. Official
research must never be copied into `closeAt`; incomplete research is a reported
post-MVP gap, while malformed reviewed evidence fails closed. No deadline is
inferred from a date string or workstation timezone.

The U.S. Election Assistance Commission and USAGov direct voters to state and
local election offices for polling-place hours. G3.1 therefore cannot substitute a
national secondary compilation for the required official record set. Each future
record must be reviewed against the responsible election office and include the
official URL and timestamp fields required by the v2 schema.

G3.2.1 replaces the impractical one-record-per-seat source model with reviewed
authority rules and deterministic seat assignments; generated records retain the
full provenance and use the earliest applicable poll close. Its registry remains
0 reviewed rules and 0/470 generated records. See
`docs/status/g3-2-deadlines-and-capture-readiness.md`; no fresh capture is allowed
until that report is resolved.

## Correct deployment order

1. Commit and review both release implementations.
2. Deploy selector-aware rules.
3. Deploy the selector-aware app while the selector is absent (legacy remains
   selected).
4. Verify deployed legacy-only federal display.
5. Obtain separate authorization for one fresh v2 capture and certification.
6. Verify v2 shadow.
7. Obtain separate authorization for v2 activation.
8. Verify canonical documents and selector, then run production smoke tests.
9. If needed, roll back only the selector; neither generation is deleted.

The next authorization is one fresh v2 capture and certification, not activation.
