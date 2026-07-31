# G6.1 — Offline 2026 research and metrics baseline

Status: **completed locally on 2026-07-30**. This is an offline, snapshot-only certification. It did not initialize Firebase, access Firestore, alter production data, activate selectors, deploy, or change eligibility.

## Coverage and boundaries

The source snapshot has **467** raw live races. The builder validates that snapshot, then reconstructs the certified canonical publication plan and emits **470** registry races. Raw snapshot count is never used as the output registry.

- Candidate research: **537** richer canonical records preserved plus **1,847** minimal official-FEC baselines = **2,384/2,384** canonical candidates.
- Measure research: **14/14** locally certified canonical measures. Preliminary provider-only records are not promoted.
- Federal metrics: **464** preserved canonical documents plus **6** explicit coverage-only documents = **470/470**.
- Orphans, duplicates, and leakage: **0**, **0**, and **0**.

The six coverage-only metric documents are `2026-AK-house-al`, `2026-DE-house-al`, `2026-ND-house-al`, `2026-SD-house-al`, `2026-VT-house-al`, and `2026-WY-house-al`. Each records canonical geography and a 2026 election vintage, with historical margin, turnout, demographics/CVAP, and comparative finance explicitly `unavailable`; no zero is inferred.

## Contract and depth

Every baseline field carries an availability state, source identifier/official URL, verification level, `asOf`, retrieval timestamp, source vintage, methodology, and deterministic evidence digest. FEC identity retains a candidate-record mapping only: it does not assert active candidacy, ballot qualification, or pick eligibility. The baseline creates no political prose, positions, promises, or unsupported zero values.

Field depth is separate from document coverage:

| Field | Present | Unavailable | Not applicable |
| --- | ---: | ---: | ---: |
| Historical | 15 | 455 | 0 |
| Turnout | 15 | 455 | 0 |
| Demographics/CVAP | 464 | 6 | 0 |
| Comparative finance | 0 | 470 | 0 |

`metricsReady` is therefore **464**, not 470. A coverage-only metric document is not promoted to depth-ready status.

## Deterministic offline replay

With deliberately invalid Firebase credential paths, the Firebase-free CLI reported `firebaseInitialized=false` and two local builds agreed on:

- input: `504222a83687e0471af835253bbc4647c6af9a696c744a937e62564891bfa9c9`
- evidence: `07eb83414d46df7979067e2452e8756dd5c9bc4510af29e723fc7ccbcd28eac1`
- plan: `8c1e429d0d29b082f7fc443885c8b41fcaf21b9f19790b55e61f28ed6fb17d9c`

The CLI accepts `--snapshot-in`, `--state`, `--dry-run`, `--snapshot-out`, `--report-out`, and `--verify-replay`. It permits output only under `.artifacts/private/canonical-migration/`, uses exclusive creation, and refuses writes in `--dry-run` mode.

## Verification

All commands below completed with exit code `0`:

```text
npm run test-research-metrics-baseline
npm run test-contest-metrics
npm run test-canonical-publication
npm run test-ballot-measures
npm run test-ballot-eligibility
npm run test-free-sources
npm run lint
npm --prefix ingest run build
npm run build
npx tsx scripts/report-2026-research-metrics-baseline.ts --snapshot-in .artifacts/private/canonical-migration/publication-v2-fresh-2026-07-25.json --dry-run --verify-replay
git diff --check
```

## G6.2 recommendation

Add source-backed depth incrementally from retained official/free source metadata: comparative finance first, then Congress and roll-call mappings, followed by historical margin and turnout/CVAP coverage. Keep each source vintage and geography explicit, and continue rejecting post-lock results and unsourced inference.
