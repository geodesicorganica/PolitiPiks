# G8.4BR7BR2AR inner TSX heap recovery

Status: in progress; local repair only. G8.4BR7BR3 final certification remains separately unauthorized.

## Custody baseline

- Branch: `codex/politipiks-canonical-shadow-release`
- HEAD: `84125e0646dd0130c901c718d3dca19bdd8ef1e0`
- Starting index: empty
- Starting worktree: the preserved 11-path BR7B/BR7BR1 WIP inventory
- `package.json`: clean
- Port 18084: no listener or scoped process
- Immutable final receipts: v1 `c0d0c17238b92a6ce216f1f522a15c5a48ae15d1d293eb99cb0a29d0e9d49f2f`; v2 `658fc3b15a5f65fb43fcdaa68b76a43840aa80f02aa44301c7f8e7b97b62bfba`

The pre-edit inventory also recorded byte sizes and SHA-256 identities for all BR7B focused files, all 20 BR7BR2A diagnostic/private evidence files, the six certified inputs, and the v1/v2 offline replay receipts. No existing artifact was overwritten, normalized, renamed, or deleted.

## Root cause and bounded policy

The prior command placed `--max-old-space-size=768` before the resolved `tsx/cli` path. The real seam showed two distinct defects:

1. The certified ceiling was 4096 MiB, not 768 MiB.
2. `tsx/cli` 4.21.0 starts the Node process that executes the TypeScript file. A direct flag on the CLI launcher alone did not appear in that process's `process.execArgv`.

The shared invocation builder now uses `process.execPath`, places the exact direct argument `--max-old-space-size=4096` before resolved `tsx/cli`, and forwards the same bounded Node arguments through TSX to the process that executes the BR7B test. `NODE_OPTIONS` is not used. The outer/global environment, Firebase CLI policy, and Java emulator heap are unchanged.

The standalone runner and future final-certification runner consume the same builder. The future runner also includes the focused regression before its BR7B emulator gate; it has not been invoked in this recovery.

## RED/GREEN evidence

- RED 1: exit 1; the public builder returned `--max-old-space-size=768` instead of `--max-old-space-size=4096`.
- GREEN 1: exit 0 after changing the centralized ceiling to 4096 MiB.
- RED 2: exit 1; the real TSX-executed probe did not receive the certified direct policy from the CLI launcher.
- GREEN 2: exit 0; the Windows-shell/TSX probe observed the exact heap argument, a 4144 MiB V8 heap limit, explicit GC, resolved paths with spaces preserved, no inherited `NODE_OPTIONS`, exact 858-path plan construction, and post-GC retained heap at or below 256 MiB.

## Emulator launch ledger

The maximum BR7BR2AR budget is eight launches. Every monitor invocation that can start Firebase counts as one attempt.

| Attempt | Consecutive ordinal | Parent/test exit | Result | Last safe evidence | Cleanup |
| --- | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 / 1 | Failed; sequence reset | Exact direct argument was absent from the TSX-executed process | Port free; no residual process |
| 2 | 1 | 1 / 1 | Failed; sequence reset | Firebase stopped before a retained Java/test process; bounded receipt contains no certified counts | Port free; no residual process |
| 3 | 1 | 1 / `0xC0000409` | Failed; sequence reset | Effective test process started; host commit pressure prevented the first post-plan phase | Port free; no residual process |
| 4 | 1 | 0 / 0 | Completed; consecutive pass 1 | Exact counts and semantic digests | Port free; no residual process |
| 5 | 2 | 0 / 0 | Completed; consecutive pass 2 | Exact counts and semantic digests | Port free; no residual process |

Accounting after attempt 5: attempted 5, started 5, exited 5, completed 2. Three authorized launches remain. Attempts 4 and 5 are consecutive complete passes. No production identity, credentials, external network operation, scan, selector, delete, deployment, activation, rollback, or full final-certification operation occurred.

## Stability receipts

Pending: three consecutive completed passes and the aggregate no-clobber receipt.

## Final verification

Pending until the required three-pass stability proof completes:

- affected focused tests
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `git diff --check`
- final protected hashes and custody comparison

## Authorization boundary

This recovery does not authorize a BR7B full final-certification run, a v3 receipt, staging, commit, push, deploy, activation, rollback, deletion, branch switch, or any production Firebase/Firestore access. G8.4BR7BR3 final certification remains separately unauthorized.
