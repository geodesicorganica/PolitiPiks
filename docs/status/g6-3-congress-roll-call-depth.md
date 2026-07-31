# G6.3 — Congress.gov and roll-call depth

Status: **certified locally on 2026-07-31**.

The Firebase-free pipeline captured only official Congress.gov and Senate.gov
evidence under ignored private artifacts. It made no Firestore/Firebase,
deployment, activation, deletion, or push operation.

## Capture and identity coverage

- Canonical plan: 452 candidate references with 449 unique reviewed Bioguide IDs.
- Official capture: 1,389 source responses/checkpoints, below the 1,600 cap.
- Source response schema correction: Congress.gov labels House terms as
  `House of Representatives`; the saved checkpoints were normalized locally into
  a separate no-clobber v2 snapshot with **zero** additional HTTP calls.
- Profiles: 449 present, 0 unavailable.
- Legislation: 442 candidates / 2,094 sponsored bills and 448 candidates /
  2,231 cosponsored bills.
- Roll calls: 20 House and 20 Senate from the 119th Congress, second session.
- Candidate vote coverage: 401 candidates / 7,643 House records and 18
  candidates / 351 Senate records.

House vote matching is exact Bioguide only. Senate matching uses the unique,
exact normalized official Congress.gov name plus state; no fuzzy or cross-state
name fallback remains. Candidates without a reviewed Bioguide ID are explicitly
`not_applicable`; missing official responses remain `unavailable`.

## Preservation and deterministic replay

The finance merge preserves 470 metrics, 2,384 candidate-research documents,
and 14 measure-research documents, with zero duplicate/orphan/leakage output.
G6.2 finance remains source-preserving.

```text
sourceDigest:   445c5ddc81e2bbcd506740408606a582275a32136f49f26ceb9cb5e3bc410e39
inputDigest:    09d48f453789ea7de348b8b0c66c51171a066a882b9465c547545d4cc1561bb4
evidenceDigest: e42a5add512bded976c4361668dded68ab69651a0bac7aebd7f8cfbc9aad85ac
planDigest:     0f5bb8f11e69e96793efd2541f014f8f13a4f5915e714d91942aae64688100f9
```

Two offline v2 replays produced the same four digests and `congressApiCalls:0`,
`senateApiCalls:0`, and `firebaseInitialized:false`.

## Commands and exit codes

The no-network preflight, one bounded official capture, checkpoint-only v2
reconstruction, both offline replays, and the listed local gates exited `0`.
The initial v1 snapshot is retained privately as evidence of the corrected local
term-label mapping and was not overwritten or deleted.

```text
npx tsx scripts/capture-2026-congress-depth.ts --snapshot-in <publication> --finance-snapshot <g6.2> --snapshot-out <g6.3> --checkpoint-dir <private-dir> --preflight
npx tsx scripts/capture-2026-congress-depth.ts --snapshot-in <publication> --finance-snapshot <g6.2> --snapshot-out <g6.3-v2> --checkpoint-dir <private-dir> --resume --max-calls 1600 --verify-replay
npx tsx scripts/capture-2026-congress-depth.ts --snapshot-in <g6.3-v2> --publication-snapshot <publication> --finance-snapshot <g6.2> --verify-replay
```

Next: G6.4 historical margin, turnout, and CVAP depth.
