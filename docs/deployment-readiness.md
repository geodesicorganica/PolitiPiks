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

## Version Control Flow

- Keep validation, deployment, and feature work in separate PRs.
- Merge only from a branch with green CI.
- Use squash merge for focused PR history unless a branch intentionally contains multiple traceable commits.
- After merging to `main`, pull `origin/main` locally before creating the next work branch.

## Rollback Notes

- App rollback: redeploy the previous known-good app build or revert the deployment PR.
- Rules rollback: redeploy the previous `firestore.rules` revision from `main`.
- Data rollback: prefer forward-fix scripts for Firestore data; avoid manual console edits except for emergency admin access.
