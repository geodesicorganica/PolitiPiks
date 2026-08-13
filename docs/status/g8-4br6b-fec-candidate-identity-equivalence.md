# G8.4BR6B — Offline FEC candidate identity equivalence

Status: **locally certified on 2026-08-12; not ready for an executor**. No
disposition was executed. No production Firebase/Firestore read, write,
capture, selector operation, activation, deployment, rollback, smoke, external
network request, branch change, push, overwrite, or deletion occurred.

## Starting state and boundaries

- Branch: `codex/politipiks-canonical-shadow-release`.
- Starting HEAD: `17159857038b90a3659c2435d68806f7b515b0aa`.
- Immutable BR6A plan digest:
  `15f456e459c18fd0db51275b0c22de7b1fe5f9fb6b3dca841f111b9469c28cd9`.
- Immutable BR5B snapshot: 35,148,779 bytes; SHA-256
  `425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3`.
- The ten unrelated modified/untracked paths present at start were excluded
  from reads that could mutate them and from the focused staging allowlist.
- BR6A source, contracts, committed evidence, and ignored private plans remain
  unchanged.

The implementation is offline-only. Its child environment uses deliberately
missing credential paths and a blackholed proxy. Emulator children remove proxy
and credential variables only in the child, use the loopback allowlist, disable
update checks, and target `demo-no-project`.

## Versioned contracts

BR6B adds these contracts without replacing BR6A:

- `g8-4br6b-fec-candidate-equivalence/v1`;
- `g8-4br6b-revised-disposition-plan/v1`;
- `g8-4br6b-fec-equivalent-pointer-rules/v1`;
- `g8-4br6b-revised-disposition-report/v1`;
- `g8-4br6b-offline-runner-receipt/v1`; and
- `g8-4br6b-local-gate-receipt/v1`.

The private plan records only digests for candidate equivalence. The committed
aggregate evidence contains no candidate names, raw FEC candidate IDs,
production paths, raw document bodies, or production values. Complete actual
documents remain exclusively in the immutable ignored BR5B snapshot as private
rollback evidence.

## Identity policy and validation

A candidate pair is accepted only when the same valid, nonempty FEC candidate
ID occurs exactly once on each side of one canonical race. The planner rejects
invalid, duplicate, reused, cross-seat, missing, ambiguous, and contradictory
IDs. It derives the observed counts from the validated snapshot; no opportunity
count is hard-coded.

Each proposed pair is cross-checked against the rebuilt certified current
bundle, approved publication mapping, canonical 2026 federal seat registry,
nested official-FEC identity baseline, and normalized FEC finance fact/2026
record when present. The checks bind office, state, district/seat, cycle,
canonical contest, current candidate ID, and official FEC source evidence.
Canonical candidate IDs plus eligibility/publication fields always come from
the certified current bundle. A production-only value is preserved only if it
matches the already validated BR6A publication lineage at the equivalent FEC
pointer.

Candidate order, normalized name, party, incumbent flag, and Bioguide ID are
diagnostic-only. Focused synthetic tests prove that agreement on those fields
cannot establish identity and that a duplicate FEC ID fails closed.

## Derived equivalence result

| Measure | Count |
| --- | ---: |
| Race conflicts evaluated | 429 |
| Actual / certified candidates | 2,105 / 2,104 |
| Accepted FEC pairs | 2,097 |
| Rejected FEC pairs | 7 |
| Fully resolved races | 425 |
| Remaining races | 4 |
| Invalid FEC candidates | 0 |
| Duplicate FEC IDs | 4 |
| Reused FEC IDs across races | 0 |
| Seat mismatches | 0 |
| Contradictory evidence | 0 |
| Accepted pairs with normalized finance evidence | 2,087 |
| Accepted pairs using the certified official-FEC baseline without a finance row | 10 |

The seven rejected pairs consist of four duplicate-actual-FEC-ID exceptions
and three certified candidates without a unique actual counterpart. The four
affected races remain unresolved. No name, order, party, incumbency, or
Bioguide inference was used to repair them.

Equivalence digests:

- pairs: `679d7ee0fd0da205a9ea497c4e9f4341724684af2a72a079be3244cc3266d0de`;
- races: `95b4829a9517dfee60ccf1b6bfb47957ce0f85de322a757628297f2cdda3b2b6`;
- evidence: `026c18f9f1b4f12cb60e15121486bb5f01886b3aa21f96ecae13781dd0e38947`.

## Revised draft dispositions

All 858 paths were rebuilt after FEC equivalence matching, with no duplicate or
omitted path:

| Draft disposition | Count |
| --- | ---: |
| Deterministic merge | 854 |
| Unresolved/no-op | 4 |
| Replace with certified | 0 |
| Preserve current | 0 |

