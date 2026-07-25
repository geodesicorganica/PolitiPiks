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
