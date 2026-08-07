# G8.3A v2 activation and deployment readiness

Status: local/emulator implementation complete. No production Firebase or
Firestore access, production shadow verification, selector activation,
deployment, rollback, deletion, network call, branch change, or push occurred.

## Contract

The new `g8-3a-v2-activation/v1` contract is separate from the existing
`canonicalActivation` legacy/v1 executor. It deterministically maps the
verified `canonical-2026-shadow-v2` namespace to 3,352 active content paths:

- 470 races;
- 2,384 nested candidate-research documents;
- 14 ballot measures;
- 14 nested measure-research documents;
- 470 contest metrics.

Canonical measures receive explicit `catalogScope=canonical-2026-measures` and
`registryGeneration=canonical-2026-shadow-v2`. The selector state machine is
validate shadow → pending selector/manifest → bounded create-only promotion →
exact content verification → final active selector. Existing content must be
absent or exact-compatible; conflicts, missing content, digest drift, unsafe
paths, and incompatible partial state fail closed. Rollback changes only
`catalogActivations/canonical-2026` and retains legacy/v1/v2 content.

## Deterministic dry run

Command: `npm run dry-run-g8-3a-v2-activation`

Exit code: `0`. Output reported `writes: 0`, `promotedContentDocuments: 3352`,
two selector/manifest operations, total future operations `3354`, namespace
digest `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`, and
activation plan digest `e2c94f29b81012906e9d405cf8eec7d6b99376e0a2e8d2b751cd8381bccb824e`.

## Parent verification

All required commands exited `0`:

| Command | Exit |
|---|---:|
| `npm run test-g8-3a-v2-activation` | 0 |
| `npm run test-g8-3a-v2-activation-emulator` | 0 |
| `npm run test-g8-2a-product-shadow` | 0 |
| `npm run test-g8-release-readiness` | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |

The alternate emulator test proved full shadow verification, no early active
exposure, compatible resume, bounded promotion, exact verification,
activation, and selector-only rollback. The unit suite also proves conflict
rejection and deterministic plan digests.

## Nested app verification

All required commands exited `0`:

| Command | Exit |
|---|---:|
| `npm run test-contest-catalog` | 0 |
| `npm run lint` | 0 |
| `npm run lint:rules` | 0 |
| `npm run verify-firestore-league-flow` | 0 |
| `npm run verify-browser-league-flow` | 0 |
| `npm run build` | 0 |
| `npm run verify-deployment-readiness` | 0 |
| `git diff --check` | 0 |

The rules/browser coverage proves canonical measures are hidden in absent,
pending, and rollback states, selected only while active v2, and pickable only
while active v2. It also preserves unrelated non-federal content and keeps
federal races fail-closed when not eligible.

`lint:rules` retains the repository’s existing warning at `firestore.rules:32`
for an open read; it produced no errors.

## Future production sequence

The exact direct `npx tsx` apply, verify-only, and selector-only rollback
commands are documented in `docs/deployment-readiness.md`. Their target,
generation, digest, count, source-commit, and operation-specific receipt values
must be assembled from the release manifest and approved separately. Those
commands were documented but not executed.
