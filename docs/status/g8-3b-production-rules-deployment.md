# G8.3B production Firestore rules deployment

Status: **completed with one authorized production rules deployment on 2026-08-06** (America/New_York). The deployment record was captured at `2026-08-07T03:08:42.5808569Z`.

This record covers only the separately authorized Firestore rules control-plane
operation. No Firestore document read or write, selector activation, app
deployment, hosting deployment, functions deployment, storage deployment,
rollback, deletion, retry, or push was performed.

## Authorization and source identity

- Authorization receipt: `g8.3b-rules-deploy-2026-08-06`
- Firebase project: `politipiks`
- Firestore database: `ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a`
- Nested branch: `codex/politipiks-2026-live-contract`
- Deployed nested commit: `8bbc4bb611dd5826b446ca672c97a98a79a1694d`
- Requested commit containment: `8bbc4bb` was an ancestor of HEAD
- Unrelated worktree change preserved: nested `.env.example`

## Preflight evidence

The deployment-scope files were tracked and clean before launch:
`firebase.json`, `firebase-applet-config.json`, and `firestore.rules`.

`firebase.json` contained one Firestore deployment entry only:

```json
{
  "database": "ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a",
  "rules": "firestore.rules"
}
```

It contained no indexes and no other deployable resource configuration.
`firebase-applet-config.json` targeted project `politipiks` and the same exact
Firestore database. The production-unsafe emulator, test, mock, and admin-seed
flags check passed.

| Local gate | Exit |
| --- | ---: |
| `npm run verify-deployment-readiness` | 0 |
| `npm run lint:rules` | 0 |
| `npm run lint` | 0 |
| `npm run verify-firestore-league-flow` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |

`lint:rules` retained the documented existing warning at
`firestore.rules:32` for an open read; it produced zero errors. The emulator
flow used the demo project and its permission-denied traces were expected
rule assertions, not production access.

## Rules digest and rollback evidence

- Deployed `firestore.rules` SHA-256: `30d1dade24f9a96e27e963d27af6b4077731f7dbf83d13200e7f2da35812a4c4`
- Deployed rules file size: `12,878` bytes
- Prior known-good rules commit: `8a77a316eabb4f1f6bd1dfae8b790942c57f7d97`
- Prior known-good commit subject: `feat: complete local league pick workflow`
- Prior known-good `firestore.rules` SHA-256: `22a3077908fa4630fea016c31003913a72bcb02b66ad4889c92bcb4da61dd13b`
- Prior rules revision was recorded for rollback evidence only and was not deployed.

## Deployment receipt

Firebase CLI version: `15.24.0`

Sanitized command, executed directly from the nested repository exactly once:

```powershell
.\node_modules\.bin\firebase.cmd deploy --only firestore --project politipiks --config firebase.json --message "G8.3B selector-aware rules 8bbc4bb"
```

- Exact exit code: `0`
- Firebase identified project: `politipiks`
- Firebase compiled and uploaded `firestore.rules` and reported the rules
  release to `cloud.firestore`.
- Ruleset/release identifier: none emitted by the CLI output beyond the
  `firestore.rules` release label.
- No additional remote verification call was made to recover receipt fields.

The `--only firestore` invocation used the configured named-database rules
target. Firebase did not deploy app, hosting, functions, or storage resources;
no selector or Firestore document mutation was part of this operation.

The next G8 stages remain separately authorized and were not performed.
