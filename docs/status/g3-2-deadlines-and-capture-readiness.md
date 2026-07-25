# G3.2 deadlines and capture readiness

Status: local product-lock implementation is ready for release-gate review. The
official poll-close research remains intentionally incomplete (11 reviewed rules,
11 reviewed states, 111/470 generated records), but it is no longer a prediction
lock blocker. No
Firestore access, snapshot capture, production read/write, shadow copy,
activation, rollback, deployment, deletion, commit, or push occurred in G3.2.

## G3.2.1 normalized deadline evidence boundary

The registry is schema version 3. It contains reviewed authority rules plus
explicit canonical-seat assignments; generated records are never a hand-maintained
second source of truth. A reviewed state rule may therefore safely expand to all
of its affected House and Senate contests while retaining one direct official
source and one review trail. The checked-in registry is deliberately empty until
that review exists.

For prediction integrity, every canonical federal contest receives the approved
`canonical-2026-pre-election-lock-v1` `closeAt` Timestamp
`2026-11-03T00:00:00.000Z` (seconds `1793664000`, nanoseconds `0`). This is a
conservative product safety lock before Election Day begins in every covered U.S.
timezone, not a claim about when polls close. Reviewed official rules remain
supplemental `officialPollClose*` research. A future release may shorten a lock on
complete official evidence; it cannot automatically extend one.

The canonical policy digest is
`cbe521451a3dea2d7ccc7426baa04cd7b425012c1341b8804b8aa02ce04e0dc1`.
The credential-free audit reports 470/470 product locks, zero missing or invalid
locks, 111 reviewed official records, 359 official-research gaps, and
`publicationLockReady: true`.

The initial source review established the required authority model:

