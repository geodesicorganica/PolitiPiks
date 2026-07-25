# G1-5 verification — 2026-07-20

## Scope completed

- `firestore.rules` now requires a league-scoped, member-owned, 2026-live prediction with an open Timestamp `closeAt`; updates can change only `pick` and server `updatedAt`; deletion also requires active membership and an open target.
- League metadata edits are owner-only and limited to `name` and `inviteCode`. Member records can be created only by their owner with `points: 0`, then cannot be changed by a client. User score fields are also immutable after profile creation.
- `src/pages/Races.tsx` is browse-only. `src/pages/LeagueDetail.tsx` scopes prediction subscription and target lookup by `leagueId`, and writes that field on every new prediction. `src/pages/Leagues.tsx` now initializes membership points at zero, per approved score-ownership direction.
- `tests/firestore-league-flow.mjs` covers successful scoped create/update/delete; scoped listing; missing league, non-member, cross-league, cross-user, field-mutation, score-tampering, closed update, and closed delete denials.
- `scripts/migrate-close-at.ts` is a guarded migration command. `scripts/close-at-migration-lib.ts` contains its offline planning and guard logic, tested by `tests/close-at-migration.test.ts`.
- `docs/deadline-policy.md` selects a single league-wide UTC MVP cutoff methodology without encoding a production timestamp.

## Verification commands and results

| Command | Exit code | Result |
| --- | ---: | --- |
| `npm run lint` | 0 | TypeScript completed with no diagnostics. |
| `npm run lint:rules` | 0 | Rules lint completed. Existing warning remains for the intentionally open `/test/connection` read rule. |
| `npm run verify-close-at-migration` | 0 | Offline guard test passed, including malformed target, count, conflict, and 400-document batch-limit cases. |
| `npm run migrate-close-at` | 0 | Default dry run reported `applied: false`, made no Firestore connection, and made no write. |
| `npm run verify-firestore-league-flow` | 0 | Emulator test passed. Expected `PERMISSION_DENIED` entries correspond to asserted authorization denials. |
| `npm run verify-browser-league-flow` | 0 | Playwright passed: 2026/live default, 2024 fixture absent, and closed/missing-deadline controls disabled. |
| `npm run build` | 0 | Vite and server bundle build completed. |
| `npm run verify-deployment-readiness` | 0 | Confirmed `politipiks`, database `ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a`, and contest collections `races,ballotMeasures`. |

## Deadline policy and migration safeguards

The MVP uses one explicitly approved UTC deadline across all 2026-live league contests. It is a PolitiPiks product cutoff, not a jurisdiction’s official poll-closing time. The exact timestamp is deliberately absent until product and operations approval.

The migration defaults to a dry run. Applying requires `--apply`, canonical project/database IDs, an expected missing-`closeAt` count, and an ISO UTC deadline with milliseconds. It rejects target mismatches, malformed/non-UTC dates, count mismatches, invalid/conﬂicting existing values, and concurrent document changes. Writes are preconditioned and batched at no more than 400 documents.

## Remaining production blockers

1. Authorized product and operations owners must approve the exact UTC deadline and expected 2026-live missing-`closeAt` count.
2. An authorized operator must separately approve and run the guarded command with `--apply`; it was not run in this verification.
3. Firebase rules deployment remains a separate production action and was not performed.

## Files changed for this remediation

- `firestore.rules`
- `src/pages/Leagues.tsx`
- `src/pages/Races.tsx`
- `src/pages/LeagueDetail.tsx`
- `scripts/close-at-migration-lib.ts`
- `scripts/migrate-close-at.ts`
- `tests/firestore-league-flow.mjs`
- `tests/close-at-migration.test.ts`
- `package.json`
- `docs/deadline-policy.md`
- `docs/status/g1-5-verification.md`

No production write, migration apply, deployment, commit, push, or pull request occurred.
