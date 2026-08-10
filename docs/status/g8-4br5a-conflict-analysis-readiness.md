# G8.4BR5A — Conflict analysis readiness

Status: **locally certified; no production capture or G8.4BR5B authorization
was created or used**.

## Scope and immutable inputs

G8.4BR5A started on branch `codex/politipiks-canonical-shadow-release` at
`91d2dcec10aa0b88c9066d79b88ed8c2378ef082`. The focused implementation is
commit `b9caf95ae47f856a1ed3282ab193c631bbe2ca85`. The activation implementation
identity remains `cfff2011ed72f560f531983ce4291237479fa642`, and the immutable
shadow source identity remains `295466ccc52ccd4d6ad4f1dfb444d48410b92910`.

This work responds to the consumed G8.4BR4B apply result only. That invocation
read the absent selector and all 3,352 exact destination paths, classified 0
exact, 2,494 missing, 858 conflicting, and 0 unknown, and attempted 0 writes.
G8.4BR5A does not infer the bodies or causes of those 858 conflicts from the
count alone. It implements the bounded private evidence capture and offline
analysis needed for a separately authorized future read.

The certified inventory is unchanged:

| Family | Count |
| --- | ---: |
| races | 470 |
| ballot measures | 14 |
| candidate research | 2,384 |
| measure research | 14 |
| contest metrics | 470 |
| total content | 3,352 |

Certified identities used by the final preflight:

- namespace digest: `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`
- activation plan digest: `9f8827ac20dd9acfdcb0c6dd7beff8df30b767b504bbbe0fb366711b0ba3ca49`
- certified bundle digest: `7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7`
- exact-path digest: `2f3b1b1a44d0c7d3d9690fc944301264d0555b145046d7fdae19590c54c2366f`

## Private snapshot and offline contracts

The implementation adds three strict versioned contracts:

- `g8-4br5a-conflict-snapshot/v1`
- `g8-4br5a-conflict-analysis/v1`
- `g8-4br5a-conflict-resolution-plan/v1`

A snapshot records the exact target and implementation identities; the full
selector result; all 3,352 inventory paths and expected digests; full actual
and expected bodies for conflicts; their canonical digests and recursive JSON
Pointer diffs; exact/missing/conflicting/unknown totals and family summaries;
and inventory, input, evidence, and plan digests. Every conflicting actual
document is retained intact in the ignored private snapshot as rollback
evidence. Read failures are sanitized and explicitly accounted as unknown.

Snapshot validation rejects wrong targets or identities, path-set drift,
duplicate observations, count inconsistencies, extra contract fields, digest
tampering, malformed timestamps, unsupported Firestore/JSON values, and
partial evidence presented as complete. Timestamp encoding is lossless to the
recorded seconds/nanoseconds pair. Offline `--snapshot-in` mode loads no
Firebase module, no credentials, and makes no network request. The live module
is reached only by dynamic import after the bundle, manifest, target,
identities, counts, output absence, ignored-root, and no-clobber guards pass.

The private root is `.artifacts/private/canonical-migration/`. Inputs and
outputs must be `.json` files inside that root, path escape is rejected, and a
future snapshot is created with exclusive `wx` semantics. Existing private
artifacts were not overwritten or deleted.

## Analysis and resolution policy

Conflicts are classified as `exact-after-safe-normalization`, `metadata-only`,
`substantive`, or `unknown`. The metadata-only allowlist is deliberately
limited to these activation-envelope pointers:

```text
/canonicalActivation/identitySchemaVersion
/canonicalActivation/sourceCommit
/canonicalActivation/shadowSourceCommit
/canonicalActivation/activationImplementationCommit
```

Recursive production-only values are explicit data-loss flags. Timestamps,
provenance, eligibility and prediction eligibility, candidate arrays, metrics,
research content, source links, and unknown fields are protected from a
metadata-only classification. The default is always `safeToReplace: false`.

Origin labels are explicitly inferences: a v2 envelope with a non-current
implementation identity is a likely G8.4B remnant; an explicit legacy marker
is legacy-active; another v2 envelope is neither; otherwise provenance is
indeterminate. Local bundle matches do not turn those inferences into facts.

