# G8.4BR3A — Structured audit failure readiness

Status: **locally certified; no production authorization was created or used**.

## Scope and immutable history

BR0, BR1, BR2, and BR2R remain immutable historical evidence:

| Record | Evidence |
| --- | --- |
| BR0 | `98e97e8`, [post-failure state audit](g8-4br0-post-failure-state-audit.md) |
| BR1 | `1c64283`, [launcher readiness](g8-4br1-state-audit-launcher-readiness.md) |
| BR2 | `0fb0a44`, [preflight stop](g8-4br2-production-state-audit.md) |
| BR2R | `cb250781ddaf37ab63b8e6da4c232801bad2c27f`, [production state audit](g8-4br2r-production-state-audit.md) |

BR2R facts confirmed by preserved evidence: its canonical preflight passed, the
launcher child started and exited `1`, the auditor child started and exited
`1`, no valid auditor JSON was returned, raw stderr was present but was not
retained, and no selector/content read result was persisted. The exact BR2R
error is therefore **unrecoverable from preserved artifacts**. The local BR0
`npx.cmd`/`EINVAL` reproduction explains the earlier BR0 launcher failure, not
BR2R; it must not be projected onto BR2R. BR2R’s exact auditor phase and cause
remain unknown.

## Structured result contract

Every handled auditor exit now emits one sanitized JSON document to stdout:

```text
g8-4br3a-state-audit-result/v1
```

The result contains `schemaVersion`, `status`, `phase`, `failedPhase`, stable
`error.classification`/`error.code`, identity and expected-count metadata,
Firebase/bootstrap state, selector and exact-path read accounting, selector and
content results when available, and `safeNextAction`. Argument, validation,
guard, identity, environment, bootstrap, selector-read, exact-path-read, and
completed outcomes are represented by the same schema. The top-level executable
boundary catches import/runner failures and emits a safe fallback result.

The launcher boundary also emits only stable child-result summary fields. It
does not forward raw stdout, raw stderr, stack traces, document data, credential
paths, private keys, tokens, emails, or unbounded error messages.

## Phase matrix

| Phase | Local work | Stable failure examples | Firebase/read state |
| --- | --- | --- | --- |
| `argument-parsing` | mode, receipt, and ordered flags | `AUDIT_MODE_REQUIRED`, `INVALID_ARGUMENT` | Firebase not attempted; reads not attempted |
| `bundle-manifest-validation` | certified private bundle and release manifest parse/validation | `INPUT_NOT_FOUND`, `INPUT_PARSE_FAILED` | Firebase not attempted |
| `plan-guard-validation` | manifest-derived plan, target, generation, digests, counts, namespace | `GUARD_MISMATCH` | Firebase not attempted |
| `implementation-identity` | focused source identity and clean-state check | `IMPLEMENTATION_IDENTITY_MISMATCH` | Firebase not attempted |
| `environment-validation` | credential path/JSON/field checks, project/database comparison, unsafe flags | `CREDENTIAL_*`, `CONFIGURED_*`, `UNSAFE_ENVIRONMENT_FLAGS` | Firebase not attempted |
| `firestore-bootstrap` | lazy target-checked Firestore store construction | `BOOTSTRAP_FAILED`, `PERMISSION_DENIED`, `QUOTA_EXCEEDED` | initialization/bootstrap recorded as attempted-failed or not-attempted |
| `selector-read` | exactly one first read of `catalogActivations/canonical-2026` | `PERMISSION_DENIED`, `SERVER_COMPLETION_UNKNOWN`, `READ_FAILED` | selector accounting distinguishes failed vs unknown completion |
| `exact-path-reads` | only the 3,352 manifest-derived paths, in bounded batches of 100 | quota/permission/server-completion failures | partial exact/missing/conflicting counts and read accounting retained |
| `completed` | absent/legacy/incompatible stop or valid v2 content audit result | conflict is a completed result with `safeNextAction=stop for review` | no writes; selector-first bound preserved |

## Read-accounting semantics

Selector accounting has expected count `1`; exact-path accounting has expected
count `3,352`. Each ledger distinguishes:

- `not-attempted`: no request was issued;
- `attempted-unknown`: a request was attempted but server completion is unknown
  (`DEADLINE_EXCEEDED`, `UNAVAILABLE`, or `ABORTED` semantics);
- `succeeded`: a read completed successfully;
- `failed`: a read completed with a known failure such as permission/quota; and
- `mixed`: more than one of the above occurred in a bounded batch.

The counters expose `attempted`, `succeeded`, `failed`, `unknown`, and
`notAttempted` separately. No selector or exact-path read is represented as
zero unless the result proves it was not attempted.

## Secret-safe checks and sanitization proof

The environment phase checks only whether a configured credential path exists,
whether its JSON parses, whether `project_id`, `client_email`, and `private_key`
are strings, whether configured project/database identities match the certified
target, and whether emulator/test flags are enabled. It never emits the path,
JSON, field values, or environment values. Fault tests inject private-key,
token, email, path, permission, quota, and server-completion strings; serialized
results contain none of them and retain only stable codes.

## Local certification ledger

| Command | Exit |
| --- | ---: |
| `npm run test-g8-4br3a-structured-audit` | 0 |
| `npm run test-g8-4br1-state-audit-launcher` | 0 |
| `npm run self-test-g8-4br1-state-audit-launcher` | 0 |
| `npm run test-g8-4br2-1-preflight-receipt` | 0 |
| `npm run test-g8-4br0-state-audit` | 0 |
| `npm run test-g8-4br0-state-audit-emulator` on alternate port `18081` | 0 |
| `npm run g8-4br3a-offline-audit` | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |
| final direct preflight 1 | 0 |
| final direct preflight 2 | 0 |

The offline replay passed the exact `51` certified arguments through the
Firebase-free phases and completed with Firebase initialization/bootstrap
`not-attempted`, one successful selector read against an offline stub, and all
3,352 exact paths not attempted. No Firebase module initialized and no network
or production operation occurred.

## Final canonical semantic receipt

| Field | Value |
| --- | --- |
| Preflight contract | `g8-4br3a-state-audit-preflight/v1` |
| Result contract | `g8-4br3a-state-audit-result/v1` |
| Canonical receipt digest | `08b8c556993b69de7142b38c92b74877cea6d5bb789dcfeacb12949a53e80c8d` |
| Focused implementation identity | `041c017e0483318354e44dd75a3866c9771fd763` |
| Argument count | `51` |
| Activation plan digest | `9adde6e0a909b0950d0930d74d2942847916736db40abc4afc8b6b76fdee35d5` |
| Namespace digest | `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0` |
| Firebase initialization / reads / writes | `false / 0 / 0` |

Both final direct preflights produced identical canonical receipts and digests.

## Focused changes

Implementation/test commits: `1e563f6`, `a0cea23`, `e6de0cf`, `aa803c5`,
`5865199`, and `041c017`. They add the versioned result contract, explicit
phase runner, secret-safe environment checks, stable error/read semantics,
fault-injection/sanitization tests, exact-argument offline replay, and the
alternate-port emulator matrix. No unrelated dirty path or private artifact was
staged, changed, or deleted.

No production read, retry, selector operation, activation, resume, smoke,
rollback, deployment, deletion, push, branch change, or G8.4BR3B authorization
occurred. Any future production audit requires separate authorization and must
use the structured result contract.
