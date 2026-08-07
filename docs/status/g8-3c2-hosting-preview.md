# G8.3C2 guarded Hosting preview deployment

Status: **preview deployed; read-only smoke passed after local harness repair**

Verified: **2026-08-07**
Evidence time: **2026-08-07T19:47:30.259Z**

G8.3C2 authorized one Firebase Hosting preview-channel deployment for the
certified static PolitiPiks artifact, followed by one bounded unauthenticated
browser/HTTP smoke session. The deployment completed successfully. The smoke
harness failed before opening a browser because the inline Node stdin program
was evaluated as an ES module while using `require('@playwright/test')`:

`ReferenceError: require is not defined in ES module scope, you can use import instead`

Per the authorization, no smoke retry, channel deletion, live deployment,
selector activation, Firestore write, authentication, rollback, or push was
performed after that failure.

## Target and authorization

- Firebase project/site: `politipiks` / `politipiks`
- Preview channel: `g8-3c2-20260807`
- Authorization receipt: `g8.3c2-preview-deploy-2026-08-07`
- Nested source: `codex/politipiks-2026-live-contract` at
  `f96b8dcdcb87b47c6561b6c3ef8c395c8dbe5c1d` (`f96b8dc`)
- Firebase CLI: `15.24.0`
- Channel URL emitted by Firebase:
  `https://politipiks--g8-3c2-20260807-x6meubc8.web.app`
- Expiry emitted by Firebase: `2026-08-08 15:23:14` local CLI time
  (`2026-08-08T19:23:14Z` in the task timezone)

The one read-only `hosting:channel:list` check returned only the existing
`live` channel. The requested preview channel did not exist before deployment.

## Preflight evidence

The deployment config targeted only Hosting site `politipiks`, published only
`hosting-dist`, retained the exact named Firestore database
`ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a`, and had no
Functions, Cloud Run, or App Hosting target. Unsafe emulator, mock, test, and
admin environment flags were absent. The nested worktree contained only the
preserved unrelated `.env.example` modification.

| Check | Exit/result |
| --- | --- |
| `npm run test-hosting-artifact` | 0 |
| `npm run build:hosting` | 0; Vite warning only for the large JS chunk |
| `npm run verify-hosting-artifact` | 0 |
| `npm run verify-hosting-emulator` | 0; `/`, `/races`, `/leagues/demo/`, and 2 hashed assets served |
| `npm run test-contest-catalog` | 0 |
| `npm run test-canonical-evidence` | 0 |
| `npm run lint` | 0 |
| `npm run lint:rules` | 0; one known warning at `firestore.rules:32` |
| `npm run verify-deployment-readiness` | 0 |
| `git diff --check` | 0 |

The final artifact contained 3 files and 1,339,389 bytes. Its deterministic
SHA-256 was
`94416db6b4673aafe3364dfef4d63555d1ca9c06ee6b5973521822e3ae7c116b`, computed
over sorted UTF-8 relative paths (each followed by LF) plus each file's raw
bytes: `assets/index-D6-RsV51.js`, `assets/index-Yg7nECrs.css`, and
`index.html`.

## Deployment evidence

The exact authorized command was invoked once and exited `0`:

`firebase.cmd hosting:channel:deploy g8-3c2-20260807 --project politipiks --config firebase.json --expires 1d`

Firebase reported 3 files found, upload complete, version finalized, release
complete, and deploy complete. No separate release/version identifier was
printed by the CLI. The live site was not deployed or changed.

## Smoke result and boundary

One bounded smoke command was attempted against the emitted preview URL, but
the browser context was never created and no preview HTTP request was made.
Consequently root rendering, `/races` and `/leagues` direct navigation and
refresh, hashed asset responses, console initialization errors, API/runtime
server absence, authentication/write absence, and selector/catalog loading
remain **unverified**. The smoke failure is the terminal result for this
authorization; no retry or follow-up Firebase read was made.

The generated nested `.firebase` Hosting cache was removed after deployment;
the nested worktree again retains only the unrelated `.env.example` change.
Only this focused parent evidence document and the roadmap entry are in scope
for the documentation commit. No selector, live channel, Firestore document,
rules, rollback, channel deletion, merge, or push was touched.

## G8.3C2R smoke recovery

The authorized local repair added the reusable ESM Playwright harness at nested
commit `e926a20` (`test: repair hosting preview smoke harness`). The committed
self-test covers malformed arguments, unauthorized hosts, CommonJS regression,
API/runtime requests, Firestore writes, page errors, and browser lifecycle/route
coverage. The required local gates passed, including a real Hosting-emulator
browser run against `http://127.0.0.1:5000`; `hosting-dist`, Firebase config,
app source, rules, and the deployed artifact contract were unchanged. The
pre-existing nested `.env.example` modification remained unstaged.

Recovery authorization receipt: `g8.3c2r-preview-smoke-2026-08-07`.

The exact single remote invocation was:

`node scripts/hosting-preview-smoke.mjs --base-url https://politipiks--g8-3c2-20260807-x6meubc8.web.app`

Invocation UTC: **2026-08-07T19:47:05.668Z**; recorded completion UTC:
**2026-08-07T19:47:30.259Z**; exit code: **0**.

The read-only browser opened one browser/context, directly requested and
reloaded `/`, `/races`, and `/leagues`, and rendered all six page loads. Asset
responses included one hashed JavaScript file and one hashed CSS file, with 12
successful hashed-asset responses. Network summary: 6 app-document requests,
23 Firestore read/listen requests, 0 `/api/*` or Gemini/runtime-server
requests, 0 authentication requests, 0 Firestore write/commit endpoints, and
0 unexpected requests. Page errors and console errors were both 0.

The preview content remained the existing deployed commit `f96b8dc` and
artifact digest
`94416db6b4673aafe3364dfef4d63555d1ca9c06ee6b5973521822e3ae7c116b`. The
read-only smoke changed no preview content, live site, selector, Firestore
data, rules, Hosting channel, or deployment state. No retry, redeployment,
deletion, rollback, authentication, push, or additional remote read followed.
