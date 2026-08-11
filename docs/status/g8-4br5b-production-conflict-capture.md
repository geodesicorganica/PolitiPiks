# G8.4BR5B — Production conflict capture and offline analysis stop

Status: **the one authorized production capture was consumed, exited `0`, and
created a complete validated private snapshot; this BR5B batch stopped after
its offline analysis processes exited `1` without JSON. BR5C later recovered
and certified the offline replay plus local emulator gates without any further
production operation**.

## Scope and starting state

| Field | Required and observed value |
| --- | --- |
| Branch | `codex/politipiks-canonical-shadow-release` |
| Starting HEAD | `37f8236c09e79b2765f66b3c3e146c8ec5e3d9a0` |
| Conflict implementation | `b9caf95ae47f856a1ed3282ab193c631bbe2ca85` |
| Activation implementation | `cfff2011ed72f560f531983ce4291237479fa642` |
| Capture authorization | Exactly one preflight-derived production snapshot invocation |
| Capture receipt | `g8-4br5b-production-conflict-capture` |
| Private snapshot | `.artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json` |

The eleven conflict implementation files and fifteen activation implementation
files matched their certified commits in the working tree. The two certified
private bundles were each 23,043,218 bytes with file SHA-256
`8387a248be9cf08c3d4a380748be5dd6744c0d81b081d770804db1cf1edbf7b4`.
The committed manifest was present. The credential configuration passed the
committed Firebase-free environment guard: a credential path was configured,
the referenced JSON existed and parsed, required fields were valid, the
project/database target matched, and no unsafe flag was present. No credential
path, value, or document body was printed.

The private root was ignored and the snapshot path was absent before the
preflight and capture. The same ten pre-existing unrelated modified/untracked
paths recorded by BR4B and BR5A retained their initial statuses, sizes, and
SHA-256 hashes. None was staged, deleted, or included.

## Bounded command ledger

| UTC interval | Operation | Exact exit | Result |
| --- | --- | ---: | --- |
| Before `2026-08-10T21:28:19.310Z` | Branch, HEAD, focused-file, unrelated-path, bundle, manifest, credential, ignore, and output-absence gates | `0` | All local gates passed; committed preflight and production invocation accounting remained `0/0` |
| `2026-08-10T21:28:19.310Z`–`21:28:22.861Z` | Invoke the committed capture preflight once through direct Node and repository-resolved `tsx/cli` | `0` | Canonical receipt parsed and every certified gate passed |
| `2026-08-10T21:28:23.404Z`–`21:28:41.812Z` | Invoke the exact preflight-derived 28-element capture argument array once with `shell:false` | `0` | Authorization consumed; complete private snapshot created and strictly validated |
| `2026-08-10T21:28:47.940Z`–`21:28:55.190Z` | Offline `--snapshot-in` with certified and historical comparison bundles | `1` | No stdout/JSON; stderr present; stop condition reached |
| `2026-08-10T21:28:55.190Z`–`21:29:02.702Z` | Offline `--snapshot-in ... --verify-replay` | `1` | No stdout/JSON; same stderr digest |
| `2026-08-10T21:29:02.702Z`–`21:29:09.770Z` | Second independent offline `--snapshot-in ... --verify-replay` | `1` | No stdout/JSON; same stderr digest; runner exited `40` |

The operator runner launched all three required offline commands before it
evaluated their statuses. Consequently, it did not stop immediately after the
first offline exit `1`. This is a local operator-runner control-flow defect and
is recorded rather than normalized away. All three child argument arrays used
`--snapshot-in`; no second capture or other production command was invoked.
The capture authorization remains consumed and cannot be retried.

## Canonical preflight result

The single committed preflight emitted a valid
`g8-4br5a-conflict-capture-preflight/v1` receipt:

| Check | Observed value |
| --- | --- |
| Child exit | `0` |
| Canonical semantic digest | `b220c4aeedf0d7ab3922dd73dd32afa7c4ea737706298f5393e74cdaba8a1b1f` |
| Raw stdout SHA-256 | `95a03850367c1d99e382c40604aa0fc8a1b86a23471f0e0ab2650c1dec3ea89d` |
| Ordered arguments | `28` |
| Argument-array digest | `09257a21eafdd7187d6c969deaf243bddd9f165435128c27b49dd8f98204703e` |
| Exact-path digest | `2f3b1b1a44d0c7d3d9690fc944301264d0555b145046d7fdae19590c54c2366f` |
| Activation plan digest | `9f8827ac20dd9acfdcb0c6dd7beff8df30b767b504bbbe0fb366711b0ba3ca49` |
| Namespace digest | `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0` |
| Firebase initialization / credentials loaded | `false / false` |
| Preflight reads / writes / commands | `0 / 0 / 0` |
| Future reads / writes / scans | `3,353 / 0 / 0` |
| Launcher | direct Node, repository-resolved `tsx/cli`, absolute cwd, `shell:false` |