The plan contains 65,842 pointer rules: 50,498 current-certified authoritative,
7,615 existing values backed by validated BR6A lineage, 7,722 runtime metadata,
and seven remaining identity conflicts. Unsupported production-only,
conflicting-lineage, and ambiguous-lineage counts are zero. All proposed output
and rollback digests are reproducible and complete.

Revised plan digests:

- entries: `460c7181f0be81873d9b2da47f294709eef8308d713b8406402d04eeaa6b8855`;
- aggregate: `ca9800b40738f9062a10debc748ab9a8e1cf3f7bc0a29134cb8deb357c432127`;
- plan: `7b5da128cad3ee688949209643ab63626e2a70a18b6765f8a57b9956f162ab48`.

`readyForExecutor` remains `false`: 854 paths are deterministically resolved,
four are unresolved, and seven policy conflicts remain. This certification
does not authorize or execute any draft disposition.

## Exact next evidence batches

The remaining races require unique, noncontradictory official FEC candidate
mapping evidence. Paths are represented only by digests:

| Batch | Race-path digest | Rejected pairs | Exception classes |
| --- | --- | ---: | --- |
| `4e82f06a222dc104` | `358ba3216781b88218872382c7ff573b0e1d13cd746a5e830bb5eb3b3e2ba15d` | 2 | duplicate actual FEC ID; missing actual candidate |
| `46a05a678bf80dbc` | `3b87652ffcf7ba07782593cee70b81bae8bfa1df6708de2b0c775436f7387d93` | 2 | duplicate actual FEC ID; missing actual candidate |
| `0854a0af88e0adf1` | `b8bc47aebb6f9344119e622508a65a2c529634016e525de40f665718d220c229` | 2 | duplicate actual FEC ID; missing actual candidate |
| `6641d41fcb68f4a4` | `f9275a4e52230e269d1d2522960a7e807ec03b72b57e1cae719cdfa5ff448843` | 1 | duplicate actual FEC ID |

## Deterministic replay and safety

Two independent builds and `--verify-replay` exited `0/0/0`. All four private
plan files, including the isolated replay child, are byte-identical at
81,061,814 bytes and SHA-256
`1f0b71444b2958ab012a03fde3b74f8603df4035f843a2363361d584a7b6752e`.
All three sanitized reports are byte-identical at 10,760 bytes and SHA-256
`7ca562ab508b29b22187975d5793f55f6ee7cbba56adaa5624d1c357882a28a5`.
Every stderr stream was empty.

The snapshot re-hashed identically before and after both the offline builder
and local gate matrix. Both receipts report Firebase imported `false`,
credentials loaded `false`, network requests `0`, and production operations
`0`. Emulator configuration reports zero credential variables and zero
production targets.

## Verification ledger

The stop-on-first-failure runner completed every gate once. All exits were `0`:

1. BR6B focused equivalence/disposition tests.
2. BR6A disposition regression.
3. BR5A analysis regression.
4. BR5C offline-runner regression.
5. BR5A preflight regression.
6. BR4A activation-recovery regressions.
7. G8.3A activation regressions.
8. BR3A structured-audit regressions.
9. G8.2A product-shadow regressions.
10. Local-product-bundle regression.
11. TypeScript.
12. Lint.
13. Production build.
14. BR5A capture emulator on port 18083.
15. BR4A activation emulator on port 18082.
16. BR3A audit emulator on port 18081.
17. G8.3A activation emulator on the approved 8081 configuration.
18. G8.2A shadow emulator on the approved 8081 configuration.
19. `git diff --check` after all source, evidence, and documentation edits.

The build gate emitted its known bounded warning stream (417 bytes, SHA-256
`bb4c3a9c449877a8184763f9595d15520030fa61162f09c3441ea9c949d694c8`)
and exited `0`; all other non-offline gate stderr streams were empty. Exact
per-gate stdout digests and exits are retained in the sanitized aggregate JSON.

## Focused allowlist and final state

Only these eight paths are eligible for staging:

- `scripts/lib/g8V2FecCandidateEquivalence.ts`;
- `scripts/lib/g8V2FecCandidateEquivalence.test.ts`;
- `scripts/report-g8-4br6b-fec-equivalence.ts`;
- `scripts/run-g8-4br6b-offline-equivalence-builds.ts`;
- `scripts/run-g8-4br6b-local-gates.ts`;
- `docs/status/g8-4br6b-fec-candidate-identity-equivalence.md`;
- `docs/status/g8-4br6b-fec-candidate-identity-equivalence-evidence.json`; and
- `docs/2026-live-50-state-roadmap.md`.

The containing focused commit hash is necessarily reported in the final
handoff rather than embedded in its own content. Final status remains
**locally certified, four races unresolved, `readyForExecutor=false`, and no
disposition executed**.
