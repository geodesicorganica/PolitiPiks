# G8.2A — Product-shadow executor readiness

Status: **locally certified; no production operation performed**.

G8.2A adds a separate, versioned executor for the already approved G8.1
prospective bundle. It does not recapture evidence, rebuild upstream inputs,
modify the approved snapshot, reinterpret the immutable v1 executor, touch the
nested app, or change the active selector.

## Certified input and write boundary

The executor accepts only the approved private artifact
`.artifacts/private/canonical-migration/g7-1-local-product-bundle.json` with:

- generation `canonical-2026-shadow-v2`;
- input digest `af8a1a8e96cafc02937d7570e5e2d1c70a8bc6462b1a60e77252eaae40cba830`;
- evidence digest `f022709c58fe2b5a75ad6e76dd8112e6e160323380611d66ba9db6e73f07894f`;
- plan digest `15726ee867d93d9de5fcc1f52887d6302bc61c606063c90320ebc1c194f62641`;
- bundle digest `7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7`.

The source selector `catalogActivations/canonical-2026` is validated as the
one approved bundle selector and then excluded. The plan therefore contains
exactly 3,352 content documents:

| Family | Documents |
| --- | ---: |
| Races | 470 |
| Ballot measures | 14 |
| Candidate research | 2,384 |
| Measure research | 14 |
| Contest metrics | 470 |
| Shadow content total | 3,352 |

Every target is beneath
`migrationShadows/canonical-2026-shadow-v2/`. No active root, legacy/v1
document, selector, deletion, or overwrite is an allowed target. The root
manifest is `migrationShadows/canonical-2026-shadow-v2` and records project and
database identity, source commit, all certified digests, exact counts, the
deterministic namespace digest, status, and bounded batch progress.

Content writes use Firestore `create` semantics. Existing identical content
may resume; conflicting content fails before the first write. Each batch holds
at most 399 content documents plus one root-manifest operation, for 400 maximum
operations. Timestamp tags are decoded only in the Firestore adapter and
sub-microsecond precision is rejected.

## Offline evidence

The Firebase-free dry-run command was:

```powershell
npx tsx scripts/apply-g8-2a-product-shadow.ts --bundle-in .artifacts/private/canonical-migration/g7-1-local-product-bundle.json
```

It exited `0`, initialized no Firebase/Firestore service, performed `0`
writes, planned 3,352 content documents and 3,353 operations including the
root manifest, and reported 10 bounded batches. Its deterministic content
namespace digest was:

`ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`

Production `--apply` and `--verify-only` paths require the exact target,
generation, four certified digests, all certified counts, an explicit
authorization receipt ID, and a clean committed v2 executor source. Firestore
is dynamically imported only after these offline guards pass. No production
credentials, network request, production initialization, production namespace
verification, or production mutation was attempted for G8.2A.

## Verification coverage

The focused unit suite covers v1/stale/tampered input, selector exclusion,
active/path-traversal and duplicate paths, timestamp precision loss, exact
3,352-document planning, bounded batches, compatible resume, completed no-op,
conflicting content before mutation, missing/extra/changed namespace content,
wrong target, dirty source, missing authorization, and untouched active and
selector sentinels. The emulator suite uses the existing alternate emulator
configuration to prove resume, exact verification, no-op, timestamp-boundary
behavior, and active/selector non-mutation.

The required local gates exited `0`: `npm run test-g8-2a-product-shadow`,
`npm run test-g8-2a-product-shadow-emulator`, `npm run test-local-product-bundle`,
`npm run test-g8-release-readiness`, both runs of
`npm run verify-g8-release-readiness`, `npm run test-canonical-shadow-executor`,
`npm run test-canonical-shadow-executor-emulator`,
`npm run test-canonical-activation`, `npm run lint`,
`npm --prefix ingest run build`, `npm run build`, and `git diff --check`.
The two G8 readiness receipts were identical with digest
`0a370499fc7366ef5adcd87068b941aff40f73e3de3ebebf53fbfd9ab470173c`.
Emulator warnings were limited to the existing demo-project, multiple-database,
missing-rules-file, shutdown, and metadata lookup warnings; they did not change
the successful exits.

Sanitized future commands remain placeholders only:

```powershell
npx tsx scripts/apply-g8-2a-product-shadow.ts --apply --bundle-in <approved-bundle> --project-id <project> --database-id <database> --generation <generation> --expected-input-digest <input-digest> --expected-evidence-digest <evidence-digest> --expected-plan-digest <plan-digest> --expected-bundle-digest <bundle-digest> --expected-races <races> --expected-measures <measures> --expected-candidate-research <candidate-research> --expected-measure-research <measure-research> --expected-metrics <metrics> --expected-content-documents <content-documents> --authorization-receipt-id <authorization-receipt-id>
npx tsx scripts/apply-g8-2a-product-shadow.ts --verify-only --bundle-in <approved-bundle> --project-id <project> --database-id <database> --generation <generation> --expected-input-digest <input-digest> --expected-evidence-digest <evidence-digest> --expected-plan-digest <plan-digest> --expected-bundle-digest <bundle-digest> --expected-races <races> --expected-measures <measures> --expected-candidate-research <candidate-research> --expected-measure-research <measure-research> --expected-metrics <metrics> --expected-content-documents <content-documents> --authorization-receipt-id <authorization-receipt-id>
```
