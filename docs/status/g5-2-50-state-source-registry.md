# G5.2 — unified 2026 official-source registry

Status: local-only registry certification. No Firebase/Firestore access, production read/write, capture, deployment, activation, or credential change occurred.

## Measured coverage

- States: `50/50`, unique state codes; all authority and evidence URLs are HTTPS.
- Formats: HTML `12`, PDF `2`, reviewed-manual `36`.
- Publication status: available `1` (California statewide measures), not-yet-published `13`, unresolved `36`; officially-none `0`.
- Waves: A `0`, B `12`, C `2`, D `36`.
- Proven capabilities: statewide measures `1`; candidate lists `0`; gubernatorial races `0`. Unreviewed capability remains absent, not inferred.
- Unresolved/access-blocked: `36/0` states. Every unresolved record identifies its official authority home and a review reason.

Registry digest: `b8f2046b4a43e12c815f872c08f7aaf175326ff0de51115fa8a64b5e8f7fe5f9`.
Plan digest: `e537bf7c4d0155a54fe600eb67402f6de8d949a14d7d8951848c90ff57395e10`.

California reuses the already reviewed Secretary of State certification. The remaining records intentionally identify an official authority and publication state without claiming a candidate, governor, or measure endpoint that has not been reviewed. `officially_none` is rejected unless an official evidence URL affirmatively proves it.

## Verification

The Firebase-free audit accepts `--input`, `--state`, no-clobber private `--report-out`, and `--verify-replay`. It imports no Firebase code. Unit coverage includes missing/duplicate states, bad HTTPS provenance, official-none evidence, deterministic sorting/digests, and provider-declaration compatibility.

G5.3 recommendation: begin Wave B with the existing California and Georgia HTML fixtures, then address the remaining structured HTML authorities; do not build an adapter for an unresolved/manual record until its publication endpoint and fixture are reviewed.
