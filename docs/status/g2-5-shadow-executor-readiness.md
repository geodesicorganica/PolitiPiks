# G2.5 canonical shadow executor readiness

Status: local release candidate committed and verified. This executor has no cutover,
alias-retirement, prediction-migration, active-collection write, or deletion
behavior.

## Architecture

`scripts/apply-canonical-shadow.ts` defaults to a credential-free offline
dry-run. It validates an ignored schema-v2 snapshot, replays the canonical plan,
and builds a fixed document plan. Firestore bootstrap is dynamically imported
only for `--apply` and `--verify-only`.

The only writable namespace is:

```text
migrationShadows/canonical-2026-shadow-v1
  /races/{canonicalRaceId}
    /candidateResearch/{canonicalCandidateId}
  /contestMetrics/{canonicalRaceId}
```

The generation root records schema/generation, running/completed status, target
project/database, input/mapping/plan digests, expected and actual counts, source
commit, start/completion time, and bounded batch progress. Each batch has at
most 400 operations.

## Certified plan boundary

- Project/database: `politipiks` /
  `ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a`
- Generation: `canonical-2026-shadow-v1`
- Expected documents: `470` races, `537` candidate-research documents, and
  `35` contest-metric documents.
- `inputDigest`:
  `d37f86d5dfdb168a1e98b190b61b00f0def1303175cafedfa578403f07e604eb`
- `mappingDigest`:
  `7650db763671b6951c4650b816c31e67e8cafb9594ac651c9f25cbd41dc2861a`
- `planDigest`:
  `79e6d71411c675f01508618cbb138551d4c9f4f7cf9508f2d66d62d780dad7b0`

The executor hard-codes this triplet and counts, then independently recomputes
the report. A caller cannot substitute new expected values. Snapshot input must
be an ignored `.json` file below `.artifacts/private/canonical-migration/`.

## Safeguards

- `--apply` requires every project, database, generation, digest, count, and
  private-snapshot guard. `--verify-only` requires the same target guards but
  never writes.
- The planned paths are statically restricted to the generation namespace;
  client collections and legacy documents cannot be selected as targets.
- A production operation refuses an uncommitted executor implementation.
- Existing matching documents are skipped. Differing root metadata or document
  content fails before writes; a compatible `running` root resumes only the
  missing documents.
- Timestamp tags are decoded in the Firestore write adapter only. A tag with
  precision Firestore cannot persist exactly is rejected before any batch.
- `--verify-only` enumerates the completed generation, checks exact content and
  count, and returns a deterministic namespace hash without writing.

## Commands and evidence

```powershell
npx tsx scripts/apply-canonical-shadow.ts --snapshot-in <private-snapshot>
npx tsx scripts/apply-canonical-shadow.ts --apply --snapshot-in <private-snapshot> <all-required-guards>
npx tsx scripts/apply-canonical-shadow.ts --verify-only --snapshot-in <private-snapshot> <all-required-guards>
```

On this Windows PowerShell workstation, do **not** invoke production apply or
verification through `npm run`: its wrapper can strip named `--flag` arguments
and pass their values positionally. Direct `npx tsx` preserves the guards. The
package script remains suitable only for the simple local dry-run shown in the
test evidence below.

The following final verification commands exited `0`:

```powershell
npm run test-canonical-federal-registry
npm run test-canonical-shadow-migration
npm run verify-contests-logic
npm run test-free-sources
npm run lint
npm --prefix ingest run build
npm run build
npm run test-canonical-shadow-executor
npm run test-canonical-shadow-executor-emulator
npm run apply-canonical-shadow -- --snapshot-in .artifacts/private/canonical-migration/approved.json
```

The final command reports `operation=dry-run`, `applied=false`, `writes=0`,
and the certified 470/537/35 plan. The implementation commit hash and final
branch status are recorded below after Git creates the release commit.

## Release record

- Implementation commit: `d1d3cb5` (`feat: prepare canonical 2026 shadow migration`).
- Branch: `codex/politipiks-canonical-shadow-release`.
- Final release scope is committed. Unrelated pre-existing work remains unstaged:
  `.env.example`, `ingest/package-lock.json`, the research-drawer/data-platform
  UI files, and `scripts/prune-invalid-federal-races.ts`.
- No private snapshot, credential, service-account, generated artifact, or
  production data is tracked by this release candidate.

## Remaining production gates

No production operation is authorized by this release candidate. Before a
separately approved apply, require a fresh authorized private capture whose
input and plan digests match this certification, a committed clean executor
scope, all explicit `--apply` guards, an operator-approved write window, and a
successful `--verify-only` after the shadow write. Shadow data remains isolated;
cutover and legacy retirement require separate approval.