- [New York State Board of Elections, Election Information](https://elections.ny.gov/election-information)
  identifies the November 3, 2026 general election and a 9:00 p.m. poll close.
- [Georgia Secretary of State poll-worker manual](https://georgiapollworkers.sos.ga.gov/Shared%20Documents/Georgia%20Poll%20Worker%20Manual%202021.pdf)
  states the standing 7:00 p.m. close procedure.
- [USAGov voting-place guidance](https://www.usa.gov/find-polling-place) and the
  [Election Assistance Commission's in-person voting guidance](https://www.eac.gov/how-do-i-vote-in-person-on-election-day)
  direct voters to state/local authorities; neither is treated as a deadline source.

No 2026 value has been populated from a search snippet, national aggregator,
or workstation-timezone conversion. The current partial audit reports 359
unresolved canonical election IDs without contacting Firestore. Multi-timezone
jurisdictions require a separately reviewed district/seat treatment and cannot be
collapsed to a guessed statewide UTC instant.

## Incremental reviewed-state matrix

| State | Rule | Generated seats | Review result | Source |
| --- | --- | ---: | --- | --- |
| GA | 7:00 p.m. ET uniform statewide | 15 | reviewed | [Georgia 2026 Elections Calendar](https://sos.ga.gov/2026-elections-calendar-1) |
| NY | 9:00 p.m. ET uniform statewide | 26 | reviewed | [New York Election Information](https://elections.ny.gov/election-information) |
| NC | 7:30 p.m. ET uniform statewide | 15 | reviewed | [NCSBE 2026 general election](https://www.ncsbe.gov/news/events/election-day-2026-general-election) |
| OH | 7:30 p.m. ET uniform statewide | 16 | reviewed | [Ohio 2026 voting schedule](https://www.ohiosos.gov/elections/voting-schedule-text-only) |
| RI | 8:00 p.m. ET uniform statewide | 3 | reviewed | [Rhode Island 2026 election calendar](https://vote.sos.ri.gov/Forms/Elections/Guides/2026ElecCal.pdf) |
| SC | 7:00 p.m. ET uniform statewide | 8 | reviewed | [South Carolina Election Commission](https://scvotes.gov/event/statewide-general-election-4/) |
| VT | 7:00 p.m. ET uniform statewide | 1 | reviewed | [17 V.S.A. §2561](https://legislature.vermont.gov/statutes/section/17/051/02561) |
| VA | 7:00 p.m. ET uniform statewide | 12 | reviewed | [Virginia voter rights](https://www.elections.virginia.gov/casting-a-ballot/voter-rights/) |
| WA | 8:00 p.m. PT ballot-return deadline | 10 | reviewed | [Washington 2026 calendar](https://www.sos.wa.gov/elections/elections-calendar/dates-and-deadlines) |
| WV | 7:30 p.m. ET uniform statewide | 3 | reviewed | [West Virginia 2026 calendar](https://sos.wv.gov/media/467/download?inline=) |
| WY | 7:00 p.m. MT uniform statewide | 2 | reviewed | [Wyoming Secretary of State FAQ](https://sos.wyo.gov/faqs.aspx?root=ELEC) |

The 2026 New York political calendar was reopened in the independent pass;
Georgia's current 2026 calendar supplies the November election context and poll
hours. Both states are wholly Eastern Time. Their line-extension rules are context
only and do not extend `closeAt`.

## Research blockers after all ten state batches

The following are post-MVP official-research gaps, not release blockers for the
conservative product lock:

- **ME:** 21-A M.R.S. §626 permits qualifying small municipalities to close when
  every registered voter has voted. The next source is each affected municipal
  election authority's 2026 polling plan; a generic 8:00 p.m. rule would be late.
- **MT:** MCA 13-1-106 permits qualifying small polling places to close once all
  intended voters have voted. The next source is each affected county election
  administrator's 2026 polling plan; the usual 8:00 p.m. hour is not earliest.
- **NH:** RSA 659 allows a place to close when the checklist and absentee count
  show every voter has voted. The next source is every affected local moderator's
  2026 election order/checklist; the normal 7:00 p.m. hour is not earliest.
- **ND:** N.D.C.C. §16.1-01-03 delegates a 7:00–9:00 p.m. local close to the
  governing city/county body. The next source is each 2026 local resolution plus
  official Central/Mountain geography; assigning 7:00 p.m. statewide would be an
  unsupported assumption.

Other research-ready but not yet integrated states require an independent source
reopen and, where applicable, official district-to-timezone evidence before their
rules can be marked reviewed. This includes AL, AK, AZ, FL, ID, IN, KS, KY, MI,
NE, OK, OR, SD, TN, and TX. No latest-close shortcut has been used.

## Capture boundary implemented locally

`scripts/report-canonical-2026-publication.ts` now accepts private schema-v3
snapshots only under `.artifacts/private/canonical-migration/`. Offline
`--snapshot-in` validates a narrow projected schema and never imports the
Firestore bootstrap. The only bootstrap import is dynamically reached by the
future `--snapshot-out` branch after explicit project/database validation.

The boundary validates project/database identity, collection counts, duplicate
identities, field allowlists, supported timestamp tags, digest integrity, and the
complete deadline registry. It rejects v1/v2 snapshots. It replay-checks a snapshot
twice deterministically; an optional approved schema-v3 snapshot compares all
stable receipt evidence. Output and first-approval copies use exclusive creation,
so existing evidence cannot be overwritten. Capture receipts contain only schema,
identity, time, counts, audit totals, digests, and certification status—not source
document contents or user/league data.

## Local verification performed

- `npm run test-deadline-registry` — exit 0.
- `npm run test-canonical-publication-cli` — exit 0. The child-process test used
  deliberately invalid Firebase credentials and proved offline replay, v1/v2,
  malformed/duplicate/tampered input, unsafe path, identity, no-clobber,
  deterministic replay, approved mismatch, and first-approval safeguards.
- `npm run test-canonical-publication` — exit 0.
- `npm run audit-2026-deadline-registry` — exit 0: 470/470 product locks and
  111/470 reviewed official records.
- `npm run test-canonical-activation` and its Firestore-emulator counterpart —
  exit 0; activation rejects v1 and requires the product-lock race contract.
- `npm run lint` — exit 0.
- Rule-expansion tests additionally cover deterministic sorting/digests, shared
  evidence, missing/duplicate assignments, official-domain enforcement, schema-v2
  legacy rejection, UTC/DST round trips, statewide Senate earliest-close selection,
  district-specific House selection, and unsafe multi-close rejection.
- `npx tsx scripts/activate-canonical-2026.ts --snapshot-in
  .artifacts/private/canonical-migration/approved.json` — exit 1 as expected,
  before Firestore initialization: the immutable v1 generation is rejected.

The CLI test uses explicitly labeled `example.gov` fixture records only. They are
not stored in the registry and do not claim to be official election evidence.

## Remaining production gates

1. Complete and independently review jurisdiction rules and seat assignments for
   all 50 states, including every multi-timezone/local-option treatment, then run
   the generated 470-seat deadline audit successfully.
2. Run all prescribed parent and nested release gates and complete the required
   two-repository review.
3. Make focused local commits only after those gates pass.
4. Obtain a separate authorization for exactly one fresh read-only v2 capture and
   its offline certification. That authorization is not an approval to write,
   shadow-copy, activate, deploy, or delete.
