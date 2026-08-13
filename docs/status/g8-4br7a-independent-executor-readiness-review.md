# G8.4BR7A — Independent executor-readiness review

Status: **PASS on 2026-08-13 for the narrow question “is the BR6CR plan safe
to use while designing a local executor?”** This review does not authorize an
executor, a disposition, a production read or write, a selector action,
activation, deployment, rollback, smoke, deletion, network request, or push.

## Independent boundary

The BR7A verifier is Firebase-free and does not import or call the BR6A,
BR6B, or BR6C planners. It parses the versioned plans as hostile JSON and uses
its own strict key-set checks, canonical JSON digest, lossless Firestore-value
validation, durable candidate pointer resolution, output reconstruction, and
rollback verification. Only local filesystem and SHA-256 primitives are used.

The review covered committed changes from `1715985` through `683b518` for
weakened guards, hidden assumptions, stale runtime metadata, unsafe merges,
and implicit executor behavior. No P0 or P1 finding remains. One important
trust boundary was tested explicitly: BR6CR carries forward the 854 already
deterministic BR6B entries, so BR7A independently reconstructed every one of
those outputs instead of accepting the carry-forward as proof.

## Input identities

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| BR6CR plan | 75,926,293 | `654349812a2d2806b75b58e0f57ba09713bb27d22f955c85a100cc70cf7a80ec` |
| BR5B snapshot | 35,148,779 | `425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3` |
| Certified activation source bundle | 23,043,218 | `8387a248be9cf08c3d4a380748be5dd6744c0d81b081d770804db1cf1edbf7b4` |
| BR6B plan | 81,061,814 | `1f0b71444b2958ab012a03fde3b74f8603df4035f843a2363361d584a7b6752e` |
| G2.1 overrides | 2,137 | `dae9946a70fb23d935a86f9affdcab97459d07a4024a84e4e0b6c3a5559a5b77` |

The activation document envelope was independently derived from the certified
bundle identity rather than copied from snapshot bodies. The derived inventory
matches all 858 conflicting snapshot paths in exact lexicographic order: 429
race paths and 429 metric paths, with no duplicate or omitted path.

## Independent results

| Invariant | Result |
| --- | ---: |
| Fully FEC-equivalent races / accepted pairs | 425 / 2,097 |
| Finance matched / noncontradictory not-present pairs | 2,087 / 10 |
| Exact exceptional overrides | 8 |
| Corrected one-to-one races / overrides | 3 / 6 |
| Approved many-to-one groups / aliases | 1 / 2 |
| Certified replacement outputs | 4 |
| Deterministic merges | 854 |
| Preserved production-only leaf values with lineage/runtime proof | 10,177 |
| Discarded stale runtime leaves on complete replacements | 12 |
| Unresolved provenance / policy conflicts | 0 / 0 |
| Reconstructed rollback documents | 858 |

All 2,097 regular candidate pairs were re-derived from unique same-race FEC
IDs, canonical IDs, canonical race/seat/cycle data, official FEC research
evidence, and noncontradictory finance evidence where present. The four
exceptional races consume exactly eight G2.1 mappings. NJ-08 is the only
many-to-one group and has two aliases; the other six mappings are one-to-one.

The four replacement outputs are byte-semantic equivalents of the complete
certified documents and retain no production `/updatedAt/*` value. Each of the
854 merges starts from its complete certified document and adds only a leaf
whose actual value matches validated publication lineage or strict runtime
metadata. No merge overwrites identity, canonical candidate IDs, eligibility,
publication, deadline, lock, registry, or selector fields. Every production-
only value is either preserved with lineage or remains reconstructable from
the complete immutable actual document and its verified rollback digest.

The verifier recomputed these BR6CR semantic digests:

- entries: `db946e81664318e666daf12ecfc1bdbcf600dea6b1cc109296f933a979d8cbfb`;
- aggregate: `0ae00a719842cbfa58767dae12b280e35406ed72a3cf2501ad3518c8d7dbfc8c`;
- outputs: `0ac958cd0dbcf43cba20ef1b64ab7957fa4255dc76a79efb71306146957f84e2`;
- rollback: `80241286ec7cfb0e45844adbf2758883e0c8d8ec8d2b98c26b3db5f66986529d`;
- plan: `ecc155e0e08a4ac599593f70041ee53d806b48a149ac375c7b2c901d4c76dd23`.

Static executor-facing inspection found zero write, delete, scan,
collection-wide operation, selector-change, target, batch, or implicit-
activation fields. The plan is disposition evidence only.

## Tamper and verification evidence

Focused tests reject output mutation, rollback mutation, path omission,
duplicate path, override substitution, merge-group alteration, protected-field
mutation, stale runtime metadata, input-hash drift, unknown plan fields, and
entry-order drift. Relevant strict Firestore codec tests, TypeScript, lint,
build, and diff checks are part of the fail-closed local gate sequence.

The final sequence completed once as two independent verifier processes and
one isolated replay process, all at exit `0` with empty stderr. Their three
2,543-byte sanitized receipts are byte-identical at SHA-256
`6b84d9fe141cd0c992ef8262a93cc0baaedc223d2ddf99011240eb61ec8ad491`.
Each records Firebase imported `false`, credentials loaded `false`, network
requests `0`, production operations `0`, and dispositions executed `0`.
Private receipts remain ignored; committed evidence contains aggregates and
digests only.

## Verdict and next action

**PASS**: no P0/P1 finding exists and the independently reconstructed counts,
outputs, rollbacks, identities, ordering, lineage, overrides, protected fields,
timestamp rules, and digests agree. The smallest authorized next step is to
design—without running—a separate local-only executor behind fresh review and
fresh authorization. Production execution remains prohibited.
