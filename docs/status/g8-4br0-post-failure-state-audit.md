# G8.4BR0 — Post-failure production state audit

Status: **fail-closed; the single authorized read-only audit invocation was
consumed at the launcher boundary without producing an audit result**.

## Scope and identity

| Field | Value |
| --- | --- |
| Branch | `codex/politipiks-canonical-shadow-release` |
| Starting HEAD | `aaddb7a8fcdc33a98d0c2c1455abc062759b2692` |
| Final committed auditor HEAD | `d5d450b3280b27177394e55a1f9583ad31504b6c` |
| Project / database | `politipiks` / `ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a` |
| Generation | `canonical-2026-shadow-v2` |
| Shadow source commit | `295466ccc52ccd4d6ad4f1dfb444d48410b92910` |
| Expected content | 470 races; 14 measures; 2,384 candidate research; 14 measure research; 470 metrics; 3,352 paths |
| Namespace digest | `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0` |
| Audit receipt | `g8-4br0-state-audit-2026-08-08` |

The auditor validates manifest-derived target, generation, identity, digests,
counts, committed source, distinct receipt, and safe environment before its
lazy Firestore import. It reads `catalogActivations/canonical-2026` first and,
only for a valid v2 pending/active/rollback selector, reads the exact 3,352
expected paths. It has no write or collection-scan operation.

## Local diagnosis of historical G8.4B

The preserved G8.4B record shows the generated launcher was invoked through
`npm exec tsx .tools/g8-4b-production-sequence.ts` from the parent workspace and
exited `1` at approximately `2026-08-08T12:19:34Z`. The npm debug log contains no
child stdout, child stderr, generated-phase JSON, or Firebase initialization
record. Saved PowerShell history contains no additional matching command. The
launcher source would print generated-phase JSON before spawning the apply
child, but the durable record does not preserve that output. Therefore the
historical production phase is **indeterminate**; the short duration is not
treated as proof of success or of a particular failure phase.

The harmless local reproduction of the same Windows launcher mechanism used
`spawnSync("npx.cmd", ["tsx", "-e", "console.log(\"local-launch-ok\")"], { cwd,
env, windowsHide: true })` and returned `status: null`, `error: "EINVAL"`, empty
stdout, and no stderr. This reproduces a pre-child-launch failure for the
mechanism. It is strong local diagnosis for the likely launcher boundary, not
retroactive proof of the exact historical G8.4B phase because that error was not
persisted by G8.4B.

## Local implementation and gates

The focused read-only auditor and tests were committed before production:

- `e45091c` — bounded selector-first auditor, manifest-derived preflight, and coverage.
- `d5d450b` — fail-closed unsafe-environment guard.

Both Firebase-free preflight runs were byte-identical at final HEAD, with
`firebaseInitialization: false`, `reads: 0`, and `writes: 0`. The new unit and
alternate-port emulator audit tests, `test-g8-3a-v2-activation`,
`test-g8-2a-product-shadow`, `lint`, `build`, and `git diff --check` passed.

## G8.4BR0 production ledger

| UTC time | Operation | Exit | Reads | Selector/content result |
| --- | --- | ---: | ---: | --- |
| `2026-08-08T14:47:53.656Z`–`2026-08-08T14:47:53.659Z` | One generated `npx tsx scripts/audit-g8-4br0-state.ts --audit ...` invocation via the committed one-shot launcher | 1 | 0 observed | No stdout/stderr; no selector state; no content scan; audit result absent |

The invocation is consumed regardless of result. No retry, second state read,
existing `--verify-only`, apply, smoke, rollback, Hosting/rules deployment,
activation, resume, deletion, branch change, or push occurred. The production
selector state is **unknown/unverified**, and exact content counts are **not
applicable because no paths were scanned**.

## Exact next authorization

Stop for review. Any follow-up requires a new explicit authorization for one
corrected, read-only state-audit launcher invocation. Do not authorize apply,
resume, existing verify-only, smoke, rollback, deployment, or deletion until a
successful bounded audit establishes the selector state.
