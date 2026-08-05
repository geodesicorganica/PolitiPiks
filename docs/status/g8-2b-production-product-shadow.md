# G8.2B — Production product-shadow write and verification

Status: **completed on 2026-08-05**.

This record covers the one authorized v2 shadow apply and the one authorized
read-only verification. No selector activation, active-collection write,
legacy/v1 write, deployment, rollback, deletion, nested-app change, push, or
branch change was performed.

## Prior failed attempt

The recorded prior G8.2B apply failure was caused by one manually mistyped
digest. Its guard failed before the executor dynamically imported Firebase or
Firestore. It performed no Firestore initialization, production read, write,
or mutation. That recorded result was not reconfirmed against Firestore.

## Preflight

- Parent HEAD was exactly `295466ccc52ccd4d6ad4f1dfb444d48410b92910`.
- Unrelated dirty files were preserved; the executor source paths were clean
  and committed. The only bundle input was
  `.artifacts/private/canonical-migration/g7-1-local-product-bundle.json`.
- Credential presence was checked without printing credential values. The
  `.env.local` service-account reference resolved to an existing file. Emulator
  and unsafe test flags were disabled.
- The manifest release object was loaded programmatically and cross-checked
  against the certified bundle and the Firebase-free dry-run. The dry-run was
  the direct command:

```powershell
npx tsx scripts/apply-g8-2a-product-shadow.ts --bundle-in .artifacts/private/canonical-migration/g7-1-local-product-bundle.json
```

Dry-run exit: `0`; writes: `0`; content documents: `3,352`; operations
including the root manifest: `3,353`; bounded batches: `10`; namespace digest:
`ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`.

The production argument vector was constructed from the manifest release
object after these comparisons; no digest, target, generation, or count was
manually transcribed into the launch array.

## Corrected apply

Authorization receipt: `g8.2br-write-2026-08-05`.

```powershell
npx tsx scripts/apply-g8-2a-product-shadow.ts --apply --bundle-in .artifacts/private/canonical-migration/g7-1-local-product-bundle.json --project-id politipiks --database-id ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a --generation canonical-2026-shadow-v2 --expected-input-digest af8a1a8e96cafc02937d7570e5e2d1c70a8bc6462b1a60e77252eaae40cba830 --expected-evidence-digest f022709c58fe2b5a75ad6e76dd8112e6e160323380611d66ba9db6e73f07894f --expected-plan-digest 15726ee867d93d9de5fcc1f52887d6302bc61c606063c90320ebc1c194f62641 --expected-bundle-digest 7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7 --expected-races 470 --expected-measures 14 --expected-candidate-research 2384 --expected-measure-research 14 --expected-metrics 470 --expected-content-documents 3352 --authorization-receipt-id g8.2br-write-2026-08-05
```

Apply exit: `0`.

- `applied=true`, `resumed=false`, `status=completed`.
- Batches: `10` (nine content batches plus final root completion).
- Content writes: `3,352` create-only documents.
- Root-manifest progress/completion operations: `10`.
- Bounded prewrite conflict reads: one root read plus `3,352` content reads.
- Targets were limited to `migrationShadows/canonical-2026-shadow-v2`; no
  selector, active-root, legacy, or v1 target was permitted by the executor.

## Corrected verification

Authorization receipt: `g8.2br-verify-2026-08-05`.

```powershell
npx tsx scripts/apply-g8-2a-product-shadow.ts --verify-only --bundle-in .artifacts/private/canonical-migration/g7-1-local-product-bundle.json --project-id politipiks --database-id ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a --generation canonical-2026-shadow-v2 --expected-input-digest af8a1a8e96cafc02937d7570e5e2d1c70a8bc6462b1a60e77252eaae40cba830 --expected-evidence-digest f022709c58fe2b5a75ad6e76dd8112e6e160323380611d66ba9db6e73f07894f --expected-plan-digest 15726ee867d93d9de5fcc1f52887d6302bc61c606063c90320ebc1c194f62641 --expected-bundle-digest 7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7 --expected-races 470 --expected-measures 14 --expected-candidate-research 2384 --expected-measure-research 14 --expected-metrics 470 --expected-content-documents 3352 --authorization-receipt-id g8.2br-verify-2026-08-05
```

Verification exit: `0`.

- `verified=true` and root status was `completed`.
- Exact counts: races `470`; measures `14`; candidate research `2,384`;
  measure research `14`; metrics `470`; content documents `3,352`;
  total bundle documents `3,353`; selectors excluded `1`.
- Content, recorded namespace, and expected namespace digests were all
  `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`.
- Verification listed only the v2 shadow namespace and compared every expected
  path and value. No active, selector, legacy, or v1 namespace read was made.
- Apply and verification emitted no warnings. The only local preflight warning
  was a corrected PowerShell slash-normalization assertion before production;
  it caused no production invocation.

## Final Git state

Before the focused documentation commit, unrelated existing changes remained
untouched: `.env.example`, `docs/ROADMAP.md`, `ingest/package-lock.json`,
`src/components/ResearchDrawer.tsx`, `src/lib/dataPlatform.ts`,
`src/lib/researchBundle.ts`, and the pre-existing untracked files
`docs/status/g2-6-production-shadow-copy.md`,
`docs/status/g3-3-live-publication-certification.md`,
`docs/status/g3-canonical-cutover-readiness.md`, and
`scripts/prune-invalid-federal-races.ts`.

The focused commit contains only this evidence record and the 50-state roadmap
status update.