Each conflict receives one unresolved plan entry with a complete-actual
rollback-evidence reference. The supported future dispositions are
`preserve-and-replace`, `approved-merge`, `retain-existing`, `retire`, and
`unresolved`; all require explicit review and approval. Metadata-only evidence
may recommend `preserve-and-replace`, but the recorded disposition remains
`unresolved`. The planner never executes replacement, merge, retirement, or
deletion.

The certified and historical local bundles were both available for comparison:

| Bundle | Bytes | File SHA-256 | Semantic bundle digest |
| --- | ---: | --- | --- |
| `g7-1-local-product-bundle.json` | 23,043,218 | `8387a248be9cf08c3d4a380748be5dd6744c0d81b081d770804db1cf1edbf7b4` | `7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7` |
| `g8-1-prospective-product-bundle-2026-08-04.json` | 23,043,218 | `8387a248be9cf08c3d4a380748be5dd6744c0d81b081d770804db1cf1edbf7b4` | `7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7` |

They are byte-equivalent and therefore cannot distinguish provenance. The
offline comparison report says so rather than presenting a bundle match as
historical proof.

## Deterministic fixture evidence

The ignored mixed-state fixture has 1 exact, 3,347 missing, 3 conflicting, and
1 unknown document across the complete 3,352-path inventory. It covers a
metadata-envelope conflict, substantive production-only protected fields, a
legacy marker, and a permission-style read failure. Its accounting is one
successful selector read plus 3,352 exact-path attempts (3,351 succeeded, 1
failed), zero scans, and zero planned or attempted writes.

Two offline CLI replays were byte-identical and produced plan digest
`d597898dc2f25a2333bf5efff8c9c8fda7115c26482b774bb19fef5d213ebe9f`.
The analyzer reported `firebaseImported: false`, `credentialsLoaded: false`,
and `networkRequests: 0`. Unit coverage also passed for metadata-only and
substantive diffs, production-only data, protected timestamps, unsupported
types, wrong identity, digest tampering, privacy/path escape, duplicates,
partial failures, comparison-label duplication, and deterministic replay.

The alternate-port Firestore emulator mixed-state test passed with exactly
3,353 reads, 0 writes, and 0 collection scans. A post-capture comparison proved
that all emulator documents were unchanged.

## Canonical Firebase-free future-capture preflight

The canonical preflight contract is
`g8-4br5a-conflict-capture-preflight/v1`. Two post-implementation-commit direct
preflights exited `0` and emitted byte-identical 7,577-byte JSON documents:

- stdout SHA-256: `95a03850367c1d99e382c40604aa0fc8a1b86a23471f0e0ab2650c1dec3ea89d`
- canonical semantic receipt digest: `b220c4aeedf0d7ab3922dd73dd32afa7c4ea737706298f5393e74cdaba8a1b1f`
- Firebase initialization: false
- credentials loaded: false
- local reads/writes/commands: `0/0/0`
- shell: false
- authorization created: false

The emitted future launcher uses direct `C:\Program Files\nodejs\node.exe`,
the repository-resolved `tsx/cli`, cwd `C:\Projects\Politipiks`, and 28 ordered
arguments. Its output path
`.artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json`
was ignored and absent. The future operation is bounded to exactly one selector
read followed by exactly 3,352 named document reads: 3,353 total, zero writes,
zero collection scans, and no retry surface.

The future `--snapshot-out` command below is a preflight artifact only. It was
not executed and is not authorized by this document:

```powershell
$G84BR5ATsx = node -e "process.stdout.write(require.resolve('tsx/cli'))"
& node $G84BR5ATsx scripts/report-g8-4br5a-conflicts.ts `
  --snapshot-out .artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json `
  --bundle-in .artifacts/private/canonical-migration/g7-1-local-product-bundle.json `
  --manifest docs/g8-catalog-beta-release-manifest.json `
  --project-id politipiks `
  --database-id ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a `
  --generation canonical-2026-shadow-v2 `
  --expected-shadow-source-commit 295466ccc52ccd4d6ad4f1dfb444d48410b92910 `
  --expected-activation-implementation-commit cfff2011ed72f560f531983ce4291237479fa642 `
  --expected-conflict-analysis-implementation-commit b9caf95ae47f856a1ed3282ab193c631bbe2ca85 `
  --expected-namespace-digest ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0 `
  --expected-activation-plan-digest 9f8827ac20dd9acfdcb0c6dd7beff8df30b767b504bbbe0fb366711b0ba3ca49 `
  --expected-content-documents 3352 `
  --capture-receipt g8-4br5b-production-conflict-capture
