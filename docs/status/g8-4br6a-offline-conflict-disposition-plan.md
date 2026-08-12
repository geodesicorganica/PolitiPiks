# G8.4BR6A — Offline conflict provenance and draft-disposition plan

Status: **locally certified on 2026-08-12; not ready for an executor. No
production Firebase/Firestore operation, selector action, activation,
deployment, rollback, smoke, deletion, push, or branch change occurred.**

## Starting boundary

| Field | Required and observed value |
| --- | --- |
| Branch | `codex/politipiks-canonical-shadow-release` |
| Starting HEAD | `f18c5f05c50113b0698d057c865091114c7eaa99` |
| Private snapshot | `.artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json` |
| Snapshot size | `35,148,779` bytes |
| Snapshot SHA-256 | `425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3` |
| Certified BR5C report digest | `88fa9c80f01c6126ef5747e0e6f5c62e26aa6ad8099e69b2d8582567552f0a8d` |

The exact branch, starting HEAD, ignored private artifact root, snapshot
identity, and ten unrelated modified/untracked paths matched the authorized
starting state. Those unrelated paths were preserved byte-for-byte and were
excluded from the focused staging allowlist.

## Versioned contracts and lineage

BR6A adds strict `g8-4br6a-conflict-disposition-plan/v1`,
`g8-4br6a-conflict-disposition-report/v1`,
`g8-4br6a-durable-pointer-rules/v1`, and lineage-catalog contracts. The
offline builder validates the complete local publication-to-source lineage,
rebuilds the certified current bundle, and admits only eight expected
artifacts. The accepted catalog digest is
`c681f0f3173154358c7e0136b2bf871c0804b4e307ce8927feb78b5410365bf1`;
the rebuilt semantic bundle digest is
`7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7`.

The current and historical comparison bundles are byte-identical. That fact
is retained as evidence, but it is not treated as proof that a production
value is source-backed. Authority comes only from the validated lineage and
field-specific rules.

Candidate arrays use durable `id` or `candidateId` identity. The planner
distinguishes reorder, identity, value, expected-only, and production-only
differences, including one-sided arrays. A present production value never
becomes authoritative merely because it exists, protected fields remain
protected, no production-only value is discarded without rollback evidence,
and inference alone never marks a replacement safe.

## Complete draft plan

Every one of the 858 unique conflict paths has one private plan entry, with no
duplicates or omissions. Each entry records a draft disposition, durable
pointer rules, evidence digests, proposed-output digest, rollback digest, and
rationale. Complete document bodies and proposed outputs remain only in the
ignored private artifacts.

| Dimension | Class | Count |
| --- | --- | ---: |
| Family | races | 429 |
| Family | metrics | 429 |
| Family | measures / candidate research / measure research | 0 |
| Draft disposition | preserve-current | 0 |
| Draft disposition | replace-with-certified | 0 |
| Draft disposition | deterministic-merge | 429 |
| Draft disposition | unresolved | 429 |
| Provenance | current-certified-authoritative | 35,486 |
| Provenance | existing-value-with-validated-source | 7,615 |
| Provenance | runtime-metadata | 7,722 |
| Provenance | identity-conflict | 4,209 |
| Provenance | unsupported-production-only-value | 0 |
| Provenance | ambiguous/unresolved | 0 |
| Difference | reorder | 0 |
| Difference | identity | 4,209 |
| Difference | value | 0 |
| Difference | expected-only | 40,634 |
| Difference | production-only | 10,189 |
| Blocker | none | 50,823 |
| Blocker | identity-conflict | 4,209 |
| Blocker | unsupported / conflicting / ambiguous lineage | 0 |

The plan contains 55,032 pointer rules across 66 pointer signatures. The 429
metrics paths are deterministically mergeable because their production-only
source-backed values match an approved, validated publication source. The 429
races paths remain unresolved because candidate identity conflicts cannot be
resolved by ordering or inference.