The executable, cwd, and argument array for the production child came only
from this parsed and revalidated receipt. No flag was manually transcribed,
and no npm/npx wrapper, command string, `shell:true`, or retry was used.

## Exactly-once capture and read accounting

The capture child exited `0`, emitted sanitized JSON, and had empty stderr.
Its stdout SHA-256 was
`50399dbe73a46acb93ad6dbb927ef96876227672c768942da2b191de06b48672`.
The strict snapshot rebuild/validation passed before any offline continuation.
It captured at `2026-08-10T21:28:37.074Z` and recorded:

| Operation | Planned | Attempted | Succeeded | Failed | Unknown |
| --- | ---: | ---: | ---: | ---: | ---: |
| Selector read | 1 | 1 | 1 | 0 | 0 |
| Exact-path reads | 3,352 | 3,352 | 3,352 | 0 | 0 |
| Collection scans | 0 | 0 | 0 | 0 | 0 |
| Writes | 0 | 0 | 0 | 0 | 0 |

The selector `catalogActivations/canonical-2026` was absent. No selector or
content document was written. The snapshot is 35,148,779 bytes with file
SHA-256
`425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3`.
Its validated digests are:

- inventory: `df8abc7ee1da88a6e3f4b2e92eeec237181930678223d313c24828dbda021d8a`
- input: `fa1ddde13a8947c8288ea11d7fe89c8c0589e42c9cc865ea5d3256e7cbaf8f40`
- evidence: `8bff6246586a5a7252b30b82ae1bfb126f6cf3dd15c6f71e32753dd5c4783c0f`
- plan: `5830772a4606868dfc7d83890c0704bbdc172c2475960286088ff778b48cca35`

## Validated snapshot classification

The complete snapshot recorded the same top-level state as BR4B:

| Family | Expected | Exact | Missing | Conflicting | Unknown |
| --- | ---: | ---: | ---: | ---: | ---: |
| races | 470 | 0 | 41 | 429 | 0 |
| ballot measures | 14 | 0 | 14 | 0 | 0 |
| candidate research | 2,384 | 0 | 2,384 | 0 | 0 |
| measure research | 14 | 0 | 14 | 0 | 0 |
| contest metrics | 470 | 0 | 41 | 429 | 0 |
| **total** | **3,352** | **0** | **2,494** | **858** | **0** |

All 858 conflicts were classified `substantive`: 429 race documents and 429
metric documents. The counts for `metadata-only`, `unknown`, and
`exact-after-safe-normalization` were each 0. All 858 documents contained at
least one protected pointer and at least one production-only pointer:

| Difference evidence | Documents | Pointer occurrences | Unique pointers |
| --- | ---: | ---: | ---: |
| Protected | 858 | 33,741 | 366 |
| Production-only | 858 | 9,014 | 73 |

Across all conflicts there were 77,728 recursive difference records: 62,576
expected-only, 9,014 production-only, and 6,138 changed.

The first differing pointer distribution was:

| First pointer | Documents |
| --- | ---: |
| `/baselineMetrics/electionVintage/methodology` | 429 |
| `/candidates/0/externalIds/bioguideId` | 179 |
| `/candidates/0/id` | 156 |
| `/candidates/0/externalIds/fecCandidateId` | 94 |

The snapshot contains aggregate frequencies for 479 distinct pointers. The
top 20 by document frequency, with lexical ordering for ties, were:

