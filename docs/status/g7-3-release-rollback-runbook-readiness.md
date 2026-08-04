# G7.3 — Production release and rollback runbook readiness

Status: **locally certified on 2026-08-03**. This goal performed no production
Firebase/Firestore read, fresh capture, shadow write, deployment, selector
activation, rollback, deletion, external API call, push, or branch change.

## Synchronization preflight

The required certified commits were present before implementation:

- Parent: `a2c3a7cb899f7e7ca394ce67fc7ab0bf9c3d91a1`,
  `387b97b37ffa89c0ccc5fd7af37cc47f09fe0264`, and
  `664c1dd5cb6a00499c5e5aa35c1d30075ad7eed3`.
- Nested active app: `ed87a4bf6ad060903d3af13e64c147466ae5fe16` and
  `8a77a316eabb4f1f6bd1dfae8b790942c57f7d97`.

G7.1R and G7.2 were not reconstructed, rerun as goals, undone, or mutated.
Their certified local bundle and unrelated dirty files were preserved.

## Certified G8 catalog-beta contract

The only accepted artifact is the certified private G7.1 local product bundle,
validated as `canonical-2026-shadow-v2`. Its sanitized contract is:

| Field | Certified value |
| --- | ---: |
| Races | 470 |
| Measures | 14 |
| Candidate-research documents | 2,384 |
| Measure-research documents | 14 |
| Metrics | 470 |
| Selectors | 1 |
| Total bundle documents | 3,353 |
| Prediction-ready federal races | 0 |
| Prediction-ready California measures | 14 |
| Duplicate paths / orphans / unresolved references / leakage | 0 / 0 / 0 / 0 |

The certified input, evidence, plan, and bundle digests are pinned in
`docs/g8-catalog-beta-release-manifest.json` and are emitted by the validator
without private artifact contents. `canonical-2026-shadow-v1` is retained as
immutable, identity-only, and nonpublishable history. No command in this
runbook can activate it. FEC filing status is not ballot eligibility.

## Runbook contract

The exact G8 order is:

```text
preflight → fresh bounded capture → offline certification → shadow write
→ namespace verification → rules deployment → app deployment
→ selector activation → smoke verification → observation window
```

Every production read, write, deployment, selector change, rollback, and
deletion has a distinct authorization boundary. The validator rejects missing or
reused boundaries, unsafe ordering, stale counts/digests, v1 input, wrong
project/database, unsafe environment policy, dirty release scope, and missing
fail-closed stop conditions. It also rejects any rollback that permits deletion.

Rollback is separated by failure point:

1. Before selector activation: stop and preserve the legacy selector.
2. After activation: change only the selector to `legacy-2026`, then smoke-test.
3. Rules failure: redeploy the previous known-good rules revision.
4. Application failure: redeploy the previous known-good application build.
5. Partial or failed shadow write: stop, verify exact writes, preserve them, and
   use an approved forward-fix or resume plan.

Canonical and legacy records are retained in every path. Manual console edits,
legacy retirement, prediction migration, and destructive cleanup are excluded.
Catalog beta, progressive prediction enablement, and 50-state certification are
separate release goals.

## Validator and tests

The new Firebase-free validator is `scripts/verify-g8-release-readiness.ts`,
backed by `scripts/lib/g8ReleaseReadiness.ts`. It emits a deterministic
sanitized receipt with no private path or content. Focused tests cover stale
counts/digests, v1 input, unsafe ordering, missing authorization boundaries,
destructive rollback, wrong project/database, and dirty release scope.

```powershell
npm run test-g8-release-readiness
npm run verify-g8-release-readiness
```

The receipt digest from the deterministic validator is:

`5b38f53e9d7a48ce01c90695e3f07257d9f43d75211c9a652f30970398907ac9`

The validator was run twice; both receipts must retain this digest. Its fixed
warnings state that production authorization is absent and no capture, write,
deployment, selector change, rollback, deletion, or external call was executed.

## Sanitized command boundary

Only placeholders are permitted in future production templates:

```powershell
npx tsx <shadow-write-script> --project-id <project> --database-id <database> --generation <generation>
npx tsx <rules-deploy-script> --project-id <project> --database-id <database> --commit <rules-commit>
npx tsx <app-deploy-script> --project-id <project> --commit <app-commit>
npx tsx <selector-activation-script> --project-id <project> --database-id <database> --generation <generation>
npx tsx <rollback-script> --project-id <project> --database-id <database> --reason <receipt-id>
```

These templates are documentation only. No credential, private artifact
content, executable approval value, or production endpoint is included.

## Verification record

All required commands exited `0`.

### Parent repository

| Command | Exit |
| --- | ---: |
| `npm run test-g8-release-readiness` | 0 |
| `npm run verify-g8-release-readiness` | 0 |
| `npm run test-local-product-bundle` | 0 |
| `npm run test-canonical-activation` | 0 |
| `npm run test-canonical-activation-emulator` | 0 |
| `npm run verify-deployment-readiness` | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |

The validator was run twice in one local PowerShell check. Both sanitized
receipts had digest
`5b38f53e9d7a48ce01c90695e3f07257d9f43d75211c9a652f30970398907ac9`, with
`productionAccess=false`, `networkCalls=0`, `writes=0`, and `deletions=0`.

### Nested active app

| Command | Exit |
| --- | ---: |
| `npm run lint` | 0 |
| `npm run lint:rules` | 0 |
| `npm run test-contest-catalog` | 0 |
| `npm run test-canonical-evidence` | 0 |
| `npm run verify-firestore-league-flow` | 0 |
| `npm run verify-browser-league-flow` | 0 |
| `npm run build` | 0 |
| `npm run verify-deployment-readiness` | 0 |
| `git diff --check` | 0 |

Expected warnings: the existing rules open-read warning; emulator demo-project,
multiple-database, missing-rules-file, SIGKILL shutdown, metadata lookup, and
expected permission-denied traces; Vite large-chunk advisories; browser fixture
missing Gemini key and occupied HMR WebSocket port; and Git LF/CRLF notices.
None changed an exit code or initialized production services.

## Changed-file and workspace boundary

G7.3 changes are limited to the manifest, validator/test, package scripts, and
the three requested documentation records. Existing dirty files in both
repositories, including the nested `.env.example`, were not staged, rewritten,
or deleted. No nested application source change was required.
