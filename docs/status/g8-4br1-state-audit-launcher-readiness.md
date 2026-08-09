# G8.4BR1 — State-audit launcher readiness

Status: **locally repaired and certified; no production audit authorization
exists**.

## Immutable starting evidence

G8.4BR0 remains immutable at `98e97e8`. Its single authorized production
attempt remains consumed with zero observed reads and no audit result. G8.4BR1
does not rerun or reinterpret that attempt.

Before any source change, the Windows mechanism was reproduced locally with a
harmless offline-configured `spawnSync("npx.cmd", ["tsx", "--version"], ...)`.
The wrapper exited `0` after confirming exactly one attempted invocation,
`childStarted: false`, `status: null`, `errorCode: "EINVAL"`, and no stdout or
stderr. An earlier wrapper-quoting syntax error occurred before `spawnSync` and
did not attempt a launcher invocation.

## Repair contract

The corrected launcher uses `process.execPath` and the repository-resolved
`tsx/cli` module. Executable, tsx module, script path, and every manifest-derived
audit flag/value remain distinct array elements. It uses no shell, `npx.cmd`,
PowerShell, `cmd.exe`, interpolated command string, or npm argument forwarding.

One synchronous call is permitted. Its sanitized evidence distinguishes a
pre-launch rejection from a started/exited child and records child status,
signal, error code, stdout/stderr presence, output parsing status, argument
count, and attempted/started/exited accounting. Missing or malformed JSON from
an otherwise successful child fails closed without retrying.

## Local-only certification boundary

The focused tests cover a script path and arguments containing spaces, exact
argument preservation, success, nonzero child exit, pre-launch `ENOENT`, raw
stdout/stderr fidelity, malformed JSON, and exactly one spawn on success and
parse failure. The self-test launches only the import-free harmless fixture; it
clears credential/emulator variables, imports no Firebase module, does not load
credentials, cannot contact Firestore, and cannot execute
`scripts/audit-g8-4br0-state.ts`.

The harmless self-test receipt recorded `childStarted: true`, `childExited:
true`, `childExitStatus: 0`, no error, stdout present, stderr absent, valid JSON,
and invocation accounting `{ attempted: 1, started: 1, exited: 1 }`. Its child
returned the two expected arguments, including the value containing spaces.

## Local gate ledger

| Gate | Exit |
| --- | ---: |
| Harmless `npx.cmd` EINVAL reproduction assertion | 0 |
| `npm run test-g8-4br1-state-audit-launcher` | 0 |
| `npm run self-test-g8-4br1-state-audit-launcher` | 0 |
| `npm run test-g8-4br0-state-audit` | 0 |
| `npm run test-g8-4br0-state-audit-emulator` on Firestore port `18081` and demo project `demo-no-project` | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |

The first lint attempt stopped fail-closed on a TypeScript overload-narrowing
error. In the next active-goal turn, a type-only spawn adapter fixed that local
compile error; the focused tests, self-test, unit test, emulator test, lint, and
build then passed from the repaired state. The build emitted only the existing
large-chunk advisory.

## Manifest-derived preflight

After the focused implementation-identity commit existed, two consecutive
`npm run g8-4br0-state-audit-preflight` runs each exited `0` and produced
byte-identical output. The preflight reported `firebaseInitialization: false`,
zero reads, zero writes, direct Node execution, and 51 distinct arguments. Its
argument array preserved the manifest-derived counts and expected content
digests, while its identity-bound activation plan digest is reported from final
HEAD with the completed result. The invariant namespace digest remained
`ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`.
The full-output SHA-256 and final focused commit are reported in the completed
G8.4BR1 result.

This readiness work creates no authorization for G8.4BR2 or any production
action.

The later G8.4BR2.1 investigation preserved this result and explained why this
PowerShell/npm raw-output hash differs from direct Node stdout; see
[`g8-4br2-1-preflight-digest-recertification.md`](g8-4br2-1-preflight-digest-recertification.md).
