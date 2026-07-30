# G5.4 — Wave C official-PDF providers

Status: **completed locally on 2026-07-29.** No Firebase/Firestore access, production read/write, capture, shadow copy, activation, deployment, deletion, credential modification, branch change, push, or nested-app change occurred.

## Reviewed documents and result

| State | Official PDF | Classification | Provider status | Capability / records |
| --- | --- | --- | --- | --- |
| RI | [2026 Rhode Island Election Calendar](https://vote.sos.ri.gov/Forms/Elections/Guides/2026ElecCal.pdf) | `calendar` | `unsupported_pdf` | none / 0 |
| WV | [2026 West Virginia Elections Calendar](https://sos.wv.gov/media/467/download?inline=) | `calendar` | `unsupported_pdf` | none / 0 |

Rhode Island’s calendar establishes the November 3 general election and candidate-administration dates; West Virginia’s calendar establishes the November 3 general election and the schedule for transmitting a certified list, but neither document itself is a final candidate list, gubernatorial contest list, or statewide-measure list. Neither is therefore permitted to create a pickable candidate or measure record.

Both registry records are `implemented` PDF providers, retain broader source status `not_yet_published`, use `reviewed_text_fixture` extraction, and require review on `2026-08-12T00:00:00.000Z`. Minimal reviewed excerpts are stored; complete PDF files, voters, cookies, credentials, user data, and league data are not committed.

## Safety behavior

The shared provider enforces exact official hosts, rejects redirects, non-PDF content types, oversized downloads, encrypted PDFs, image-only/scanned PDFs, malformed text extraction, changed classifications, and supplied document-digest changes. It uses no remote OCR or paid service. Network retrieval is bounded and separate from normalization; fixtures and `--snapshot-in` replay import no Firebase code.

Two offline replays matched:

- input digest: `b43c862abff0a9c99e6567f5036fa90120bd8d8c54c1764849559d74c02a5f20`
- document digest: `da8125727a405d0ff3179e06cce5b542e66ceb192c8e776c19ea5625aa111a6e`
- evidence digest: `475a55d17fe70cfd7cc9df154ee6599d3b781fdc3b3173c98390525174780d0b`
- plan digest: `0a562a7dde9bc91efee53bf5d80baefbbbb66d54810145ab80fd0be2afbf1278`

Per-document SHA-256 values: RI `498319031a2aefd15a2e6568d991f6c41b06c73980408d80b84a4c6e91e095a8`; WV `13393c469acf1f597aac65e921fdd3efa7adf851b5115bdb4c70763343c46615`.

Counts: classifications calendar `2`; statuses unsupported-PDF `2`; records `0`; capabilities `0`; reviewed-text fixtures `2`; conflicts, schema drift, duplicate canonical IDs, and accepted ambiguous identities all `0`.

## Verification

```text
npm run test-wave-c-pdf-providers                              0
npm run test-state-source-registry                              0
npm run test-wave-b-state-providers                             0
npm run test-ballot-measures                                    0
npm run test-ballot-eligibility                                 0
npm run test-free-sources                                       0
npm run lint                                                    0
npm --prefix ingest run build                                   0
npm run build                                                   0
npx tsx scripts/audit-2026-wave-c-pdf-providers.ts --all-wave-c --verify-replay 0 (twice)
git diff --check                                                0
```

The audit supports `--state`, `--all-wave-c`, `--fetch`, `--fixture-dir`, `--dry-run`, `--snapshot-in`, `--snapshot-out`, `--report-out`, and `--verify-replay`. Outputs are no-clobber private JSON beneath `.artifacts/private/canonical-migration`.

Recommendation: **G5.5 Wave D reviewed-manual resolution**. Review and resolve manual authorities one at a time; continue to represent unavailable publication rather than inventing candidate, gubernatorial, or measure capabilities.
