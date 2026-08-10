# G8.4BR4A — Structured activation-recovery readiness

Status: **locally certified; no production authorization was created or used**.

## Scope and immutable inputs

G8.4BR4A started on branch `codex/politipiks-canonical-shadow-release` at
`46b216113a29181cfebefdb0b2935d65176370f4`. The focused implementation was
committed as `cfff2011ed72f560f531983ce4291237479fa642`.

The historical shadow identity remains
`295466ccc52ccd4d6ad4f1dfb444d48410b92910`. The existing
`g8-3a-v2-activation/v1` selector contract, legacy/v1 behavior, selector-only
rollback, and all certified bundle/content identities remain unchanged. The
certified namespace still contains exactly 3,352 content documents:

| Family | Count |
| --- | ---: |
| races | 470 |
| ballot measures | 14 |
| candidate research | 2,384 |
| measure research | 14 |
| contest metrics | 470 |
| total content | 3,352 |

Certified digests:

- input: `af8a1a8e96cafc02937d7570e5e2d1c70a8bc6462b1a60e77252eaae40cba830`
- evidence: `f022709c58fe2b5a75ad6e76dd8112e6e160323380611d66ba9db6e73f07894f`
- release plan: `15726ee867d93d9de5fcc1f52887d6302bc61c606063c90320ebc1c194f62641`
- bundle: `7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7`
- namespace: `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`
- activation plan for implementation `cfff2011...`: `9f8827ac20dd9acfdcb0c6dd7beff8df30b767b504bbbe0fb366711b0ba3ca49`

No certified content or namespace digest changed.

## Structured activation result

Apply, verify-only, and rollback now emit exactly one
`g8-4br4a-activation-result/v1` JSON document for every handled exit. The
contract contains:

- mode, status, current phase, failed phase, and a stable classified error
  code without raw messages or stacks;
- selector/content read and write counts split into planned, attempted,
  succeeded, failed, completion-unknown, and not-attempted outcomes;
- attempted/completed/failed/unknown batch accounting;
- observed, pending, and active selector state;
- exact, missing, conflicting, and unknown content counts; and
- a bounded safe next action that never authorizes an automatic retry.

Strict result parsing rejects malformed JSON, extra fields, incoherent status,
invalid counts, unbounded output, or secret-shaped fields. The exact-once
launcher starts one child and discards raw stdout/stderr after validation; a
missing or malformed result becomes a sanitized `MALFORMED_RESULT` and is
never retried.

Apply remains fail-closed in this order:

1. validate the complete certified shadow namespace;
2. read and validate the selector, then inspect only the 3,352 exact active
   paths before any write;
3. create a compatible pending selector if absent;
4. create only missing content in bounded batches and accept existing content
   only when byte-semantically compatible;
5. read all exact content paths again and require 3,352 exact; and
6. write the active selector.

Conflicting selectors or documents stop before writes and are never
overwritten. A known mid-batch failure retains the auditable pending selector;
a later separately authorized run can resume only compatible missing content.
An unknown-completion result stops for review and never authorizes a retry.

## Canonical Firebase-free preflight

The final canonical contract is `g8-4br4a-activation-preflight/v1`; its result
contract is `g8-4br4a-activation-result/v1`. Two post-commit direct preflights
both exited `0` and emitted byte-identical 17,314-byte JSON documents:

- stdout SHA-256: `b18c732c6ab06c9880950eeda06511189fad7a9b43acbac3d3fd2380df7e25e7`
- canonical semantic receipt digest: `e85147b793b07f7a3576091c482de6f8840f050d98cccf1dfb93e4297740db7e`
- Firebase initialization: false
- local reads/writes: `0/0`
- generated operation commands executed: `0`
- shell: false

All three future launchers have executable
`C:\Program Files\nodejs\node.exe`, cwd `C:\Projects\Politipiks`, argv 0
`C:\Projects\Politipiks\node_modules\tsx\dist\cli.mjs`, argv 1
`scripts/activate-g8-3a-v2.ts`, and exactly 47 ordered arguments. Argv 2 and
the resulting full-argument digest are:

| Operation | argv 2 | Arguments digest |
| --- | --- | --- |
| apply | `--apply` | `a42df98cd125c123e08c85f67328bb68a86e075e6eb93220e5fd9510b2155aa7` |
| verify-only | `--verify-only` | `2c880e496b63b1a5f57131683a9c977ece60a2db5a88c01ebd096c0694165a34` |
| rollback | `--rollback` | `3688679ff3c3271bad615e071cae7f5cb90e9cffdb18170f0b74f4c1ec10ec05` |

Argv 3 through 46 are the same ordered flag/value pairs for all modes:

