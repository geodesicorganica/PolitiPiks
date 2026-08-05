# Deployment Readiness

This checklist is the MVP production gate for Politipick.

## Required Gates

Run these before merging or deploying production-facing changes:

```sh
npm run lint
npm run lint:rules
npm run build
npm --prefix ingest run build
npm run verify-deployment-readiness
npm run verify-league-flow
npm run verify-firestore-league-flow
npm run verify-browser-league-flow
npm run test-canonical-activation
npm run test-canonical-activation-emulator
```

Run contest verification against the target Firestore database after seeding or ingesting:

```sh
npm run verify-contests
```

## Production Safety

Production app builds must not enable these flags:

- `VITE_USE_FIREBASE_EMULATORS`
- `VITE_ENABLE_TEST_AUTH`
- `VITE_USE_MOCK_CONTESTS`
- `VITE_ALLOW_ADMIN_SEED`

Use `npm run verify-deployment-readiness` to check the current shell. To check a specific env file before deploy:

```sh
npm run verify-deployment-readiness -- --env-file .env.production
```

## Firebase And Data

- `firebase.json` must target the same Firestore database ID as `firebase-applet-config.json`.
- Firestore rules must be deployed before production traffic.
- `admins/<uid>` documents grant admin access; create them deliberately and audit them before public use.
- Contest data should be written by ingest or controlled scripts, not by browser clients.
- Research coverage is a public-readiness gate. Run `npm run verify-contests` after ingest/enrichment and confirm no actionable coverage gaps.
- Canonical federal activation is selector-driven. Do not deploy a client that can
  see canonical documents until the separately approved `catalogActivations/canonical-2026`
  operation, exact active verification, rules deployment, and client deployment
  have been completed in that order.
- Future guarded activation commands must use direct `npx tsx`, never `npm run`;
  the Windows npm/PowerShell wrapper has previously stripped named safety guards.
- A rollback changes only the catalog selector and does not delete either federal
  generation. Closed targets remain closed because `closeAt` remains rule-enforced.
- Deployment order is rules, selector-aware application while the selector is
  absent and legacy remains active, deployed legacy smoke verification, separately
  authorized fresh v2 capture/certification, v2 shadow verification, separately
  authorized activation, and post-activation smoke verification. Do not activate
  canonical data before the selector-aware application is deployed.
- The v2 publication capture requires the approved
  `canonical-2026-pre-election-lock-v1` policy on all 470 canonical races. Its
  Timestamp is `2026-11-03T00:00:00.000Z`; it is a product safety lock, not an
  official poll-close claim. Reviewed official poll-close research is supplemental:
  incomplete coverage is reported but does not bypass the server-enforced lock.

## Version Control Flow

- Keep validation, deployment, and feature work in separate PRs.
- Merge only from a branch with green CI.
- Use squash merge for focused PR history unless a branch intentionally contains multiple traceable commits.
- After merging to `main`, pull `origin/main` locally before creating the next work branch.

## Rollback Notes

- App rollback: redeploy the previous known-good app build or revert the deployment PR.
- Rules rollback: redeploy the previous `firestore.rules` revision from `main`.
- Data rollback: prefer forward-fix scripts for Firestore data; avoid manual console edits except for emergency admin access.

## G7/G8 certified catalog-beta contract

The G8 catalog-beta release accepts only the certified G7.1 local product bundle
and `canonical-2026-shadow-v2`. The certified contract is 470 races, 14
measures, 2,384 candidate-research documents, 14 measure-research documents,
470 metrics, one selector, and 3,353 total bundle documents. There are zero
prediction-ready federal races and 14 prediction-ready California measures.

`canonical-2026-shadow-v1` is immutable, identity-only, and nonpublishable. No
validator or runbook command may activate it. An FEC filing proves filing status;
it does not establish ballot eligibility or pick eligibility.

Run the Firebase-free validator from `C:\Projects\Politipiks`:

```powershell
npm run test-g8-release-readiness
npm run verify-g8-release-readiness
```

It accepts only `.artifacts/private/canonical-migration/g7-1-local-product-bundle.json`,
checks the exact counts, readiness, audit, v2 generation, target identity, and
digests, and emits a deterministic sanitized receipt without private paths,
credentials, or artifact contents.

## G8 catalog-beta state machine

The only valid order is:

```text
preflight → fresh bounded capture → offline certification → shadow write
→ namespace verification → rules deployment → app deployment
→ selector activation → smoke verification → observation window
```

Each stage has its own explicit authorization boundary in
`docs/g8-catalog-beta-release-manifest.json`. Authorization is never inherited
from an earlier stage. Production reads, writes, deployments, selector changes,
rollback, and deletion decisions are all separate boundaries.

