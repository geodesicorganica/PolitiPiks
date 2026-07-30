# G5.3 — Wave B structured-HTML providers

Status: **completed locally on 2026-07-29.** This work made no Firebase or Firestore call, production read/write, capture, shadow copy, activation, deployment, deletion, credential change, branch change, push, or commit outside the focused local implementation below.

## Result

The Firebase-free structured-HTML contract separates bounded endpoint fetches from deterministic fixture normalization and replay. It validates provenance, timestamps, page-shape markers, canonical IDs, choices, final-ballot candidate eligibility, duplicate records, and accepted-identity ambiguity. A page-shape mismatch is a schema-drift error; a fetch failure is reportable per state and does not prevent the remaining state reports.

| State | Reviewed official endpoint | Status | Reviewed capability | Emitted records |
| --- | --- | --- | --- | --- |
| CA | California Secretary of State 2026 measure certification | `available` | statewide measure | 14 certified, prediction-ready measures |
| FL | Florida Division of Elections constitutional amendments/initiatives | `not_yet_published` | none | 0 |
| GA | Georgia Secretary of State candidate qualifying | `not_yet_published` | none; reuses G4.1 qualification provenance | 0 |
| NY | New York State Board of Elections | `not_yet_published` | none | 0 |
| NC | North Carolina State Board of Elections 2026 general-election event | `not_yet_published` | none | 0 |
| OH | Ohio Secretary of State voting calendar | `not_yet_published` | none | 0 |
| SC | South Carolina Election Commission statewide general-election event | `not_yet_published` | none | 0 |
| TX | Texas Secretary of State Elections Division | `not_yet_published` | none | 0 |
| VT | Vermont Legislature election-hours statute | `not_yet_published` | none | 0 |
| VA | Virginia Department of Elections voter-rights page | `not_yet_published` | none | 0 |
| WA | Washington Secretary of State 2026 dates and deadlines | `not_yet_published` | none | 0 |
| WY | Wyoming Secretary of State election FAQ | `not_yet_published` | none | 0 |

The eleven unpublished providers carry `2026-08-12T00:00:00.000Z` as their explicit next review. They do not claim candidate-list, gubernatorial-race, or statewide-measure support. In particular, Georgia qualification information is not treated as a final ballot list, and no FEC filing becomes eligible without an official final-ballot-compatible record.

The reviewed California source remains the existing 14-measure G5.1 certification. Fixtures retain only reviewed fields and page markers—not mirrored authority HTML, voter data, cookies, credentials, user data, or league data.

## Offline certification

Two independent offline runs produced identical output:

- input digest: `51cbc98f268735001051818311a5950ef8db7e92a7136b786aa5bae6d56de32b`
- evidence digest: `c82c09bfb3a7438bbdb62ba2f4b8fddc49bea5442808ed6ab272f9fe9b44bdfe`
- plan digest: `072f92c941cb2d8f899e9f4d8ff683350c324476f3e2fa73f632647eb471b4f4`

Counts: 12 states; available/not-yet-published `1/11`; candidate/governor/measure records `0/0/14`; prediction-ready records `14`; conflicts, schema drift, duplicate canonical IDs, and ambiguous accepted identities all `0`.

The audit accepts `--state`, `--all-wave-b`, `--fetch`, `--fixture-dir`, `--dry-run`, `--snapshot-in`, `--snapshot-out`, `--report-out`, and `--verify-replay`. Snapshot/report outputs are private JSON files beneath `.artifacts/private/canonical-migration` and use no-clobber writes. Offline paths import no Firebase code; tests repeat replay with deliberately unavailable Firebase credentials.

Verification commands and exit codes:

```text
npm run test-wave-b-state-providers                              0
npm run test-state-source-registry                               0
npm run test-ballot-measures                                     0
npm run test-ballot-eligibility                                  0
npm run test-free-sources                                        0
npm run lint                                                     0
npm --prefix ingest run build                                    0
npm run build                                                    0
npx tsx scripts/audit-2026-wave-b-state-providers.ts --all-wave-b --verify-replay 0 (twice)
git diff --check                                                 0
```

Recommendation: **G5.4 Wave C PDF providers**. Keep the two PDF sources in an offline review/parser lane; do not infer a provider capability or empty completion before a fixture and endpoint-specific parser are reviewed.
