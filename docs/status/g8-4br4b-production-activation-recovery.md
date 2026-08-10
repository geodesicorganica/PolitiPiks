# G8.4BR4B — Guarded production activation recovery

Status: **the one authorized production apply invocation was consumed and
failed closed on 858 conflicting content documents before any write; the
conditional verify authorization was not used**.

## Scope and starting identity

| Field | Required and observed value |
| --- | --- |
| Branch | `codex/politipiks-canonical-shadow-release` |
| Starting HEAD | `3bdb82dcd8d27e11a1ff554a56b3fda109730578` |
| Focused activation implementation | `cfff2011ed72f560f531983ce4291237479fa642` |
| Apply authorization | Exactly one preflight-derived production apply invocation |
| Verify authorization | Exactly one preflight-derived read-only invocation, conditional on complete apply success |
| Sanitized apply receipt | `.artifacts/private/canonical-migration/g8-4br4b-production-activation-apply.json` (ignored) |
| Sanitized verify receipt | Not created because the conditional gate failed |

The focused implementation files matched commit `cfff2011` exactly. The
certified private bundle, committed release manifest, credential configuration
and referenced credential file, and ignored private output directory were
present. Credential JSON parsed with all required fields, the configured
project and database matched, and no unsafe emulator, test-auth, mock-data, or
admin-seed flag was enabled. No credential path, value, document body, raw
stdout, raw stderr, or secret was persisted or printed.

The new apply and verify receipt paths were ignored and absent before the
preflight. The ten pre-existing unrelated modified/untracked paths matched the
documented set and were not staged, deleted, or included in this operation:

```text
 M .env.example
 M docs/ROADMAP.md
 M ingest/package-lock.json
 M src/components/ResearchDrawer.tsx
 M src/lib/dataPlatform.ts
 M src/lib/researchBundle.ts
?? docs/status/g2-6-production-shadow-copy.md
?? docs/status/g3-3-live-publication-certification.md
?? docs/status/g3-canonical-cutover-readiness.md
?? scripts/prune-invalid-federal-races.ts
```

## Bounded command ledger

| UTC time | Operation | Exact exit | Result |
| --- | --- | ---: | --- |
| Before `2026-08-10T19:11:29.698Z` | Branch, HEAD, focused-file, unrelated-path, bundle, manifest, receipt, ignore, credential, and unsafe-environment gates | `0` | Every required local gate passed; production invocation accounting remained `0/0/0` |
| `2026-08-10T19:11:29.698Z`–`2026-08-10T19:11:37.912Z` | Invoke the committed activation preflight once through direct Node and repository-resolved `tsx/cli`, `shell:false` | wrapper `0`; preflight child `0` | Embedded canonical receipt parsed; every required identity, digest, count, argument, receipt, and zero-I/O gate passed |
| `2026-08-10T19:12:34.907Z`–`2026-08-10T19:13:02.177Z` | Invoke the exact preflight-derived 47-argument apply command once, `shell:false` | wrapper `1`; apply child `1` | Valid structured `CONTENT_CONFLICT` failure during `content-validation`; authorization consumed |
| After `2026-08-10T19:13:02.177Z` | Evaluate the conditional verify gate | not invoked | Gate false; verify receipt remains absent and verify authorization remains unused |
| After the stop | Persist sanitized receipt and update only authorized documentation | local-only | No retry or follow-up production operation |

The preflight and production children each attempted, started, and exited
exactly once. The apply executable, working directory, and discrete 47-element
argument array came directly from the parsed and revalidated preflight object.
No npm/npx wrapper, command string, `shell:true`, manually transcribed flag,
retry, or nested production launcher was used.

## Canonical preflight validation

