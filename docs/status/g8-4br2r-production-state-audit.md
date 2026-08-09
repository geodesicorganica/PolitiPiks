# G8.4BR2R — Canonical-receipt-guarded production state audit

Status: **the one authorized production audit was consumed and failed closed
on a nonzero auditor exit; no valid audit result was returned and production
state remains unknown/unverified**.

## Scope and starting identity

| Field | Value |
| --- | --- |
| Required and observed branch | `codex/politipiks-canonical-shadow-release` |
| Required and observed starting HEAD | `0fb0a44c064af133655cc803d3dbbdb1495b5812` |
| Production authorization | Exactly one canonical-receipt-guarded, read-only state-audit launcher invocation |
| Production mutation authorization | None |
| Sanitized result | `.artifacts/private/canonical-migration/g8-4br2r-production-state-audit.json` (ignored) |

The seven files committed by G8.4BR2.1 were the exact expected focused set and
matched `0fb0a44` in the worktree. The production launcher, auditor, activation
and state-audit libraries, and release manifest also matched that commit. The
ten previously documented unrelated dirty/private paths were preserved:

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

The certified private bundle, committed release manifest, private credential
configuration, and referenced credential file were present without printing
their contents or values. The private output directory existed and was ignored.
The new sanitized result path was ignored and absent before preflight and
production.

A consolidated prerequisite checker exited `1` only because it included a
supplemental, non-authorizing diagnostic that required the effective
`FIRESTORE_DATABASE_ID` environment value to equal the manifest. The required
credential-presence checks all passed. The committed 51-argument invocation
supplies `--database-id` explicitly, and the committed Firestore bootstrap gives
the CLI argument precedence over the environment value. No input, guard,
argument, receipt, implementation identity, source file, test, bundle, or
manifest was changed or reinterpreted.

## Bounded command ledger

| UTC time | Operation | Exact exit | Result |
| --- | --- | ---: | --- |
| Before `2026-08-09T03:44:22.745Z` | Read branch, HEAD, status, committed file list, applicable agent instructions, prior receipts, and launcher/auditor source | Read-only discovery commands `0`, plus one file-search timeout `124` after the required paths were printed | Branch/HEAD and the documented ten-path dirty set identified; no production access |
| `2026-08-09T03:44:22.745Z`–`2026-08-09T03:44:23.354Z` | Consolidated secret-safe prerequisite check | `1` | Every required gate passed; only the supplemental environment/database equality diagnostic was false |
| Before `2026-08-09T03:46:20.263Z` | First local preflight-wrapper setup | `1` | `createRequire` rejected an undefined eval filename before `spawnSync`; committed preflight accounting `0 / 0 / 0` attempted / started / exited |
| `2026-08-09T03:46:20.263Z`–`2026-08-09T03:46:24.820Z` | Invoke the committed preflight once through direct Node plus repository-resolved `tsx/cli`, `shell:false`, and parse it with the committed canonical parser | wrapper `0`; preflight child `0` | Canonical JSON valid and every required receipt gate passed |
| `2026-08-09T03:48:11.316Z`–`2026-08-09T03:48:16.243Z` | Invoke `scripts/run-g8-4br0-state-audit.ts` through direct Node plus repository-resolved `tsx/cli`, `shell:false`, with discrete arguments | wrapper `1`; launcher `1`; auditor child `1` | The exactly-once production authorization was consumed; launcher JSON was valid, but the auditor returned no JSON and had stderr present |
| After `2026-08-09T03:48:16.243Z` | Persist sanitized private receipt and update only the authorized documentation | local-only | No production retry or follow-up read |

No npm wrapper, `npx.cmd`, shell interpolation, PowerShell child launcher,
`Tee-Object`, or second preflight invocation was used. The failed local wrapper
setup did not reach its `spawnSync` line and therefore did not invoke the
committed preflight.

## Canonical preflight validation

The committed preflight was invoked exactly once. Its child started and exited
`0`, stdout was present, stderr was absent, and the committed parser accepted
the embedded receipt and digest.

| Check | Observed | Required | Result |
| --- | --- | --- | --- |
| Receipt schema | `g8-4br2-1-state-audit-preflight/v1` | same | pass |
| Canonical digest | `c65879b157b9c6ae6b11d6ff8f109e29fc1f0ea5463b67396e26028e2162401b` | same | pass |
| Firebase initialization | `false` | `false` | pass |
| Reads / writes | `0 / 0` | `0 / 0` | pass |
| Production launcher shell | `false` | `false` | pass |
| Exact ordered production arguments | `51` | `51` | pass |
| Receipts | `5 / 5` unique | `5 / 5` unique | pass |
| Expected content documents | `3,352` | `3,352` | pass |
| Namespace digest | `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0` | same | pass |
| Activation plan digest | `6c1a1cbe646317257dd3b72bab985e21d03e09f5998d81e95ff67f932471d4a6` | identity-bound receipt value | recorded |

The receipt bound project `politipiks`, database
`ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a`, generation
`canonical-2026-shadow-v2`, shadow source
`295466ccc52ccd4d6ad4f1dfb444d48410b92910`, and activation/state-audit
implementation identity `0fb0a44c064af133655cc803d3dbbdb1495b5812`.
Neither historical raw stdout hash was used as a gate.

## Exactly-once production invocation

```json
{
  "utc": {
    "startedAt": "2026-08-09T03:48:11.316Z",
    "finishedAt": "2026-08-09T03:48:16.243Z"
  },
  "productionInvocation": {
    "attempted": 1,
    "started": 1,
    "exited": 1,
    "launcherExitStatus": 1,
    "launcherSignal": null,
    "launcherErrorCode": null,
    "authorizationConsumed": true,
    "retries": 0
  },
  "launcherOutput": {
    "stdoutPresent": true,
    "stderrPresent": false,
    "jsonStatus": "valid-json"
  },
  "auditorChild": {
    "attempted": 1,
    "started": 1,
    "exited": 1,
    "exitStatus": 1,
    "signal": null,
    "errorCode": null,
    "stdoutPresent": false,
    "stderrPresent": true,
    "jsonStatus": "missing-json",
    "argumentCount": 51
  }
}
```

The launcher used `C:\Program Files\nodejs\node.exe`, repository-resolved
`C:\Projects\Politipiks\node_modules\tsx\dist\cli.mjs`, the committed
`scripts/run-g8-4br0-state-audit.ts`, `shell:false`, and a discrete argument
array. The committed runner then passed the canonical 51-element discrete
argument array to the bounded auditor with `shell:false`.

The child nonzero exit and missing audit JSON are the stop condition. Raw
stdout/stderr and secret values were not persisted. Because no valid audit
result exists, no selector-first read count, exact-path read count, selector
state/contract/metadata, content count/digest/conflict result, or child-provided
`safeNextAction` can be asserted. These fields are **unknown/unverified**, not
zero or clean.

The sanitized local receipt records:

```json
{
  "productionResult": {
    "status": "failed-closed-on-nonzero-auditor-exit",
    "readsPerformed": "unknown/unverified",
    "selector": {
      "state": "unknown/unverified",
      "contract": null,
      "metadata": null
    },
    "contentAudit": null,
    "safeNextAction": "stop for review; do not retry or perform a follow-up production read without separate authorization"
  }
}
```

## Final boundary

After the consumed invocation, no retry, second read, collection scan,
verify-only command, activation, resume, smoke, rollback, deployment, deletion,
write, push, or branch change occurred. The selector and content state remain
unknown/unverified. Any diagnosis or next action requires separate explicit
authorization.
