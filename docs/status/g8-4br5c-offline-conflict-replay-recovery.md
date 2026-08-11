# G8.4BR5C — Offline conflict replay recovery and local certification

Status: **locally certified on 2026-08-10; no production Firebase/Firestore
operation, selector action, activation, deployment, rollback, smoke, deletion,
push, or branch change occurred**.

## Starting boundary

| Field | Required and observed value |
| --- | --- |
| Branch | `codex/politipiks-canonical-shadow-release` |
| Starting HEAD | `7c55e55f7b3d7a59f3c3416f9c7e3fc9f49d354c` |
| Private snapshot | `.artifacts/private/canonical-migration/g8-4br5b-production-conflict-snapshot.json` |
| Snapshot size | `35,148,779` bytes |
| Snapshot SHA-256 | `425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3` |
| Prior local failure receipt | `.artifacts/private/canonical-migration/g8-4br5c-emulator-gate-failure.json` |
| Prior failure | `LOCAL_EMULATOR_PROXY_MISCONFIGURATION`, exit `1`, zero production operations |

The branch, exact starting HEAD, ignored private root, snapshot size/hash,
failure receipt, and dirty-path inventory matched the authorized starting
state. Port 18083 was free. No unrelated process was stopped or modified.
Ten unrelated modified/untracked paths were inventoried before execution and
preserved throughout the batch.

## Root cause and one-line guard

The failed local gate inherited the offline replay's intentionally blackholed
HTTP(S) proxy, so loopback Firestore traffic reached `127.0.0.1:9` instead of
the emulator and eventually failed with `UNAVAILABLE`.

One-line guard: **for emulator children only, remove all case variants of
`HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY`, then set `NO_PROXY`/`no_proxy` to
`127.0.0.1,localhost,::1`.**

The child environment was built independently for every emulator command. A
case-insensitive key enumeration found no blocked proxy key in each child,
the loopback no-proxy value matched, and the outer process environment matched
before/after. The first wrapper's .NET null check displayed absent keys as
empty strings; direct environment-key enumeration corrected that
presentation-only false positive without rerunning the consumed gate.
Post-gate port and process checks found no listener or newly retained
Java/Firebase process.

The offline runner remains deliberately separate and unchanged: its report
children still receive missing credential paths, blackholed `HTTP_PROXY` and
`HTTPS_PROXY`, and an empty `NO_PROXY` to prove zero network dependence.

## Preserved offline certification

The already-certified offline reports were not rerun in this continuation.
Their no-clobber receipt records:

| Offline child | Exit | Stdout bytes | Stdout SHA-256 | Stderr bytes |
| --- | ---: | ---: | --- | ---: |
| analysis | `0` | 4,370,425 | `5908f0a572cfe1746ec6afae4ad8d6a7fede9edd6ef8f5be180ef6e440431bcb` | 0 |
| verified replay 1 | `0` | 4,370,424 | `88fa9c80f01c6126ef5747e0e6f5c62e26aa6ad8099e69b2d8582567552f0a8d` | 0 |
| verified replay 2 | `0` | 4,370,424 | `88fa9c80f01c6126ef5747e0e6f5c62e26aa6ad8099e69b2d8582567552f0a8d` | 0 |

The verified reports are byte-identical. The comparison digest is
`e9de8c345a9cf2a4d117b160373d3e9cf5c4cd8591cb1bd7d5fa90ed8dbba381`.
The receipt certifies `firebaseImported:false`, `credentialsLoaded:false`,
`networkRequests:0`, and `productionOperations:0`.

The validated result remains:

| Result | Count |
| --- | ---: |
| Expected | 3,352 |
| Exact | 0 |
| Missing | 2,494 |
| Conflicting | 858 |
| Unknown | 0 |
| Substantive unresolved conflicts | 858 |
| `safeToReplace:true` | 0 |