| Check | Observed and required value | Result |
| --- | --- | --- |
| Preflight contract | `g8-4br4a-activation-preflight/v1` | pass |
| Result contract | `g8-4br4a-activation-result/v1` | pass |
| Canonical digest | `e85147b793b07f7a3576091c482de6f8840f050d98cccf1dfb93e4297740db7e` | pass |
| Activation implementation | `cfff2011ed72f560f531983ce4291237479fa642` | pass |
| Activation plan digest | `9f8827ac20dd9acfdcb0c6dd7beff8df30b767b504bbbe0fb366711b0ba3ca49` | pass |
| Namespace digest | `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0` | pass |
| Apply argument digest | `a42df98cd125c123e08c85f67328bb68a86e075e6eb93220e5fd9510b2155aa7` | pass |
| Verify argument digest | `2c880e496b63b1a5f57131683a9c977ece60a2db5a88c01ebd096c0694165a34` | pass |
| Ordered arguments | `47` for apply, verify-only, and rollback | pass |
| Future receipts | `4 / 4` distinct G8.4BR4B labels | pass |
| Expected content | `3,352` | pass |
| Firebase initialization / reads / writes / commands | `false / 0 / 0 / 0` | pass |
| Operation shell | `false` | pass |

## Exactly-once apply result

The apply launcher returned valid strict `g8-4br4a-activation-result/v1` JSON.
Its bounded accounting was:

```json
{
  "mode": "apply",
  "status": "failed",
  "phase": "content-validation",
  "failedPhase": "content-validation",
  "error": {
    "classification": "conflict",
    "code": "CONTENT_CONFLICT"
  },
  "firebase": {
    "initialization": "succeeded",
    "bootstrap": "succeeded"
  },
  "operations": {
    "reads": {
      "selector": {
        "planned": 1,
        "attempted": 1,
        "succeeded": 1,
        "failed": 0,
        "unknown": 0,
        "notAttempted": 0,
        "outcome": "succeeded"
      },
      "content": {
        "planned": 6704,
        "attempted": 3352,
        "succeeded": 3352,
        "failed": 0,
        "unknown": 0,
        "notAttempted": 3352,
        "outcome": "succeeded"
      }
    },
    "writes": {
      "selector": {
        "planned": 2,
        "attempted": 0,
        "succeeded": 0,
        "failed": 0,
        "unknown": 0,
        "notAttempted": 2,
        "outcome": "not-attempted"
      },
      "content": {
        "planned": 3352,
        "attempted": 0,
        "succeeded": 0,
        "failed": 0,
        "unknown": 0,
        "notAttempted": 3352,
        "outcome": "not-attempted"
      }
    }
  },
  "batches": {
    "attempted": 0,
    "completed": 0,
    "failed": 0,
    "unknown": 0
  },
  "selector": {
    "before": "absent",
    "pending": "not-attempted",
    "active": "absent"
  },
  "content": {
    "expected": 3352,
    "exact": 0,
    "missing": 2494,
    "conflicting": 858,
    "unknown": 0
  },
  "safeNextAction": "stop for review; never overwrite conflicting selector or content"
}
```

Certified-shadow verification completed first and returned the required
namespace digest. The structured result contract does not separately enumerate
those shadow-store reads; the read counts below are its exact selector and
destination-path accounting. No additional production read was invoked after
the conflict stop.

The selector-first read again observed
`catalogActivations/canonical-2026` absent. All 3,352 expected destination paths
were then read successfully before mutation. The executor classified 2,494 as
missing and 858 as conflicting; none were exact or unknown. It therefore
stopped before creating a pending selector, promoting content, running the
second exact-verification read pass, or writing the active selector. Planned
write bounds were never exercised: selector writes, content writes, and write
batches were all `0` attempted.

## Conditional verify and final boundary

The apply exited nonzero, reported `status: failed`, did not reach
`phase: completed`, did not write an active selector, and did not prove 3,352
exact documents. Therefore the conditional verify authorization did not become
executable. The preflight-derived verify-only command was not invoked and its
sanitized receipt path remains absent.

The apply authorization is consumed and must not be retried. No verify-only
command, second read, state audit, smoke test, Hosting or rules deployment,
rollback, resume, overwrite, collection scan, deletion, push, or branch change
occurred. Production remains unactivated with a selector observed absent at the
time of this invocation and conflicting destination content requiring separate
review and fresh authorization for any future production operation.
