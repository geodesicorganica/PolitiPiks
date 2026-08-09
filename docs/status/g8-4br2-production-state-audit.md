# G8.4BR2 — Production state-audit preflight stop

Status: **stopped fail-closed before production because the required preflight
SHA-256 did not match**.

## Scope and starting identity

| Field | Value |
| --- | --- |
| Branch | `codex/politipiks-canonical-shadow-release` |
| Required and observed starting HEAD | `1c64283b87f7187c625b5f2e1a2ae0aed747149d` |
| Production authorization | One corrected, bounded, read-only state-audit launcher invocation, conditional on every preflight gate passing |
| Production mutation authorization | None |
| Sanitized receipt path | `.artifacts/private/canonical-migration/g8-4br2-production-state-audit.json` |

The seven G8.4BR1 focused files matched commit `1c64283b` exactly. The private
certified bundle and release manifest existed; their contents were not printed.
The sanitized receipt path was covered by `.gitignore` and was absent before
the preflight. It remained absent because production was not invoked.

The worktree contained only the ten unrelated files documented at the end of
G8.4BR1:

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

| UTC time | Operation | Exit | Result |
| --- | --- | ---: | --- |
| `2026-08-08T23:59:15.805Z` | Read branch, HEAD, `git status --short`, and BR1 commit file list | 0 | Exact branch and starting HEAD; dirty set matched the documented unrelated files |
| `2026-08-09T00:02:04.130Z` | Compare all seven BR1 focused files to `1c64283b` | 0 | No focused differences |
| `2026-08-09T00:02:04.130Z` | Check bundle/manifest existence and receipt ignore/absence without reading private contents | 0 | Bundle and manifest present; receipt ignored and absent |
| `2026-08-09T00:02:48.3287638Z`–`2026-08-09T00:03:03.1059066Z` | Invoke `scripts/verify-g8-4br0-state-audit-preflight.ts` once through direct Node and the repository-resolved `tsx/cli`, using a shell-free process with discrete arguments | child 0; gate 1 | Semantic gates passed, but required full-output SHA-256 failed |
| After `2026-08-09T00:03:03.1059066Z` | Production `scripts/run-g8-4br0-state-audit.ts` | not invoked | Required preflight conditions were not all satisfied |

No npm wrapper, `npx.cmd`, `Tee-Object -NoClobber`, `shell:true`, or
interpolated command string was used. The preflight was not rerun.

## Single preflight result

| Check | Observed | Required | Result |
| --- | --- | --- | --- |
| Preflight child exit | `0` | `0` | pass |
| Firebase initialization | `false` | `false` | pass |
| Reads / writes | `0 / 0` | `0 / 0` | pass |
| Executable | `C:\Program Files\nodejs\node.exe` | direct `process.execPath` | pass |
| tsx CLI | `C:\Projects\Politipiks\node_modules\tsx\dist\cli.mjs` | repository-resolved `tsx/cli` | pass |
| Discrete argument count | `51` | `51` | pass |
| Unique receipts | `5 / 5` | `5 / 5` | pass |
| Expected content bound | `3,352` | `3,352` | pass |
| Namespace digest | `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0` | same | pass |
| Plan digest | `5f761f5388fef0ca3a06ed528b6e5b1a90d400abcbb6280a0a28c1b6575db54b` | identity-bound output | recorded |
| Sanitized stdout | present; `2,814` UTF-8 bytes | present | pass |
| Sanitized stderr | absent | absent | pass |
| Full-output SHA-256 | `2f5604e13d3b40a894eb5191016bfc48160f401ac3ca94c73fc9b18a4076b2f2` | `a21b518c0cb6015196c2ed4e25c73769adebc1d67e5372ec63bc283c3cd438bd` | **fail** |

The validation wrapper therefore exited `1`. The mismatch was not normalized,
reinterpreted, or investigated by a second preflight. Under the explicit stop
rule, the production launcher was not invoked.

## Production invocation accounting and state result

```json
{
  "productionInvocation": {
    "attempted": 0,
    "started": 0,
    "exited": 0,
    "exitStatus": null,
    "stdoutPresent": false,
    "stderrPresent": false,
    "authorizationConsumedByLauncher": false
  },
  "readsPerformed": {
    "selector": 0,
    "expectedActivePaths": 0,
    "total": 0
  },
  "selector": {
    "state": "unknown/unverified",
    "contract": null,
    "metadata": {
      "status": "not-applicable",
      "conflictingFields": null
    }
  },
  "contentAudit": null,
  "safeNextAction": "stop for review; separately authorize preflight digest-contract investigation and recertification before any production audit"
}
```

There is no sanitized production audit result because production was not
attempted. G8.4BR0 remains immutable failure evidence, and production selector
and content state remain unknown/unverified.

## Prohibited operations not performed

No production launcher invocation, second audit, follow-up read, existing
verify-only command, activation, resume, smoke, rollback, deployment, deletion,
production write, collection scan, push, or branch change occurred. No selector
or expected content path was read. Any next operation requires separate
authorization.

The later offline G8.4BR2.1 investigation preserved this stop result and
classified the raw digest mismatch; see
[`g8-4br2-1-preflight-digest-recertification.md`](g8-4br2-1-preflight-digest-recertification.md).