Stop before any mutation on digest/count drift, unresolved references, orphan or
duplicate records, incompatible predictions, publication-readiness regression,
dirty release scope, wrong branch/commit, wrong project/database, unsafe
environment flags, partial writes, failed smoke tests, or missing rollback
evidence. Preserve unrelated dirty files while stopping.

## G8.2A product-shadow executor

G8.2A is a separate local-certification boundary for the approved G8.1
prospective bundle. It accepts only `canonical-2026-shadow-v2` and the pinned
bundle/input/evidence/plan digests. The one source selector is excluded from the
shadow write plan, leaving exactly 3,352 content documents beneath
`migrationShadows/canonical-2026-shadow-v2/`: 470 races, 14 measures, 2,384
candidate-research documents, 14 measure-research documents, and 470 metrics.
The root manifest is versioned, identity-bound, digest-bound, create-only for
content, and records bounded progress. Existing identical content can resume;
conflicting content fails before mutation. The active selector and all legacy or
v1 documents remain outside the executor's allowed path set.

The implementation and local evidence are recorded in
`docs/status/g8-2a-product-shadow-executor-readiness.md`. Offline and emulator
commands are permitted locally; future production commands must use placeholders
only until a separately authorized release stage supplies the exact target,
digests, counts, committed executor source, and authorization receipt:

```powershell
npx tsx scripts/apply-g8-2a-product-shadow.ts --apply --bundle-in <approved-bundle> --project-id <project> --database-id <database> --generation <generation> --expected-input-digest <input-digest> --expected-evidence-digest <evidence-digest> --expected-plan-digest <plan-digest> --expected-bundle-digest <bundle-digest> --expected-races <races> --expected-measures <measures> --expected-candidate-research <candidate-research> --expected-measure-research <measure-research> --expected-metrics <metrics> --expected-content-documents <content-documents> --authorization-receipt-id <authorization-receipt-id>
npx tsx scripts/apply-g8-2a-product-shadow.ts --verify-only --bundle-in <approved-bundle> --project-id <project> --database-id <database> --generation <generation> --expected-input-digest <input-digest> --expected-evidence-digest <evidence-digest> --expected-plan-digest <plan-digest> --expected-bundle-digest <bundle-digest> --expected-races <races> --expected-measures <measures> --expected-candidate-research <candidate-research> --expected-measure-research <measure-research> --expected-metrics <metrics> --expected-content-documents <content-documents> --authorization-receipt-id <authorization-receipt-id>
```

## G8 rollback paths

Rollback is separately authorized and never deletes data:

| Failure point | Action | Data effect |
| --- | --- | --- |
| Before selector activation | Stop, preserve the legacy selector, verify shadow state, and forward-fix or abandon | No selector change; no deletion |
| Selector rollback after activation | Change only `catalogActivations/canonical-2026` to the legacy generation and smoke-test | Canonical and legacy retained |
| Rules failure | Redeploy the exact previous known-good `firestore.rules` revision | No data or selector change |
| Application failure | Redeploy the exact previous known-good application build | No data or selector change |
| Partial or failed shadow write | Stop, verify exact writes, preserve them, and use an approved forward-fix/resume plan | No deletion; selector unchanged |

Manual console edits, legacy retirement, prediction migration, and destructive
cleanup are outside this runbook. Progressive prediction enablement and eventual
50-state certification are separate releases after catalog-beta observation.

## Sanitized PowerShell templates

Templates only: angle-bracket values are supplied through a separate approval
process. Never put credentials, private artifact contents, or approval tokens in
commands, logs, or receipts.

```powershell
# Local, Firebase-free readiness only
npm run verify-g8-release-readiness

# Future separately authorized boundaries
npx tsx <bounded-capture-script> --output <private-artifact>
npx tsx <offline-certification-script> --input <private-artifact> --expected-digest <digest>
npx tsx <shadow-write-script> --project-id <project> --database-id <database> --generation <generation>
npx tsx <namespace-verification-script> --project-id <project> --database-id <database> --generation <generation>
npx tsx <rules-deploy-script> --project-id <project> --database-id <database> --commit <rules-commit>
npx tsx <app-deploy-script> --project-id <project> --commit <app-commit>
npx tsx <selector-activation-script> --project-id <project> --database-id <database> --generation <generation>
npx tsx <smoke-verification-script> --project-id <project> --database-id <database>
npx tsx <rollback-script> --project-id <project> --database-id <database> --reason <receipt-id>
```

No template authorizes or executes production operations. The exact runbook and
manifest validator are recorded in
`docs/status/g7-3-release-rollback-runbook-readiness.md`.
