# G8.4A — Activation identity repair and local readiness

Status: locally implemented and certified offline/emulator-only. No production
Firebase or Firestore access, production read/write, selector activation,
selector rollback, Hosting/rules deployment, deletion, network call, branch
change, push, or nested-app mutation occurred.

## Identity contract

G8.2B records the completed production shadow source identity as parent commit
`295466ccc52ccd4d6ad4f1dfb444d48410b92910`. The activation plan now carries
identity schema version `2` with separate `shadowSourceCommit` and
`activationImplementationCommit` fields. The same metadata is written into the
selector and active-document activation metadata while the contract remains
`g8-3a-v2-activation/v1`; legacy/v1 behavior is unchanged.

The focused implementation gate checks the exact current HEAD and clean state
for the activation package/script, executor, CLI, preflight builder, and
preflight entrypoint. The historical shadow commit is used only to build and
verify the certified shadow plan. Swapped, missing, stale, mismatched, or dirty
identities fail closed before the Firestore boundary.

## Firebase-free preflight

`npm run g8-4a-activation-preflight` builds complete sanitized future `--apply`,
`--verify-only`, and `--rollback` arrays from the release manifest, certified
bundle, historical shadow identity, and current activation commit. Digests and
counts are derived from validated inputs, and four operation-specific receipts
must be distinct. The command sets deliberately invalid credentials as a
negative check but does not initialize Firebase or execute any generated array.

The dry-run contract is zero-write: 3,352 content documents, 3,354 future
operations including the pending/final selector operations, and namespace
digest `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`.

## Verification record

| Command | Exit |
| --- | ---: |
| `npm run test-g8-3a-v2-activation` | 0 |
| `npm run test-g8-3a-v2-activation-emulator` | 0 |
| `npm run test-g8-2a-product-shadow` | 0 |
| `npm run test-g8-release-readiness` | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |
| `npm run g8-4a-activation-preflight` (run 1) | 0 |
| `npm run g8-4a-activation-preflight` (run 2) | 0 |

Both preflight runs produced identical arrays, recorded the exact current
activation implementation commit, reported `writes: 0`, and proved
`firebaseInitialization: false`. No production command is included or implied.
