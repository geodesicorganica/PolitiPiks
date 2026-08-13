# G8.4BR6CR — Final identity resolution recovery

Status: **locally certified on 2026-08-13; final plan is ready for an executor
but no executor is authorized or implemented by this batch**. No
production Firebase/Firestore read or write, external-network request,
disposition execution, selector action, activation, deployment, rollback,
smoke, deletion, push, branch change, or nested-app edit occurred.

## Starting boundary and immutable inputs

| Field | Required and observed value |
| --- | --- |
| Branch | `codex/politipiks-canonical-shadow-release` |
| Starting HEAD | `724b4e76eda2ef56057b3d68c3ccf938bfdd5351` |
| Failed BR6C receipt | 635 bytes; SHA-256 `165e87b4c6e395ca0d1691af559c39a9e321a7e213a1a91962fc28095c08fb1d` |
| Immutable BR5B snapshot | 35,148,779 bytes; SHA-256 `425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3` |
| Certified BR6B private plan | 81,061,814 bytes; SHA-256 `1f0b71444b2958ab012a03fde3b74f8603df4035f843a2363361d584a7b6752e` |
| G2.1 override artifact | 2,137 bytes; SHA-256 `dae9946a70fb23d935a86f9affdcab97459d07a4024a84e4e0b6c3a5559a5b77` |
| G2.1 status | 4,627 bytes; SHA-256 `281f0525ac101103ac623c6be5a432507787e6c47f5283fd1fe9c86cb8873077` |

The worktree contained the six supplied focused BR6C paths and exactly ten
unrelated modified/untracked paths. Hashes for all ten unrelated paths were
recorded before work. The authoritative repository root was
`C:\Projects\Politipiks`; the ignored nested `politipick` directory was not
edited. The original failed receipt was never overwritten or deleted.

## Precise failure and diagnosis

The failed receipt recorded the first build exiting `1`, zero stdout bytes,
1,027 stderr bytes, and stderr SHA-256
`52144724a52dc7897c828d9c49829172b3c8918cbfb8a4c827a88e8f9afef010`.
A new isolated BR6CR diagnostic invocation reproduced those values exactly and
classified the final-plan assembly failure as
`BR6C_EXCEPTION_OUTPUT_NOT_CERTIFIED`, without printing raw stderr, candidate
values, document bodies, credentials, or private artifact content.

Five ranked hypotheses were tested one variable at a time. The certified input
drift, NJ-08-only, one-to-one-only, and candidate-selector hypotheses were
falsified. Digest/count-only probes showed the same cause in CA-40, FL-11,
NJ-08, and TX-22: after the seven identity blockers were cleared, the generic
BR6B draft retained three production capture-time pointers under
`/updatedAt/*`. That selected `deterministic-merge` and made the proposed output
different from the complete certified output. Suppressing only those three
runtime-pointer preservations made all four drafts match the certified output.

## RED, minimal correction, and GREEN

The minimized behavior was locked at the public final-plan builder seam before
the correction. The RED invocation exited `1`, emitted no stdout, retained
`BR6C_EXCEPTION_OUTPUT_NOT_CERTIFIED`, and attached the assertion
`validated identity exceptions produce complete certified replacement outputs`.

The correction is deliberately narrow. For a validated exceptional race only,
the planner reclassifies exactly `/updatedAt/__firestoreType`,
`/updatedAt/nanoseconds`, and `/updatedAt/seconds` as certified-output fields.
It fails closed if any expected pointer is missing, duplicated, or replaced by
an unexpected runtime-metadata pointer. Every identity, lineage, override,
rollback, and certified-input validation remains intact.

The GREEN invocation exited `0` with empty stderr and proved:

| Measure | Result |
| --- | ---: |
| Resolved exceptional races | 4 |
| Corrected one-to-one races / overrides | 3 / 6 |
| Approved many-to-one merge groups / aliases | 1 / 2 |
| Consumed validated G2.1 overrides | 8 |
| Resolved identity blockers | 7 |
| Planned / deterministic paths | 858 / 858 |
| Replace with certified / deterministic merge | 4 / 854 |
| Unresolved / policy conflicts | 0 / 0 |
| Reproducible outputs / complete rollback evidence | true / true |
| `readyForExecutor` | true |

CA-40, FL-11, and TX-22 use only validated one-to-one corrections. NJ-08 uses
only the existing approved many-to-one alias group. Candidate order, name,
party, incumbency, and Bioguide fields remain diagnostic-only and cannot
establish identity.

## BR6CR receipt hardening and diagnostic replay

The failed BR6C receipt remains immutable. The recovery runner now uses
separate no-clobber names for parameterized `g8-4br6cr-diagnostic-*` evidence,
two `g8-4br6cr-build-*` plans, the `g8-4br6cr-replay-*` plan and isolated replay
child, and `g8-4br6cr-final-certification-receipt.json`. Failure receipts retain
only phase, sanitized `BR6C_*`/`BR6CR_*` code, exit/signal, byte counts,
digests, immutable-input identities, safety accounting, and the stop action.
They never retain raw stderr.

