# G8.3C3 — Production Hosting deployment and live smoke

Status: **completed with one authorized live Hosting deployment and one
read-only live smoke on 2026-08-07**

Evidence recorded: **2026-08-07 America/New_York; operation timestamps are UTC**

G8.3C3 preserved the existing Firebase Hosting live release in a named
rollback channel, deployed the exact preview-certified static artifact to the
`politipiks` live channel once, and ran the committed browser smoke once before
any selector activation. The live smoke passed, so conditional rollback did
not run.

## Target and certified inputs

- Firebase project/site: `politipiks` / `politipiks`
- Live URL: `https://politipiks.web.app`
- Deployment source: nested branch `codex/politipiks-2026-live-contract`
- Deployed app source commit: `f96b8dc`
- Prior preview evidence: parent commit `6384b2e`
- Base smoke harness commit: `e926a20`
- Live-target harness commit: `4135ebb`
- Artifact: 3 files, 1,339,389 bytes
- Artifact SHA-256: `94416db6b4673aafe3364dfef4d63555d1ca9c06ee6b5973521822e3ae7c116b`
- Artifact files: `assets/index-D6-RsV51.js`, `assets/index-Yg7nECrs.css`,
  `index.html`
- Firebase CLI: `15.24.0`
- Deployment authorization receipt: `g8.3c3-live-hosting-2026-08-07`
- Rollback authorization receipt: `g8.3c3-conditional-rollback-20260807`
- Rollback channel: `g8-3c3-rollback-20260807`
- Emitted rollback URL:
  `https://politipiks--g8-3c3-rollback-20260807-dfype3dr.web.app`

The nested worktree started on the required branch with `f96b8dc` and
`e926a20` present. The focused live-target harness change was committed as
`4135ebb`; only the pre-existing unrelated `.env.example` remained dirty. The
parent repository's unrelated dirty files were preserved and not staged.

## Local gates

The first emulator invocation encountered transient Firestore network/console
noise and exited `1` before any remote operation. A diagnostic run showed the
same static routes and assets; the required emulator gate was then rerun and
passed before remote work began. No production command was retried.

| Check | Final exit/result |
| --- | --- |
| `npm run test-hosting-preview-smoke` | 0; live mode requires exact host plus `--live-target` |
| `npm run build:hosting` | 0; certified hashed JS/CSS output |
| `npm run verify-hosting-artifact` | 0 |
| `npm run verify-hosting-emulator` | 0 on final required run; 3 routes rendered/reloaded, 12 hashed assets, 22 Firestore reads, 0 forbidden/unexpected traffic or errors |
| `npm run lint` | 0 |
| `npm run lint:rules` | 0; existing open-read warning only |
| `npm run verify-deployment-readiness` | 0 |
| `git diff --check` | 0 |

The final offline guards recomputed exactly 3 files, 1,339,389 bytes, and the
certified digest. `firebase.json` contained exactly one Hosting entry for site
`politipiks` publishing only `hosting-dist`; unsafe emulator, mock, test, and
admin flags were absent. App source, rules, `firebase.json`, and hosted output
were unchanged by the harness-only commit.

## Authorized remote ledger

Each remote operation below was invoked once, in order, with no retry or
follow-up read:

| UTC time | Operation and exact command | Exit/result |
| --- | --- | --- |
| `2026-08-08T03:55:39.8057422Z`–`03:55:43.9615574Z` | `firebase.cmd hosting:channel:list --project politipiks` | 0; live present, rollback channel absent |
| `2026-08-08T03:55:50.8223047Z`–`03:55:57.6979499Z` | `firebase.cmd hosting:clone politipiks:live politipiks:g8-3c3-rollback-20260807 --project politipiks` | 0; rollback channel created and URL emitted |
| `2026-08-08T03:56:07.5708475Z`–`03:56:07.9685468Z` | HTTP GET to emitted rollback URL | HTTP 200; 422-byte response |
| `2026-08-08T03:56:13.2261021Z`–`03:56:30.4120243Z` | `firebase.cmd deploy --only hosting --project politipiks --config firebase.json --message "G8.3C3 static catalog beta f96b8dc 94416db6"` | 0; 3 files found, upload/finalize/release complete; Hosting URL confirmed |
| `2026-08-08T03:56:37.6716000Z`–`03:56:42.3782125Z` | `node scripts/hosting-preview-smoke.mjs --base-url https://politipiks.web.app --live-target` | 0; passed |

Firebase reported deploy completion and the live URL but emitted no separate
version or release identifier in the CLI output. No additional remote read was
authorized to discover one; the durable deployment receipt is
`g8.3c3-live-hosting-2026-08-07`.

## Live smoke result

The smoke used one browser, one context, and one page. `/`, `/races`, and
`/leagues` each rendered directly and survived reload. Twelve hashed asset
responses succeeded, including JavaScript and CSS. The network summary was:

| Category | Count |
| --- | ---: |
| App documents | 6 |
| Hashed assets | 12 |
| Firestore reads/listens | 26 |
| `/api`, Gemini, runtime-server | 0 |
| Authentication | 0 |
| Firestore writes | 0 |
| Unexpected requests | 0 |
| Console/page/navigation errors | 0 / 0 / 0 |

The unchanged legacy/absent selector initialized without a write. No clicks,
sign-in, league submission, selector activation, Firestore write, rules
deployment, channel deletion, merge, push, or rollback occurred.

## Boundary and next gate

Conditional rollback was **not run** because the live deploy succeeded and the
live smoke passed. The rollback channel remains the preserved recovery copy.
Selector activation is a separate authorized operation and was not performed.
The next dependency-first gate is an independently authorized selector
activation/production catalog verification, with this live Hosting receipt as
its static-app prerequisite.
