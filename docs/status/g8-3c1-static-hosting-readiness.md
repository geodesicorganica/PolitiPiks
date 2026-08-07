# G8.3C1 static Hosting readiness

Status: **locally certified; not deployed**

Verified: **2026-08-07**

The selector-aware app is now locally certifiable as a static Firebase Hosting
site candidate without a browser dependency on the legacy Express/Gemini API.
The implementation is in the nested repository at `politipick/.remote-source`:

- `c63596e` — removed browser-triggered global refresh, Gemini enrichment, and
  candidate-vote API fetching; added Firestore/unavailable evidence states,
  static Hosting configuration, artifact inspection, and emulator smoke tests.
- `f96b8dc` — isolated the Hosting output at `hosting-dist` so the regular
  server build cannot delete it, and expanded fail-closed unsafe-flag checks.

## Implemented contract

- League and candidate surfaces read certified catalog/research from Firestore;
  official refreshes are explicitly pipeline-controlled and browser controls
  are absent.
- Vite no longer defines or bundles `GEMINI_API_KEY`; the Hosting artifact is
  scanned for API routes, server bundles, source maps, environment files,
  credentials, private artifacts, emulator/test/admin flags, private-key
  material, and secret-shaped assignments.
- `npm run build:hosting` produces only browser assets in `hosting-dist`.
  `npm run build` remains the local/admin Vite plus Express bundle and is not
  the Hosting public directory.
- `firebase.json` names Hosting site `politipiks`, preserves the existing
  named-database Firestore rules target, provides the SPA fallback, immutable
  hashed-asset caching, and no-cache `index.html` behavior.

## Verification evidence

All commands below exited `0` unless noted. No production Firebase read/write,
Hosting deployment, selector change, rules deployment, network call, push, or
branch operation was performed for G8.3C1.

| Check | Result |
| --- | --- |
| `npm run test-hosting-artifact` | 0; safe fixture passes and Gemini-key fixture fails closed |
| `npm run build:hosting` | 0; `hosting-dist/index.html` plus hashed JS/CSS only |
| `npm run verify-hosting-artifact` | 0; artifact contains no excluded or sensitive material |
| `npm run verify-hosting-emulator` | 0; Hosting emulator served `/`, `/races`, `/leagues/demo/`, and two hashed assets |
| `npm run test-contest-catalog` | 0 |
| `npm run test-canonical-evidence` | 0 |
| `npm run lint` | 0 |
| `npm run lint:rules` | 0; one known warning remains at `firestore.rules:32` |
| `npm run verify-firestore-league-flow` | 0; emulator league/prediction boundary test passed |
| `npm run verify-browser-league-flow` | 0; 2 browser tests passed |
| `npm run verify-deployment-readiness` | 0 |
| `npm run build` | 0; local/admin `dist/server.cjs` bundle produced |
| `git diff --check` | 0 |

The browser workflow still covers the certified 470-race/14-measure contract:
federal races remain visible but unavailable without official allowlists, and
selector-gated California measures remain pickable under active v2 fixtures.

## Boundaries and follow-up

This is a local readiness result, not a Hosting release. Production Hosting,
App Hosting, Cloud Run, selector, rules, rollback, billing, API enablement,
deletion, merge, and push remain separately authorized operations. The existing
dirty `.env.example` and unrelated parent worktree changes were preserved.