Both local comparison bundles were evaluated for all 858 conflicts. All
resolution entries remain `unresolved` with complete private rollback
evidence. No disposition was invented or changed.

## Emulator command ledger

Every command ran sequentially, once, and stopped its emulator cleanly before
the next command began. Firebase CLI detected `demo-no-project` for every
gate; attempts to access a non-emulated service under that demo project fail.

| Command | Exact exit | Relevant summary |
| --- | ---: | --- |
| `npx firebase-tools emulators:exec --config scripts/firebase.g8-4br5a-emulator.json --only firestore "npx tsx scripts/lib/g8V2ConflictCapture.emulator.test.ts"` | `0` | 3,353 exact emulator reads, 0 writes, 0 scans |
| `npm run test-g8-4br4a-activation-recovery-emulator` | `0` | Structured activation recovery suite reached its sole success terminus; port 18082 released |
| `npm run test-g8-4br0-state-audit-emulator` | `0` | G8.4BR3A state audit emulator tests passed |
| `npm run test-g8-3a-v2-activation-emulator` | `0` | G8.4BR4A structured activation emulator tests passed |
| `npm run test-g8-2a-product-shadow-emulator` | `0` | G8.2A product shadow emulator tests passed |

The second gate's process API did not relay its stdout into the operator log;
its exact exit `0`, the test file's single post-assertion success terminus,
released port, absent new process, and unchanged environment are retained as
the certification evidence. It was not rerun.

## Remaining local gates

| Command | Exact exit | Relevant summary |
| --- | ---: | --- |
| `npx tsx scripts/lib/g8V2ConflictAnalysis.test.ts` | `0` | Conflict analysis passed; two fixture replays were byte-identical at `d597898dc2f25a2333bf5efff8c9c8fda7115c26482b774bb19fef5d213ebe9f` |
| `npx tsx scripts/lib/g8V2ConflictOfflineRunner.test.ts` | `0` | Fail-fast offline runner sequencing tests passed |
| `npm run lint` | `0` | `tsc --noEmit` passed |
| `npm run build` | `0` | Vite transformed 3,159 modules; Vite and server esbuild completed |
| `git diff --check` | `0` | No whitespace errors |

The build emitted only the existing large-chunk advisory; it was not a failed
gate.

## Snapshot identity

The immutable snapshot was hashed before the emulator sequence and again after
all local gates. Both observations were exactly 35,148,779 bytes with SHA-256
`425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3`.
No snapshot byte changed.

## Focused files and final Git state

The focused commit contains only these BR5C paths:

- `scripts/lib/g8V2ConflictAnalysis.ts`
- `scripts/lib/g8V2ConflictAnalysis.test.ts`
- `scripts/lib/g8V2ConflictOfflineRunner.ts`
- `scripts/lib/g8V2ConflictOfflineRunner.test.ts`
- `scripts/run-g8-4br5c-offline-conflict-replays.ts`
- `docs/status/g8-4br5b-production-conflict-capture.md`
- `docs/status/g8-4br5c-offline-conflict-replay-recovery.md`
- `docs/2026-live-50-state-roadmap.md`

After the focused commit, the branch remains
`codex/politipiks-canonical-shadow-release`; the BR5C index/worktree is clean,
and only these pre-existing unrelated paths remain dirty or untracked:

- `.env.example`
- `docs/ROADMAP.md`
- `ingest/package-lock.json`
- `src/components/ResearchDrawer.tsx`
- `src/lib/dataPlatform.ts`
- `src/lib/researchBundle.ts`
- `docs/status/g2-6-production-shadow-copy.md`
- `docs/status/g3-3-live-publication-certification.md`
- `docs/status/g3-canonical-cutover-readiness.md`
- `scripts/prune-invalid-federal-races.ts`

No push was performed. This local certification does not authorize a new
production capture/read, selector operation, write, reconciliation,
activation, deployment, rollback, smoke, deletion, or conflict disposition.