The post-fix diagnostic full build exited `0` with empty stderr. It produced a
75,926,293-byte plan at SHA-256
`654349812a2d2806b75b58e0f57ba09713bb27d22f955c85a100cc70cf7a80ec`
and semantic plan digest
`ecc155e0e08a4ac599593f70041ee53d806b48a149ac375c7b2c901d4c76dd23`.
Its 9,273-byte sanitized report has SHA-256
`58212a18bab09f359f80faa4f2b54aac1632c1d7742d13e0086c16aab2019b05`.
All five immutable inputs were byte-identical before and after.

Plan digests from the successful diagnostic are:

- entries: `db946e81664318e666daf12ecfc1bdbcf600dea6b1cc109296f933a979d8cbfb`;
- aggregate: `0ae00a719842cbfa58767dae12b280e35406ed72a3cf2501ad3518c8d7dbfc8c`;
- outputs: `0ac958cd0dbcf43cba20ef1b64ab7957fa4255dc76a79efb71306146957f84e2`;
- rollback: `80241286ec7cfb0e45844adbf2758883e0c8d8ec8d2b98c26b3db5f66986529d`; and
- plan: `ecc155e0e08a4ac599593f70041ee53d806b48a149ac375c7b2c901d4c76dd23`.

## Final local gates and certification

The one no-clobber local-gate invocation completed all 21 gates with exit `0`:

1. BR6C focused final-identity tests.
2. Canonical-migration override tests.
3. BR6B equivalence regression.
4. BR6A disposition regression.
5. BR5A analysis regression.
6. BR5C offline-runner regression.
7. BR5A preflight regression.
8. BR4A activation-recovery regressions.
9. G8.3A activation regressions.
10. BR3A structured-audit regressions.
11. G8.2A product-shadow regressions.
12. Local-product-bundle regressions.
13. TypeScript.
14. Lint.
15. Production build.
16. `git diff --check`.
17. BR5A capture emulator on port 18083.
18. BR4A activation emulator on port 18082.
19. BR3A audit emulator on port 18081.
20. G8.3A activation emulator on the approved 8081 configuration.
21. G8.2A shadow emulator on the approved 8081 configuration.

The build emitted its known bounded 417-byte warning stream at SHA-256
`2d277c587f5a9bbf123365d5d740cb181c293e7cea4adc3df70b683c3476e0d9`
and exited `0`. The 11,901-byte local-gate receipt has SHA-256
`56edc34e37e730fe92f2607aba38fd57ba1b330a3fe5f959ae0cf320d4a23c96`.
All immutable inputs remained byte-identical. Emulator children used only
`demo-no-project`, removed credentials and inherited proxy/Firestore host
variables, allowed loopback only, and disabled update checks.

After every pre-final gate passed, the authorized final sequence was invoked
once. Independent builds 1 and 2 and the single `--verify-replay` invocation
exited `0/0/0`; the replay child also succeeded. All four plans are
byte-identical at 75,926,293 bytes and SHA-256
`654349812a2d2806b75b58e0f57ba09713bb27d22f955c85a100cc70cf7a80ec`.
All three reports are byte-identical at 9,273 bytes and SHA-256
`58212a18bab09f359f80faa4f2b54aac1632c1d7742d13e0086c16aab2019b05`;
every stderr stream is empty. The 12,892-byte final receipt has SHA-256
`dc91b43af657af5b0869c5544c50cdb2e60d1d0ed4f66c0e4ccbe0405c7da232`.
It records Firebase imported `false`, credentials loaded `false`, network
requests `0`, production operations `0`, and dispositions executed `0`.

## Focused allowlist and final state

Only these nine paths are eligible for staging:

- `scripts/lib/g8V2FecCandidateEquivalence.ts`;
- `scripts/lib/g8V2IdentityExceptionResolution.ts`;
- `scripts/lib/g8V2IdentityExceptionResolution.test.ts`;
- `scripts/report-g8-4br6c-final-identity-resolution.ts`;
- `scripts/run-g8-4br6c-offline-identity-builds.ts`;
- `scripts/run-g8-4br6c-local-gates.ts`;
- `docs/status/g8-4br6cr-final-identity-resolution-recovery.md`;
- `docs/status/g8-4br6cr-final-identity-resolution-recovery-evidence.json`; and
- `docs/2026-live-50-state-roadmap.md`.

The containing focused commit hash is necessarily reported in the final
handoff rather than embedded in its own content. Final status is **locally
certified with 858/858 paths deterministic, zero unresolved or policy
conflicts, complete rollback evidence, and `readyForExecutor=true`**. That
readiness does not authorize any disposition execution or production
operation.
