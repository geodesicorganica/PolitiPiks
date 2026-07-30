# G5.5 — Wave D source resolution

Status: **completed locally on 2026-07-30**. No Firebase, Firestore, production read/write, capture, deployment, selector activation, deletion, commit, push, or nested-app change occurred during the source-resolution and offline certification work.

## Contract and provenance

Each of the 36 Wave D jurisdictions has one versioned, minimal evidence file in `data/2026/wave-d-reviewed/`. Each file carries the authority and 2026-general identity, three capability-specific official endpoints, source format/access state, publication phase, checked/reviewed/next-review timestamps, facts-only reviewer notes, a deterministic adapter recommendation, and a tamper-checked SHA-256 evidence digest. Evidence records do not contain raw pages, contact data, cookies, credentials, voter data, league data, or candidate choices.

`proven` means only that the named authority endpoint supports the listed publication capability. It never means ballot-qualified, active, or pick-eligible. No provider or allowlist was added in this goal.

## Outcomes

| State | Outcome | Next review |
| --- | --- | --- |
| AL | HTML certification surfaces; candidate list and statewide-measure publication planned | 2026-08-12 |
| AK | Primary candidate search is phase-limited; no measure publication established | 2026-08-12 |
| AZ | Primary-qualified PDF surface; general capability remains provisional | 2026-08-12 |
| AR | No direct 2026 list/measure publication established after bounded review | 2026-08-12 |
| CO | Calendar/title-board surfaces are not ballot publication evidence | 2026-08-12 |
| CT | Candidate-list endpoint exists; 2026 general records not yet reviewed | 2026-08-12 |
| DE | 2026 primary candidate list is phase-limited | 2026-08-12 |
| HI | Candidate manual is filing guidance, not a published list | 2026-08-12 |
| ID | Historical list did not establish a 2026 publication endpoint | 2026-08-12 |
| IL | Official 2026 general candidate-list endpoint identified | 2026-08-12 |
| IN | Official candidate-information links require direct list fixture review | 2026-08-12 |
| IA | General-election candidate-list publication identified | 2026-08-12 |
| KS | Candidate endpoint returned access barrier; measure publication is preliminary | 2026-08-12 |
| KY | Candidate finder is phase-limited; no measure publication established | 2026-08-12 |
| LA | Nov. 3 candidate inquiry is unofficial until qualifying closes | 2026-08-12 |
| ME | General candidate-list/XLSX publication identified; measure endpoint unresolved | 2026-08-12 |
| MD | General candidates, Governor, and ballot-question publications identified | 2026-08-12 |
| MA | Primary candidate and ballot-question publication surfaces are provisional | 2026-08-12 |
| MI | Candidate-list PDF is primary-phase; measure endpoint unresolved | 2026-08-12 |
| MN | Candidate finder is phase-limited; no November measure publication established | 2026-08-12 |
| MS | Qualifying list is not final ballot evidence | 2026-08-12 |
| MO | Certified primary list is not a general-list assertion | 2026-08-12 |
| MT | Candidate list is primary-phase; official page says qualified 2026 general issues are TBD | 2026-08-12 |
| NE | Filing XLSX and petition documents remain preliminary | 2026-08-12 |
| NV | Legislature roster is not a statewide SOS publication | 2026-08-12 |
| NH | Filing hub is mutable/manual; statewide measure endpoint unresolved | 2026-08-12 |
| NJ | General-election information links require reviewed artifact capture | 2026-08-12 |
| NM | Candidate portal is primary-only; measure endpoint unresolved | 2026-08-12 |
| ND | Candidate portal is primary-only; measure endpoint unresolved | 2026-08-12 |
| OK | Candidate book/State Question sources require phase-specific manual capture | 2026-08-12 |
| OR | Interactive candidate search requires bounded manual capture | 2026-08-12 |
| PA | No consolidated 2026 list/measure publication established | 2026-08-05 |
| SD | 2026 statewide ballot-questions publication identified; candidates remain preliminary | 2026-08-12 |
| TN | Campaign-finance search is not a ballot list | 2026-08-05 |
| UT | Candidate-filings page is mutable and provisional | 2026-08-12 |
| WI | MyVote is address-gated; no bypass attempted | 2026-08-12 |

Exact URLs, state-specific source facts, access requirements, and SHA-256 digests are the reviewed records in `data/2026/wave-d-reviewed/`, and are mirrored in the 50-state registry’s `*Url`, `evidenceUrls`, and reviewed-evidence fields.

## Offline audit

Two unchanged offline replays matched:

- input/evidence digest: `98eca96fa8b70faf8fe8148e6a435335fe53c36c13e264a919a2e89b2462aaf8`
- registry digest: `993a421748a094fa11df901211cbff8df60b2330d466b37cfd1719c6115d8e9f`
- plan digest: `7439baa7c359720cf38f6809bce74339f0eea9a9b6c638d3fbede1f6b049b7c5`

Counts: 36 states; formats HTML/PDF/access-blocked/unresolved = 26/2/1/7; state statuses available/preliminary/access-blocked/unresolved = 4/24/1/7; proven endpoint capabilities candidate/governor/measure = 5/2/3. There are 59 unresolved or access-blocked capability-level follow-ups, 0 generic placeholders, 0 unsupported claims, 0 homepage-only records, 0 missing review dates, and 0 duplicate/conflicting endpoints.

The direct official URL validation pass observed public responses for 27 state publication surfaces. AZ, KS, and WI returned expected access barriers; ID redirected from its historic 2020 list; MI’s reported PDF redirected to the authority 404 route; AK and AL raised a local fetch `TypeError`. Those observations are kept fail-closed in the corresponding evidence plans and are not treated as a successful publication read.

## Verification

All commands are Firebase-free. The Wave D test invokes the audit with deliberately invalid Firebase credential environment values and asserts `firebaseInitialized=false`.

```text
npm run test-wave-d-source-resolution             # 0
npm run test-state-source-registry                # 0
npm run audit-2026-wave-d-source-resolution -- --all-wave-d --verify-replay  # 0, twice
```

## G5.6 plan

Implement only fixture-backed providers, grouped by the recorded source format: structured HTML (AL, IL, IA, MD, SD after direct fixture review); PDF/XLSX (ME and source-specific documents); manual mutable/search sources (AK, AZ, CT, DE, IN, KS, KY, LA, MA, MI, MN, MS, MO, MT, NE, NH, NJ, NM, ND, OK, OR, UT); and explicit blockers/unresolved (AR, CO, HI, ID, NV, PA, TN, WI). Every adapter must retain phase/provenance, project minimal fields, and keep pick eligibility false until separate official final-ballot validation.