| Pointer | Documents | Difference kind |
| --- | ---: | --- |
| `/canonicalActivation/activationImplementationCommit` | 858 | expected-only |
| `/canonicalActivation/contract` | 858 | expected-only |
| `/canonicalActivation/generation` | 858 | expected-only |
| `/canonicalActivation/identitySchemaVersion` | 858 | expected-only |
| `/canonicalActivation/shadowSourceCommit` | 858 | expected-only |
| `/canonicalActivation/sourcePath` | 858 | expected-only |
| `/catalogScope` | 858 | expected-only |
| `/registryGeneration` | 858 | expected-only |
| `/updatedAt` | 858 | production-only |
| `/baselineMetrics/electionVintage/methodology` | 429 | expected-only |
| `/baselineMetrics/electionVintage/targetElectionYear` | 429 | expected-only |
| `/baselineMetrics/evidenceDigest` | 429 | expected-only |
| `/baselineMetrics/fieldAvailability/comparativeFinance` | 429 | expected-only |
| `/baselineMetrics/fieldAvailability/demographicsCvap` | 429 | expected-only |
| `/baselineMetrics/fieldAvailability/historical` | 429 | expected-only |
| `/baselineMetrics/fieldAvailability/turnout` | 429 | expected-only |
| `/baselineMetrics/geography/district` | 429 | expected-only |
| `/baselineMetrics/geography/methodology` | 429 | expected-only |
| `/baselineMetrics/geography/office` | 429 | expected-only |
| `/baselineMetrics/geography/state` | 429 | expected-only |

Origin labels are inferences, not production facts. Every conflict was labeled
`indeterminate` because it had no recognized activation envelope or explicit
legacy marker. The failed offline comparison processes emitted no report, so
no certified-versus-historical local-bundle match was established in BR5B.

Every resolution entry remains `unresolved`, and the recommended disposition
is also `unresolved` for all 858. `safeToReplace` is false for every assessment
and plan entry. Every conflict retains its complete actual document in the
private snapshot as rollback evidence. No disposition, replacement, merge,
retirement, deletion, or snapshot body was modified.

## BR4B comparison

BR4B observed selector absent with 0 exact, 2,494 missing, 858 conflicting,
and 0 unknown destination documents. BR5B observed the same selector and the
same totals. Therefore there is no count- or selector-level drift between the
two bounded observations. This equivalence is evidence only and does not
authorize another read or any write.

## Offline analysis failure and final boundary

Each offline child exited `1`, produced no stdout/JSON, and produced stderr
with the identical SHA-256
`be1b81115d2096a68b9f1d8369317cbb0e1386d6d1476b147abea5f8a6c7817d`.
No offline report file was created. Because the runtime receipts were absent,
`firebaseImported`, `credentialsLoaded`, `networkRequests`, comparison digest,
and independent replay equality are **unknown/unverified**, not zero. The raw
stderr was not printed or persisted; its precise failure classification is
therefore also unknown in this batch. The aggregate classifications above were
read after the stop only from fields already stored in the strictly validated
snapshot, without reading or printing document bodies.

The ignored private snapshot and no-clobber operator ledgers were preserved.
No second capture/read, production write, collection scan, overwrite, source
change, disposition change, merge, archive write, deletion, activation,
verify-only operation, rollback, smoke, deployment, push, or branch change
occurred. Any next work must be a separately authorized offline-only diagnosis
using the preserved snapshot; it must not repeat the production capture.

## BR5C local recovery addendum

G8.4BR5C fixed the missing-source-field comparison defect and the offline
runner's fail-fast sequencing locally. The preserved offline receipt records
analysis/replay exits `0/0/0`; the two independent verified reports are
byte-identical with SHA-256
`88fa9c80f01c6126ef5747e0e6f5c62e26aa6ad8099e69b2d8582567552f0a8d`.
Firebase import, credential loading, network requests, and production
operations are all certified as zero for those offline runs.

The prior BR5C emulator stop was caused by localhost traffic inheriting the
offline replay's deliberately blackholed proxy. The recovery removed
`HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY` case variants only from emulator
child environments and set `NO_PROXY`/`no_proxy` to
`127.0.0.1,localhost,::1`; the offline runner's blackholed network guard was
not changed. The failed mixed-conflict emulator gate then passed on its one
fresh attempt, and all four first-attempt regression emulator gates passed.

The snapshot remained exactly 35,148,779 bytes with SHA-256
`425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3`.
The result remains 0 exact, 2,494 missing, 858 substantive unresolved
conflicts, 0 unknown, and `safeToReplace=0`. No disposition or production
state changed. Durable evidence:
[G8.4BR5C offline conflict replay recovery](g8-4br5c-offline-conflict-replay-recovery.md).
