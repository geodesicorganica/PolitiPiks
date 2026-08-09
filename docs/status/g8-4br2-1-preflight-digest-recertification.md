# G8.4BR2.1 — Preflight digest recertification

Status: **wrapper/serialization-only drift diagnosed; versioned semantic
preflight contract implemented and certified locally; no production
authorization exists**.

## Boundary and source state

| Field | Value |
| --- | --- |
| Required branch | `codex/politipiks-canonical-shadow-release` |
| Required and observed starting HEAD | `42375696e4a5806d7afbaf1be3bc5670912af0fb` |
| Historical BR1 implementation HEAD | `1c64283b87f7187c625b5f2e1a2ae0aed747149d` |
| Private differential artifacts | `.artifacts/private/canonical-migration/g8-4br2-1/` (ignored) |
| Production invocation accounting | `0 / 0 / 0` attempted / started / exited |
| Production and selector reads/writes | `0 / 0` |

G8.4BR0, G8.4BR1, and G8.4BR2 remain immutable historical evidence. This work
did not invoke the production launcher or auditor and did not access Firebase
or Firestore outside the required local demo-project emulator test.

## Exact raw-output diagnosis

BR1 captured `npm run g8-4br0-state-audit-preflight 2>&1` as a PowerShell array
of lines, converted each item to text, joined the lines with
`[Environment]::NewLine`, appended one final platform newline, encoded that
string as UTF-8, and hashed it. BR2 captured the direct Node/tsx child stdout as
UTF-8 bytes. Reproducing both forms from the same semantic document gives:

| Form | Bytes | SHA-256 | Line endings | Wrapper bytes |
| --- | ---: | --- | --- | ---: |
| Historical BR2 direct Node stdout | 2,814 | `2f5604e13d3b40a894eb5191016bfc48160f401ac3ca94c73fc9b18a4076b2f2` | 79 LF; no CR | 0 |
| Same JSON plus npm banner, before PowerShell newline conversion | 2,922 | `8cf9e8db07b492d04337219aa67506744693144cfda05813465f82d517459199` | 83 LF; no CR | 108 |
| Historical BR1 PowerShell/npm capture | 3,005 | `a21b518c0cb6015196c2ed4e25c73769adebc1d67e5372ec63bc283c3cd438bd` | 83 CRLF | 108 |

The byte equation is exact: `2,814 JSON + 108 npm banner + 83 inserted CR =
3,005`. Both historical streams are UTF-8 without a BOM and end in one newline;
neither has trailing non-newline whitespace. The first raw-byte difference is
offset `0`: historical BR1 starts with `0x0d` (the npm banner's leading CRLF)
and BR2 starts with `0x7b` (`{`). The npm banner is:

```text
> react-example@0.0.0 g8-4br0-state-audit-preflight
> tsx scripts/verify-g8-4br0-state-audit-preflight.ts
```

After removing presentation bytes and parsing JSON, all 69 leaf JSON-pointer
values matched. Therefore there is no first JSON-pointer difference. The drift
is **wrapper/serialization-only**, not substantive. The two historical raw
hashes above remain evidence; neither replaces the other.

At required starting HEAD `4237569`, fresh private raw captures were 2,922
bytes / `b220b3dc55933a499b4a0aa548a956c1bef2c202691f9bdf2852a25a86d75ddf`
for raw npm stdout and 2,814 bytes /
`416e01606accebb3be74e98e182f0aca8bba1e8e7c012202e7699e98b5f396c0`
for direct stdout. Their parsed documents and all 69 pointers were equal. Their
canonical semantic digest was
`67e4fc7dabd5d00c37a0dd95fcf76580945e8be3f548af5ef1a20a26d8fecafb`.
The raw hashes differ from the historical pair only because the required
starting HEAD is itself an implementation-identity field.

## Canonical contract

`g8-4br2-1-state-audit-preflight/v1` hashes canonical JSON with recursively
sorted object keys and unmodified array order. The receipt explicitly contains:

- project ID, database ID, generation, manifest path, and bundle path;
- direct `process.execPath` + repository-resolved `tsx/cli`, absolute working
  directory, `shell: false`, state-audit script, `--audit` mode, argument count
  `51`, all exact ordered arguments, and their canonical digest;
- shadow source, activation implementation, and state-audit implementation
  identities;
- all five named receipts plus `count: 5` and `uniqueCount: 5`;
- all expected counts, including exactly 3,352 content documents, 3,353 total
  bundle documents, and one excluded selector;
- input, evidence, release-plan, bundle, namespace, and identity-bound activation
  plan digests; and
- `firebaseInitialization: false`, `reads: 0`, and `writes: 0`.

The parser recomputes and verifies an embedded receipt and digest. It excludes
only presentation: UTF-8 BOM, npm/banner prefix, JSON indentation and object-key
order, LF versus CRLF, PowerShell line reassembly, and trailing whitespace.
Tests prove every exclusion maps to the same receipt/digest.

## Tamper coverage

Focused tests prove that every one of the 51 ordered argument positions either
changes the digest or is rejected. Separate cases cover target/generation,
executable and cwd, argument count/order, coherent and mismatched implementation
identities, all count bounds, duplicate or changed receipts, namespace and other
certified digests, embedded receipt/digest tampering, Firebase initialization,
and nonzero reads/writes. The selector-first auditor, its exact-path read bound,
manifest-derived arguments, and direct Node/tsx launcher were not changed.

## Local gate ledger

| Command or check | Exact exit | Result |
| --- | ---: | --- |
| Initial focused regression test before implementation | 1 | Expected red: canonical exports absent |
| `npm run test-g8-4br2-1-preflight-receipt` | 0 | Presentation and tamper matrix passed |
| Parse/compare fresh npm-wrapper and direct-Node private captures | 0 | Equal documents, receipts, and canonical digest |
| First `npm run lint` after the implementation | 2 | Test-only literal-type tamper assignment; corrected with explicit unsafe-test casts |
| Final `npm run lint` before commit | 0 | TypeScript passed |
| `npm run test-g8-4br1-state-audit-launcher` | 0 | Direct launcher contract passed |
| `npm run self-test-g8-4br1-state-audit-launcher` | 0 | Harmless child only; Firebase/credentials/Firestore/auditor all false |
| `npm run test-g8-4br0-state-audit` | 0 | Selector-first and exact-path unit coverage passed |
| `npm run test-g8-4br0-state-audit-emulator` with update checks disabled | 0 | Demo project `demo-no-project`, Firestore port `18081` |
| Final pre-commit `npm run lint` | 0 | TypeScript passed |
| `npm run build` | 0 | Vite/esbuild passed; existing large-chunk advisory only |
| `git diff --check` | 0 | Passed; line-ending warnings only on existing working-copy policy |

The final post-commit canonical digest and remaining build/diff/final preflight
exits are reported by the completion result because implementation commit
identities are deliberately covered by the digest. No raw-output hash is an
authorization gate after this repair.

## Final boundary

No network, production audit, production Firebase/Firestore read or write,
selector operation, activation, resume, smoke, rollback, deployment, deletion,
push, or branch change occurred. This recertification creates no production
authorization.
