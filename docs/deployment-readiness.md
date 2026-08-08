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

For the static Firebase Hosting candidate, run the browser-only artifact gates
in this order after the normal source checks:

```powershell
npm run test-hosting-artifact
npm run build:hosting
npm run verify-hosting-artifact
npm run verify-hosting-emulator
npm run verify-deployment-readiness
```

`build:hosting` publishes only `hosting-dist`. The regular `npm run build`
continues to produce the local/admin Express bundle in `dist`; that bundle and
its source map are excluded from Hosting. The emulator smoke test checks the
SPA root, direct deep links, refresh fallback, and hashed asset loading.

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

Hosting readiness fails closed when emulator, test-auth, mock-contest, admin
seed, or equivalent unsafe flags are enabled, and when `hosting-dist` contains
source maps, server bundles, environment files, credentials, private artifacts,
legacy browser API routes, Gemini references, or secret-shaped assignments.

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

## G8.3A v2 activation contract

The G8.3A contract is versioned separately from the legacy canonical activation
executor. It promotes only the verified `canonical-2026-shadow-v2` namespace,
including 470 races, 2,384 nested candidate-research documents, 14 ballot
measures, 14 nested measure-research documents, and 470 contest metrics. The
selector remains absent/legacy until a pending manifest is written; canonical
documents are create-only, exact-compatible resume is allowed, and exact
content verification precedes final activation.

Future production commands must be assembled by the Firebase-free G8.4A
preflight from `docs/g8-catalog-beta-release-manifest.json`, the certified local
bundle, the historical shadow identity, and the committed activation
implementation identity. Do not manually transcribe digest or count flags.
Use direct `npx tsx` only after a separately approved production boundary.

```powershell
npm run g8-4a-activation-preflight
```

The preflight prints complete sanitized `--apply`, `--verify-only`, and
`--rollback` arrays. It proves the historical shadow source commit is distinct
from the current activation implementation commit, requires the focused
executor files to be clean at that exact current HEAD, and emits no Firebase
initialization or writes. The apply and verify commands remain a future
production sequence and were not executed for this readiness goal. Rollback changes only
`catalogActivations/canonical-2026`; it never deletes or mutates legacy, v1, or
v2 content. Absent, pending, active, and rollback selector states are mirrored
by the client catalog and Firestore pick rules: canonical measures are hidden
until active v2, become pickable only while active v2, and become unavailable
again after rollback; unrelated non-federal content remains available.

## G8.4A activation identity repair

G8.2B certifies the immutable shadow source at parent commit
`295466ccc52ccd4d6ad4f1dfb444d48410b92910`. G8.4A keeps that identity for
reconstructing and verifying `canonical-2026-shadow-v2`, while recording the
separate current commit that contains the activation executor. The selector and
active-document metadata use identity schema version `2` and retain the
`g8-3a-v2-activation/v1` contract string. A swapped, missing, stale, mismatched,
or dirty identity stops before the Firestore boundary.

The certified shadow remains 3,352 content documents and 3,354 future
operations including the two selector operations, with namespace digest
`ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`. The
offline preflight derives these values from the manifest and bundle; they are
not launch-time hand entries. No production apply, verify-only read, selector
change, rollback, deployment, deletion, network call, or nested-app mutation is
part of G8.4A.

## G8.4B production activation attempt

G8.4B completed its local gates and consumed exactly one generated production
apply invocation on 2026-08-08. The apply targeted project `politipiks`, named
database `ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a`, and
generation `canonical-2026-shadow-v2`. Its generated identity was schema `2`
with shadow source commit `295466ccc52ccd4d6ad4f1dfb444d48410b92910` and
activation implementation commit `e34e975a1994d2883e37646a42184dc9b4cd0c31`.
The certified namespace digest was
`ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`, the
activation plan digest was
`70eaec0164cc7509be5e46f25a3757bafbd7873114fae5c92a95147c9132748d`, and the
counts were 470 races, 14 measures, 2,384 candidate research, 14 measure
research, 470 metrics, and 3,352 content documents.

The direct generated apply exited `1` at `2026-08-08T12:19:34.335Z` and did not
report `status=active`. Per the fail-closed boundary, verify-only, the one live
Hosting smoke, and selector-only rollback were not run. The apply attempt is
consumed; no retry, extra production read, or follow-up operation is authorized.
The final known selector state is unknown/unverified. See the full sanitized
ledger in [G8.4B production catalog activation attempt](status/g8-4b-production-catalog-activation.md).

## G8.4BR0 post-failure state audit

G8.4BR0 added a committed, manifest-derived, read-only activation-state auditor
that validates target, generation, identities, digests, counts, source commit,
receipt, and safe environment before lazy Firebase initialization. It reads the
selector first and never writes, repairs, resumes, activates, rolls back,
deletes, or scans outside the exact 3,352 expected paths.

The one authorized production audit invocation on 2026-08-08 exited `1` without
stdout/stderr or an audit result. A local no-network reproduction of its Windows
`spawnSync("npx.cmd", ..., windowsHide: true)` launcher returned `EINVAL` before
child launch. No selector read or content scan occurred; production state is
unknown/unverified. The historical G8.4B phase remains indeterminate because its
durable record omitted the launcher error and exact phase. See
[G8.4BR0 post-failure state audit](status/g8-4br0-post-failure-state-audit.md).

The exact next authorization is a new bounded read-only audit invocation after
the launcher mechanism is corrected. Activation, resume, existing verify-only,
smoke, rollback, deployment, and deletion remain unauthorized until that audit
successfully establishes selector state.