```text
--bundle-in .artifacts/private/canonical-migration/g7-1-local-product-bundle.json
--manifest docs/g8-catalog-beta-release-manifest.json
--project-id politipiks
--database-id ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a
--generation canonical-2026-shadow-v2
--expected-shadow-source-commit 295466ccc52ccd4d6ad4f1dfb444d48410b92910
--expected-activation-implementation-commit cfff2011ed72f560f531983ce4291237479fa642
--expected-input-digest af8a1a8e96cafc02937d7570e5e2d1c70a8bc6462b1a60e77252eaae40cba830
--expected-evidence-digest f022709c58fe2b5a75ad6e76dd8112e6e160323380611d66ba9db6e73f07894f
--expected-plan-digest 15726ee867d93d9de5fcc1f52887d6302bc61c606063c90320ebc1c194f62641
--expected-bundle-digest 7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7
--expected-namespace-digest ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0
--expected-races 470
--expected-measures 14
--expected-candidate-research 2384
--expected-measure-research 14
--expected-metrics 470
--expected-content-documents 3352
--shadow-verification-receipt g8-4br4b-shadow-verification
--promotion-receipt g8-4br4b-content-promotion
--activation-receipt g8-4br4b-selector-activation
--rollback-receipt g8-4br4b-selector-rollback
```

These four distinct G8.4BR4B receipt identifiers are reserved future operation
labels only. They do not constitute or inherit production authorization and do
not reuse the consumed G8.4B receipts.

## Unit and emulator evidence

The focused unit matrix proved:

- absent selector to active with all 3,352 documents exact;
- compatible pending selector plus partial exact content resume;
- active verify-only success;
- conflicting selector and conflicting document rejection before writes;
- quota and permission-style content-batch failures with exact accounting;
- compatible resume after an injected failure;
- malformed result rejection and secret sanitization; and
- one launcher invocation with no retry on malformed output.

The Firestore emulator ran on alternate port `18082`. Starting from an absent
selector, an injected quota failure on the second content batch left a pending
selector, 399 successful content writes, 399 known failed attempts, 2,554
not-attempted writes, 399 exact documents, and 2,953 missing documents. The
later compatible resume wrote exactly the remaining 2,953 documents, left 399
existing compatible writes not attempted, verified all 3,352 exact, and set the
selector active. Verify-only then succeeded, and selector-only rollback retained
all v2 content plus unrelated legacy/non-federal sentinels.

## Local certification ledger

| Command | Exit |
| --- | ---: |
| `npx tsc --noEmit --pretty false` | 0 |
| `npm run test-g8-4br4a-activation-recovery` | 0 |
| `npm run test-g8-3a-v2-activation` | 0 |
| `npm run test-g8-4br4a-activation-recovery-emulator` (port 18082) | 0 |
| pre-commit `npm run test-g8-4br3a-structured-audit` (expected committed-identity stop) | 1 |
| post-commit `npm run test-g8-4br3a-structured-audit` | 0 |
| `npm run test-g8-4br1-state-audit-launcher` | 0 |
| `npm run self-test-g8-4br1-state-audit-launcher` | 0 |
| `npm run test-g8-4br2-1-preflight-receipt` | 0 |
| `npm run test-g8-4br0-state-audit` | 0 |
| `npm run g8-4br3a-offline-audit` | 0 |
| `npm run g8-4br0-state-audit-preflight` | 0 |
| `npm run test-g8-4br0-state-audit-emulator` (port 18081) | 0 |
| `npm run test-g8-2a-product-shadow` | 0 |
| `npm run test-g8-2a-product-shadow-emulator` (port 8081) | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `git diff --check` | 0 |
| final direct activation preflight 1 | 0 |
| final direct activation preflight 2 | 0 |
| byte comparison of final preflight stdout | identical |

## Focused implementation files

Commit `cfff2011ed72f560f531983ce4291237479fa642` contains only:

- `package.json`
- `scripts/activate-g8-3a-v2.ts`
- `scripts/firebase.g8-4br4a-emulator.json`
- `scripts/lib/g8V2Activation.emulator.test.ts`
- `scripts/lib/g8V2ActivationCli.ts`
- `scripts/lib/g8V2ActivationLauncher.ts` and its test
- `scripts/lib/g8V2ActivationPreflight.ts` and its test
- `scripts/lib/g8V2ActivationResult.ts` and its test
- `scripts/lib/g8V2StructuredActivationRunner.ts` and its test
- `scripts/verify-g8-4a-activation-preflight.ts`
- `scripts/verify-g8-4br4a-activation-preflight.ts`

The ten pre-existing unrelated modified/untracked paths were not staged,
deleted, or included in the commit. The certified private bundle was read-only.

## G8.4BR4B authorization boundary

G8.4BR4A performed no network operation or production Firebase/Firestore
access, selector/content read or write, activation, verify-only, rollback,
smoke, deployment, deletion, or other mutation. It performed no push or branch
change and created or executed no G8.4BR4B authorization.

Any future shadow verification, promotion/apply, verify-only, activation,
rollback, smoke, deployment, or production read/write requires fresh explicit
authorization for that exact operation. The first authorized invocation is
consumed whether it succeeds, fails, or returns unknown completion; it must not
be retried or followed by an additional production read without new
authorization.
