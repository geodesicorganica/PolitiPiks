# G8.4BR7B — Local conflict-reconciliation executor

Status: **implementation complete; final local certification not yet invoked**.
This slice authorizes only local files and `demo-no-project` Firestore emulator
operations. It does not authorize production access, credentials, a selector
operation, activation, deployment, capture, smoke, deletion, rollback against
production, branch switching, push, rebase, or BR7C work.

## Certified inputs and contracts

The Firebase-free planner binds the complete BR6CR/BR7A evidence chain before
it reconstructs any operation. It rejects file-identity, schema, key-set,
inventory, ordering, disposition, output, rollback, review, or digest drift.

| Evidence | Bytes | SHA-256 |
| --- | ---: | --- |
| BR6CR final plan | 75,926,293 | `654349812a2d2806b75b58e0f57ba09713bb27d22f955c85a100cc70cf7a80ec` |
| Immutable BR5B snapshot | 35,148,779 | `425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3` |
| Certified activation bundle | 23,043,218 | `8387a248be9cf08c3d4a380748be5dd6744c0d81b081d770804db1cf1edbf7b4` |
| Certified BR6B plan | 81,061,814 | `1f0b71444b2958ab012a03fde3b74f8603df4035f843a2363361d584a7b6752e` |
| Versioned identity overrides | 2,137 | `dae9946a70fb23d935a86f9affdcab97459d07a4024a84e4e0b6c3a5559a5b77` |
| BR7A sanitized evidence | 2,546 | `359a8a2ccf4bd4acb52e1073f770aa401a3ca77e42f091b84541a082fb90bab9` |

The versioned contracts are:

- `g8-4br7b-local-conflict-reconciliation-plan/v1`;
- `g8-4br7b-local-conflict-reconciliation-manifest/v1`; and
- `g8-4br7b-local-conflict-reconciliation-result/v1`.

The certified semantic digests are:

- entries: `db946e81664318e666daf12ecfc1bdbcf600dea6b1cc109296f933a979d8cbfb`;
- aggregate: `0ae00a719842cbfa58767dae12b280e35406ed72a3cf2501ad3518c8d7dbfc8c`;
- outputs: `0ac958cd0dbcf43cba20ef1b64ab7957fa4255dc76a79efb71306146957f84e2`;
- rollback: `80241286ec7cfb0e45844adbf2758883e0c8d8ec8d2b98c26b3db5f66986529d`;
- override policy: `1167d651066fe8e0c130366e1981000d538b3d12405607cb8a5dfa1be1c64b3b`;
- BR6CR plan: `ecc155e0e08a4ac599593f70041ee53d806b48a149ac375c7b2c901d4c76dd23`; and
- executor plan: `3abb3cba4d679e5cd141e8f386c7ca6173e121deae723b4f79fa3ebb4ba26994`.

## Exact operation boundary

The plan contains exactly 858 lexicographically ordered, unique document
paths: 429 races and 429 metrics. Four operations replace the current document
with the complete certified output; 854 deterministically merge only BR7A-
validated leaves. Every operation embeds a complete certified rollback
document and semantic output/rollback digests.

The executor reads each exact path during preclassification and never exposes
a collection or query method. Missing, malformed, third-value, and read-error
destinations fail closed before any write batch. A certified output is an
idempotent no-op. A certified rollback document is eligible for apply. Rollback
uses the inverse rule and rejects changed, missing, or unrelated values.

Writes use at most 100 documents per transaction. Each transaction performs
exact compare-before-write reads with retry count one. Progress manifests are
persistable before writes, after every completed batch, and at completion.
Interruption and resume are derived from the certified state of all 858 exact
paths rather than from a trusted checkpoint. A rejected transaction records
known guard reads and distinguishes a proven no-write failure from an unknown
write outcome.

Dry-run performs 858 preclassification reads, plans the eligible apply writes,
and attempts zero writes. Full apply and full rollback each use nine bounded
batches, 858 guard reads, 858 writes, and 858 exact verification reads. A
resume after one 100-document batch plans eight batches and 758 writes. An
idempotent rerun plans and attempts zero writes while still exactly verifying
all paths.

No selector is read or written. No collection scan, query, delete, or
historically missing document creation exists. In particular, the 2,494 absent
documents from the earlier inventory remain absent by contract.

## Offline and emulator isolation

The offline report and replay paths import no Firebase or Firestore package and
run with credential paths made deliberately unusable and external networking
blackholed. Two child processes write versioned, exclusive-create result and
manifest files, verify replay, and require byte-identical output. Earlier
`g8-4br7b-development-*` artifacts remain untouched. The fresh recovery
evidence uses `g8-4br7b-offline-replay-v2-*` names and never overwrites or
deletes an existing file. The completed v1 replay receipt is pinned by byte
count and SHA-256 and remains immutable.

The Firestore adapter requires project `demo-no-project`, an explicit loopback
endpoint, no credential environment, exact certified paths, and transactions
of at most 100 documents. The emulator child alone removes proxy variables,
sets loopback `NO_PROXY`, disables update checks, and clears inherited
credential and emulator-host variables. The test seeds and touches only the
858 certified paths, covers dry-run, pre-write rejection, interruption/resume,
idempotence, guarded rollback rejection, complete rollback, exact accounting,
and client termination.

Receipts contain only contracts, phases, counts, digests, operation accounting,
bounded error codes, and safety totals. They reject document paths/bodies,
candidate data, credentials, bearer values, and raw child output.

## Final certification

The immutable `g8-4br7b-final-certification-v1-receipt.json` records the first
failure at the BR3A unit gate after all earlier gates passed. The no-clobber v2
runner encodes the authorized ten-step recovery sequence. It verifies branch,
HEAD, empty index, exact WIP inventory, certified input identities, and the
byte identities of the completed v1 replay and failed v1 final receipts before
the first gate and after every gate. It stops on the first failure, never
invokes a later gate, and stores only child exit, signal, byte-count, and
SHA-256 evidence. The v2 result is filled only after that one-shot sequence is
invoked.

## Focused scope

Only the preserved BR7B implementation and runner paths, the BR7BR1 regression
and recovery status, this status file, and the G8 roadmap are eligible for the
final commit. Private artifacts remain ignored. The authoritative repository root is
`C:\Projects\Politipiks`; the nested `politipick` wrapper is out of scope.
