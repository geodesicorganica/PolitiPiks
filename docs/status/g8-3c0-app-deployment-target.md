# G8.3C0 production application deployment target discovery

Status: **blocked — a Firebase Hosting site candidate was identified, but the
exact serving application, live version, and rollback identity were not
certified by the bounded read-only commands.**

Date: 2026-08-07 (America/New_York)

This was a read-only control-plane discovery. No target, backend, channel,
service, rollout, build, secret, branch, remote ref, application deployment,
rollback, Firebase/Firestore document operation, or push was performed.

## Result

The only plausible inventory result was Firebase Hosting site `politipiks`,
whose default URL is `https://politipiks.web.app`. The Firebase Hosting site
listing is inventory evidence, not a release/version receipt: it did not
expose the currently served version, commit, previous version, repository
connection, application root, region, or backend. Therefore the current
production URL is **not proven**; `https://politipiks.web.app` is the sole
candidate URL returned by the bounded discovery.

The App Hosting backend inventory could not be read because the project is not
on the Blaze plan and the required App Hosting API could not be enabled. No
App Hosting backend identity or region is known. A Cloud Run listing was not
run: the Firebase Hosting inventory did identify a plausible serving site and
`gcloud` was not installed or available on PATH.

## Bounded command ledger

The Firebase CLI was invoked directly from the locally installed nested binary
`node_modules\\.bin\\firebase.cmd`, version `15.24.0`. Output below is
sanitized to identifiers and control-plane conclusions; no credential data was
opened.

### 1. App Hosting backend inventory

```powershell
firebase apphosting:backends:list --project politipiks
```

- Exit code: `1`
- Summary: Firebase rejected the read before returning backend rows because
  project `politipiks` must be on the Blaze plan; API
  `firebaseapphosting.googleapis.com` could not be enabled until upgrade.
- No backend ID, region, repository, application root, branch, rollout, or
  version was returned.

### 2. Firebase Hosting site inventory

```powershell
firebase hosting:sites:list --project politipiks
```

- Exit code: `0`
- Summary: exactly one site row was returned:
  `siteId=politipiks`, `defaultUrl=https://politipiks.web.app`, and no App ID.
- No release/version/commit, previous version, repository, root, region, or
  channel release was returned.

### 3. Remote Git reachability

```powershell
git ls-remote origin
```

- Exit code: `0`
- Summary: origin is
  `https://github.com/geodesicorganica/PolitiPiks.git`; remote `HEAD` and
  `refs/heads/main` resolve to `88fe9121a3b3e4ad5a50776aed7f96e4519463ec`.
  Neither commit `8bbc4bb611dd5826b446ca672c97a98a79a1694d` nor
  `refs/heads/codex/politipiks-2026-live-contract` was present in the returned
  refs. The selector-aware commit is therefore **not remotely reachable** by
  its commit or its active branch.

The separately authorized App Hosting backend `get` was not run because the
backend list returned no backend. The Cloud Run listing was not run because
the Firebase Hosting inventory returned a plausible site and no installed
`gcloud` was available. No additional remote command is authorized by G8.3C0.

## Local identity and compatibility evidence

| Field | Evidence | Result |
| --- | --- | --- |
| Active app root | `C:\Projects\Politipiks\politipick\.remote-source` | Confirmed local root |
| Local origin | `https://github.com/geodesicorganica/PolitiPiks.git` | Confirmed; no upstream for active branch |
| Local branch/commit | `codex/politipiks-2026-live-contract` / `8bbc4bb611dd5826b446ca672c97a98a79a1694d` | Confirmed locally; not remotely reachable |
| Dirty worktree | `.env.example` only | Preserved; not staged |
| Firebase config | `firebase.json` has Firestore rules and emulator entries only | No Hosting/App Hosting target |
| App build | `npm run build`: Vite frontend plus bundled `dist/server.cjs`; `npm start`: Node server | Requires a Node-capable runtime for Express APIs |
| Production server shape | `server.ts` listens on `0.0.0.0`, serves `dist` in production, and exposes `/api/*` routes | Plain static Hosting alone is not sufficient for the full app |
| Target platform | Firebase Hosting site inventory only | Candidate, not certified as the serving application |
| Site/backend/service ID | `politipiks` site; no backend/service ID returned | Backend/service identity unknown |
| Region | Not exposed for Hosting; no App Hosting/Cloud Run row | Unknown |
| Live branch/repository connection | No control-plane metadata returned; remote active branch absent | Unknown; no connected deployment branch proven |
| Current production rollout/version/commit | Not exposed by the bounded commands | Missing required identity |
| Previous production version/commit | Not exposed by the bounded commands | Missing rollback identity; stop condition |

The local Vite/Express build is compatible with App Hosting or Cloud Run only
if a Node runtime target is identified and configured. A Firebase Hosting site
can serve the Vite static output, but this repository has no Hosting config and
the Express API runtime would still need a separately evidenced backend and
routing arrangement. No build was run during this discovery.

## Publication and rollback

No publication mechanism is proven. The candidate Firebase Hosting mechanism
would be a direct Hosting deploy after an approved Hosting configuration is
added to `firebase.json`:

```powershell
firebase deploy --only hosting:politipiks --project politipiks --config firebase.json
```

This command is **not authorized and was not run**. It is not actionable from
the current checkout because `firebase.json` has no Hosting target and the
full app also requires a Node-capable API runtime. A repository-connected
deployment would additionally require a separately authorized push/merge, but
no such connection was evidenced and the active branch is absent remotely.

If Firebase Hosting is later certified and a prior live version ID is
identified, the exact proposed rollback command is:

```powershell
firebase hosting:clone politipiks@<prior-version-id> politipiks:live --project politipiks
```

This command is also **not authorized and was not run**. `<prior-version-id>`
is intentionally unresolved: there is no certified rollback target in this
evidence.

## Stop condition and exact next authorization

G8.3C0 stops because the bounded commands did not expose both a current live
version and a previous rollback version, and the only returned Hosting site
cannot be shown to serve the Express application. Do not deploy, add Hosting
configuration, push, merge, create a backend/channel/service, or attempt a
rollback under this result.

The next separately authorized goal must authorize a fresh, read-only
control-plane query for site `politipiks` that returns its live release/version
and a usable previous release/version, and identifies any backend or rewrite
serving the Express API. If those identities are not both returned, stop again
without deployment. A separate authorization is required to decide and
implement the Node-runtime target, Hosting configuration, publication command,
and rollback procedure.