```

Local-only operator commands:

```powershell
# Firebase-free preflight; emits but does not invoke the future command.
$G84BR5ATsx = node -e "process.stdout.write(require.resolve('tsx/cli'))"
& node $G84BR5ATsx scripts/verify-g8-4br5a-conflict-capture-preflight.ts

# Offline analysis of an existing ignored snapshot.
& node $G84BR5ATsx scripts/report-g8-4br5a-conflicts.ts `
  --snapshot-in .artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json `
  --comparison-bundle certified=.artifacts/private/canonical-migration/g7-1-local-product-bundle.json `
  --comparison-bundle historical=.artifacts/private/canonical-migration/g8-1-prospective-product-bundle-2026-08-04.json

# Offline deterministic verification of that snapshot and analysis.
& node $G84BR5ATsx scripts/report-g8-4br5a-conflicts.ts `
  --snapshot-in .artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json `
  --comparison-bundle certified=.artifacts/private/canonical-migration/g7-1-local-product-bundle.json `
  --comparison-bundle historical=.artifacts/private/canonical-migration/g8-1-prospective-product-bundle-2026-08-04.json `
  --verify-replay
```

## Local certification ledger

| Command | Exit/result |
| --- | ---: |
| `npx tsx scripts/lib/g8V2ConflictAnalysis.test.ts` | 0 |
| `npx tsx scripts/lib/g8V2ConflictPreflight.test.ts` | 0 |
| `npx tsc --noEmit --pretty false` | 0 |
| `npx firebase-tools emulators:exec --config scripts/firebase.g8-4br5a-emulator.json --only firestore "npx tsx scripts/lib/g8V2ConflictCapture.emulator.test.ts"` (port 18083) | 0 |
| `npm run test-g8-4br4a-activation-recovery` | 0 |
| `npm run test-g8-4br4a-activation-recovery-emulator` | 0 |
| `npm run test-g8-4br3a-structured-audit` | 0 |
| `npm run test-g8-4br0-state-audit-emulator` | 0 |
| `npm run test-g8-3a-v2-activation` | 0 |
| `npm run test-g8-3a-v2-activation-emulator` | 0 |
| `npm run test-g8-2a-product-shadow` | 0 |
| `npm run test-g8-2a-product-shadow-emulator` | 0 |
| `npm run test-local-product-bundle` | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 (Vite large-chunk warning only) |
| `git diff --check` | 0 |
| final direct conflict-capture preflight 1 | 0 |
| final direct conflict-capture preflight 2 | 0 |
| byte comparison of final preflight stdout | identical |

## Focused implementation files

Commit `b9caf95ae47f856a1ed3282ab193c631bbe2ca85` contains only the BR5A
emulator configuration, conflict snapshot/analyzer/planner, bounded capture and
live adapter, CLI guard, preflight, verification entrypoint, and their focused
unit/emulator tests under `scripts/`. It does not change `package.json` or the
activation implementation identity.

The ten pre-existing unrelated modified/untracked paths were not staged,
deleted, or included. Existing ignored private artifacts were preserved.

## G8.4BR5B authorization boundary

G8.4BR5A performed no network operation or production Firebase/Firestore
access, conflict capture, selector/content read or write, activation,
verify-only operation, rollback, smoke, deployment, replacement, merge,
retirement, deletion, push, or branch change. It created or executed no
G8.4BR5B authorization.

Any future production snapshot capture requires a fresh explicit authorization
for the exact preflight-derived operation. Its first invocation is consumed
whether it succeeds, fails, or returns unknown completion. It must not be
retried or followed by another production read without new authorization.