`readyForExecutor` is therefore `false`: 429 paths are deterministically
resolved, 429 remain unresolved, outputs are reproducible, rollback evidence
is complete, and 4,209 policy conflicts remain. The sanitized evidence lists
36 digest-only next-evidence batches, from the smallest groups upward,
covering all 429 unresolved documents. It exposes no production path, body,
or sensitive value.

## Deterministic offline replay

The resource-safe runner executed two independent builds followed by an
isolated `--verify-replay` build. All three children exited `0`, and fixed-size
streaming comparisons proved byte equality without retaining duplicate plans
in memory.

| Artifact | Builds byte-identical | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Private complete plans | yes | 62,232,012 | `bbb251ff0e30a4624c2e649baeda69d5b3c721ef46075ccb6a23e68c57fcccbd` |
| Sanitized reports | yes | 19,979 | `8eeb876f30ebdd4189d3483115a918ba942cb461680c5dc0e22269c0306d640b` |

The semantic entries digest is
`1c89de253f9ce73f02afd3621b8b61a3e9f6175576e0498e94a5e73aaf1221db`,
the aggregate digest is
`47afba0e756b4de67238fdef01e71895579a74e5e12f8f2d916086960132d65b`,
and the plan digest is
`15f456e459c18fd0db51275b0c22de7b1fe5f9fb6b3dca841f111b9469c28cd9`.
The runner records `firebaseImported:false`, `credentialsLoaded:false`,
`networkRequests:0`, and `productionOperations:0`. The snapshot was
35,148,779 bytes with the required SHA-256 before and after every build.

Private complete outputs and receipts are retained under
`.artifacts/private/canonical-migration/` and remain ignored. The committed
aggregate-only evidence is
[`g8-4br6a-offline-conflict-disposition-evidence.json`](g8-4br6a-offline-conflict-disposition-evidence.json).

## Final local gate matrix

The final runner executed sequentially and stopped on the first failure
condition. All 18 gates exited `0`:

| Gate | Exit |
| --- | ---: |
| BR6A focused disposition tests | 0 |
| BR5A analysis regression | 0 |
| BR5C offline-runner regression | 0 |
| BR5A preflight regression | 0 |
| BR4A activation-recovery regression | 0 |
| G8.3A activation regression | 0 |
| BR3A structured-audit regression | 0 |
| G8.2A product-shadow regression | 0 |
| Local product-bundle regression | 0 |
| TypeScript | 0 |
| Lint | 0 |
| Build | 0 |
| BR5A capture emulator on 18083 | 0 |
| BR4A activation emulator on 18082 | 0 |
| BR3A audit emulator on 18081 | 0 |
| G8.3A activation emulator on 8081 | 0 |
| G8.2A shadow emulator on 8081 | 0 |
| `git diff --check` | 0 |

Every Firestore emulator child used project `demo-no-project`, removed
credential, inherited Firestore-host, and proxy variables, disabled update
checks, and allowed only the loopback no-proxy addresses. The runner retained
zero production targets, external network requests, or production operations.
The snapshot identity matched after every gate and at completion.

## Focused files and authorization boundary

The focused commit contains only these BR6A paths:

- `scripts/lib/g8V2ConflictDisposition.ts`
- `scripts/lib/g8V2ConflictDisposition.test.ts`
- `scripts/report-g8-4br6a-dispositions.ts`
- `scripts/run-g8-4br6a-offline-disposition-builds.ts`
- `scripts/run-g8-4br6a-local-gates.ts`
- `docs/status/g8-4br6a-offline-conflict-disposition-evidence.json`
- `docs/status/g8-4br6a-offline-conflict-disposition-plan.md`
- `docs/2026-live-50-state-roadmap.md`

BR6A produces a draft offline plan only. It does not authorize an executor,
production read or write, conflict replacement, selector operation,
activation, deployment, rollback, smoke, deletion, push, or branch change.
The unresolved candidate-identity evidence must be supplied and a future
bounded plan must independently satisfy every readiness predicate before any
executor can be considered.
