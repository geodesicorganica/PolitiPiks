# PolitiPiks 2026 Live 50-State Roadmap

Status: **authoritative**

Last verified: **2026-08-05**

This document is the canonical roadmap for taking the 2026 election product from
its locally certified federal catalog to a production system with live,
source-backed coverage across all 50 states. It governs scope, sequencing,
readiness definitions, release gates, and completion criteria.

Implementation evidence belongs in `docs/status/g*.md`. Code and tests define
implemented behavior. Production receipts and deployment records define
production state. A local test, commit, snapshot, or certification must never be
described as a production deployment.

## G8.2A product-shadow gate

The next bounded gate after G8.1 is the locally certified, production-safe v2
product-shadow executor. It consumes the approved prospective bundle without a
new capture, maps only content beneath the versioned migration-shadow namespace,
and excludes the active selector. The certified shape is 470 races, 14
measures, 2,384 candidate-research documents, 14 measure-research documents,
and 470 metrics: 3,352 shadow content documents plus one root manifest
operation. Create-only writes, exact-content verification, resumable progress,
and fail-closed target/digest/count/source/authorization guards are required.

G8.2A does not activate a selector, deploy rules or application code, perform a
production read or write, delete or overwrite legacy data, or authorize the
subsequent release stages. Its evidence is maintained in
`docs/status/g8-2a-product-shadow-executor-readiness.md`.

## Product outcome

A fully functioning 2026 product lets a user:

1. browse every in-scope race and statewide ballot measure;
2. see official provenance, freshness, research, and prediction-relevant
   metrics;
3. create or join a league containing currently selectable contests;
4. make and update an allowlisted pick before the product safety lock;
5. understand why a contest is unavailable, incomplete, stale, or closed;
6. receive correct scoring after an approved result state is available.

The product must remain useful while official ballots are still being
published. Catalog availability is nationwide; prediction availability is
progressive and contest-specific.

## Scope

### 2026 MVP

- All canonical 2026 federal contests: every scheduled U.S. House seat and U.S.
  Senate election.
- All regularly scheduled 2026 gubernatorial contests.
- Every officially certified statewide 2026 general-election ballot measure.
- Official candidate and measure choices, when published by the responsible
  election authority.
- Source-backed candidate research, measure research, historical context,
  demographics, turnout context, campaign finance, and incumbent legislative
  records where the underlying public source supports them.
- League creation, contest selection, picks, deadlines, results, and scoring.

A state with no statewide measure is covered only when an official source
supports `officially_none`. A state whose final list is unavailable remains
`not_yet_published`; it is not silently treated as complete.

### Post-MVP

- State legislative races.
- County, municipal, school-board, judicial, and other local races.
- Local ballot measures unless a state publishes a complete official statewide
  feed that can be ingested safely.
- Paid polling, paid campaign-finance aggregators, or paid ballot-data feeds.
- Model-generated forecasts or AI-generated political narratives.

Adding every local contest would expand the catalog from hundreds to many
thousands of targets and requires a separate roadmap, identity system, and
jurisdiction-level source program.

## Non-negotiable data policy

- Production election facts come from official or explicitly approved public
  sources. Missing data remains missing.
- Gemini and other generative models are not production data sources.
- An FEC filing proves `filed`; it does not prove active candidacy, ballot
  qualification, or pick eligibility.
- Only valid official ballot evidence may add a candidate or choice to an
  allowlist.
- The product safety lock is not an official jurisdiction poll-close time.
  Official poll-close research remains supplemental.
- Reviewed evidence that is malformed, conflicting, duplicated, or ambiguous
  fails closed.
- Incomplete state coverage does not block unrelated states or catalog browsing.
- Existing predictions are audited when eligibility changes; they are never
  silently rewritten.
- Legacy 2024 data is not part of the live catalog. It remains a resolved-race
  fixture and historical input where methodology permits.

## Readiness model

Readiness is evaluated at multiple levels so one unavailable source cannot block
the entire product.

| Readiness | Meaning | Required behavior |
| --- | --- | --- |
| `catalogReady` | The contest identity, timing policy, basic choices, and provenance are safe to browse | Contest may appear in browse and research views |
| `predictionReady` | Official evidence establishes the allowlisted candidate or measure choices | Picks may be created or updated before `closeAt` |
| `researchReady` | The baseline research contract is present with provenance and freshness | Research drawer may render sourced fields and explicit gaps |
| `metricsReady` | Required comparison metrics exist with geography, vintage, and methodology | Quantitative context may render without leakage |
| `resultReady` | The configured result authority and result state satisfy scoring policy | League scoring may run |
| `releaseReady` | App, rules, data, rollback, and production verification gates pass | Selector or deployment may change under separate authorization |

`predictionReady` is contest-specific. There is no global requirement that all
states become pick-ready at the same moment.

## Verified baseline

The following baseline is supported by the linked status records:

| Area | Verified local state |
| --- | --- |
| Canonical federal seats | 470 |
| Catalog readiness | `catalogReady=true` |
| Prediction readiness | `predictionReady=false` |
| Canonical candidate-research documents | 537 |
| Canonical contest-metric documents | 464 |
| Output orphan research/metrics | 0 / 0 |
| Unresolved identities/predictions | 0 |
| Candidate allowlists | Present and empty until official ballot evidence |
| Georgia ballot source | `not_yet_published`; 0 eligible candidates |
| Canonical statewide measures | 14 California measures |
| Prediction-ready measures | 14 |
| First-wave measure coverage | CA `available`; TX, NY, FL, and GA `not_yet_published` |
| Production activation/deployment | Not performed |

Evidence:

- [G3.4 canonical catalog certification](status/g3-4-canonical-catalog-certification.md)
- [G4.1 source-backed ballot eligibility](status/g4-1-ballot-eligibility.md)
- [G5.1 statewide ballot measures](status/g5-1-2026-statewide-ballot-measures.md)
- [Canonical federal registry contract](canonical-2026-federal-registry.md)
- [Free-source data plan](free-source-data-plan.md)

## Delivery roadmap

### G5.1 — Canonical statewide ballot measures

Status: **completed locally on 2026-07-27**

Build and locally certify the versioned statewide-measure contract and the first
source wave for CA, TX, NY, FL, and GA.

Required outcomes:

- durable canonical measure IDs and aliases;
- official qualification, source, text, fiscal-analysis, and choice fields;
- research-visible versus prediction-ready status;
- a measure-scoped product safety lock that does not alter the federal policy;
- deterministic source snapshots, replay, audits, and digests;
- app and Firestore allowlist enforcement for measure picks;
- explicit `not_yet_published`, `officially_none`, and source-error states.

Exit gate:

- all five states have an official-source coverage status;
- all emitted records have valid provenance;
- output has no duplicate IDs, ambiguous mappings, or invalid choices;
- offline replay and all relevant local/emulator/browser gates pass.

Completion evidence:

- California: 14 official, research-ready, and prediction-ready measures.
- Texas, New York, Florida, and Georgia: explicit `not_yet_published` source
  states.
- Input and plan digests replayed deterministically across two local runs.
- Parent and nested local, emulator, browser, lint, and build gates passed.
- No production read, write, capture, activation, deployment, or mutation
  occurred.
- Durable record:
  [G5.1 statewide ballot measures](status/g5-1-2026-statewide-ballot-measures.md).

### G5.2 — Unified 50-state source registry

Status: **completed locally on 2026-07-27**

Create one authoritative registry for candidate lists, gubernatorial contests,
and statewide measures in every state.

Each state record must include:

- responsible authority and official HTTPS URLs;
- supported contest types;
- source format: API, JSON, CSV, XLSX, HTML, PDF, or reviewed manual input;
- current publication status and election applicability;
- retrieval and review cadence;
- parser/adapter capability;
- last successful evidence digest;
- schema-drift and stale-source status.

Exit gate:

- 50/50 states have reviewed source records;
- every state is assigned to an adapter wave;
- unknown or inaccessible sources are explicit blockers, not empty successes.

Completion evidence: 50 unique official-authority records; source formats
HTML/PDF/reviewed-manual `12/2/36`; statuses available/not-yet-published/
unresolved `1/13/36`; waves B/C/D `12/2/36`; no unreviewed capability claim.
Next: **G5.3 Wave B structured-HTML providers**, beginning with already
fixture-proven California and Georgia sources. See
[G5.2 50-state source registry](status/g5-2-50-state-source-registry.md).

### G5.3–G5.6 — State provider waves

G5.3 status: **completed locally on 2026-07-29**. All 12 Wave B structured-HTML authorities now have deterministic, source-backed provider fixtures: California is `available` with 14 certified statewide measures; the other 11 are explicitly `not_yet_published` with a next review date and no unsupported capability claim. The offline report has zero duplicate IDs, ambiguous accepted identities, conflicts, or schema drift. See [G5.3 Wave B providers](status/g5-3-wave-b-html-providers.md).

Next: **G5.4 Wave C PDF providers**. Its two official PDF authorities need format-specific fixture and parser review before any capability declaration.

G5.4 status: **completed locally on 2026-07-29**. Rhode Island and West Virginia now have fail-closed, deterministic official-PDF providers. Both reviewed documents classify as calendars—not ballot lists—and consequently emit zero records and zero capabilities; each has an explicit next review date. See [G5.4 Wave C providers](status/g5-4-wave-c-pdf-providers.md).

G5.5 status: **completed locally on 2026-07-30**. All 36 former generic Wave D records now have versioned, state-specific official-source plans, evidence digests, precise blockers, and deterministic next reviews. Ten endpoint capabilities are proven as publication surfaces only; no provider or pick eligibility was activated. See [G5.5 Wave D source resolution](status/g5-5-wave-d-source-resolution.md).

G5.6 status: **completed locally on 2026-07-30**. The 50-state provider foundation is complete locally: all 36 Wave D states have a deterministic provider result; six reviewed source fixtures (AL, IL, IA, MD, ME, and SD) back 10 proven publication capabilities and project six records; the other 30 states remain reviewed manual or explicit fail-closed blockers with their source status and next-review date. The offline runner is Firebase-free, provenance-checked, deterministic, and keeps every emitted candidate or measure ineligible for picks. See [G5.6 Wave D fixture providers](status/g5-6-wave-d-fixture-providers.md).

G6.1 status: **completed locally on 2026-07-30**. The Firebase-free baseline reconstructs the 470-seat canonical registry from a 467-raw-race snapshot, preserves 537 richer candidate-research records, supplies a minimal official-FEC baseline for all 2,384 canonical candidates, includes research for 14 certified statewide measures, and reaches 470/470 federal metric documents (464 preserved plus six explicit availability-only records). Document coverage is deliberately separate from field depth; comparative finance remains unavailable for all 470 races.

G6.2 status: **certified locally on 2026-07-31**. The Firebase-free FEC bulk candidate-summary path normalizes the official 2025–2026 archive privately and deterministically: 2,368 exact canonical candidate matches yield comparable finance for 431 races, with 33 partial/incompatible-period races and 16 explicitly unavailable canonical candidates. It preserves all 470 metrics, 2,384 candidate-research documents, and 14 measure-research documents; 106 presidential source rows remain audited out of scope. See [G6.2 FEC finance depth](status/g6-2-fec-finance-depth.md).

G6.3 status: **certified locally on 2026-07-31**. A Firebase-free official Congress.gov/Senate.gov capture resolved all 449 reviewed canonical Bioguide identities, added 20 House and 20 Senate roll calls, and preserves G6.2 finance plus all baseline cardinalities. See [G6.3 Congress and roll-call depth](status/g6-3-congress-roll-call-depth.md).

G6.4 status: **source snapshot certified locally on 2026-08-03; deterministic downstream contract recertified as G6.4.1 on 2026-08-04**. Firebase-free historical/CVAP capture provides 470/470 canonical CVAP facts, 434 historical facts, and 428 turnout proxies, while preserving 470 metrics, 2,384 candidate-research documents, and 14 measure-research documents. The G6.4.1 contract excludes unrelated publication capture metadata from evidence/plan hashing while retaining provenance fields in product documents. See [G6.4 historical turnout and CVAP depth](status/g6-4-historical-turnout-cvap-depth.md) and [G6.4.1 deterministic certification recertification](status/g6-4-1-deterministic-certification.md).

Next after G6.4 certification: **G7 product-complete catalog, research, leagues, and picks**.

Implement providers by source format so parsers and failure handling can be
reused:

1. machine-readable API, JSON, CSV, and XLSX sources;
2. stable structured HTML sources;
3. official PDF and document sources;
4. reviewed manual-source states and documented exceptions.

Each provider should emit candidates and statewide measures when the authority
supports both. A working adapter may correctly return `not_yet_published`;
official publication timing is an external condition, not an implementation
failure.

Exit gate for each state:

- source fetch and offline replay are separable;
- normalized output is deterministic;
- candidate and measure identity conflicts fail closed;
- source availability and freshness are observable;
- valid official records update only the affected contest allowlists;
- unavailable states do not block ready states.

Exit gate for the workstream:

- 50/50 states have a functioning provider or a reviewed manual-source path;
- all currently published official records are represented;
- every omission has a documented reason and next review date.

### G6 — Research and metrics depth

Status: **G6.1 through G6.4 completed locally; G7 product surfacing next**

Raise the catalog from identity coverage to decision-useful evidence.

Candidate baseline:

- official FEC identity and filing profile for every federal candidate;
- campaign-finance facts where FEC data exists;
- Congress.gov identity, service, legislation, and official roll calls for
  incumbents;
- explicit not-applicable and unavailable states for challengers and missing
  sources.

Race baseline:

- `contestMetrics` for all 470 canonical federal races and every added
  gubernatorial race;
- latest comparable completed-election margin;
- prior turnout context;
- Census electorate, ACS, and CVAP context with aligned geography and vintage;
- comparative finance with explicit `asOf` dates;
- no historical winner or post-lock result leakage.

Measure baseline:

- official description and full text;
- official fiscal analysis when available;
- legal and qualification status;
- source history and freshness;
- support/opposition only when an approved filing source provides it.

Exit gate:

- 470/470 federal metric documents;
- 100% baseline candidate and measure research coverage, including explicit
  sourced unavailable/not-applicable states;
- field-level provenance, retrieval time, data vintage, and methodology;
- no boilerplate, generated narratives, unsupported zeroes, or orphan records.

### G7 — Product-complete catalog, research, leagues, and picks

Status: **in progress; G7.1, G7.2, and G7.3 locally certified; G8.1 catalog-beta offline certification completed**

Complete and verify the user-facing workflow:

- browse and filter races and measures by state, office, type, and readiness;
- render source, freshness, and missing-data explanations;
- create and join leagues;
- include only selectable contests in prediction flows;
- enable only allowlisted candidates and measure choices;
- reject unavailable, invalid, late, or changed-eligibility picks in both the UI
  and Firestore rules;
- handle loading, empty, stale, partial, source-error, and closed states;
- preserve accessibility and mobile behavior;
- keep valid non-federal contests and measures visible during federal selector
  changes.

G7.1 status: **certified locally on 2026-08-03**. A deterministic private
product bundle now projects the certified G3–G6 chain into 470 races, 14
measures, 2,384 candidate-research documents, 14 measure-research documents,
470 metrics, and one selector with zero duplicate/orphan/unresolved/leakage
findings. A loopback-only seeder populated all 3,353 documents in nine emulator
batches. The active app renders sourced identity, finance, congressional,
historical-margin, turnout-proxy, CVAP, freshness, methodology, and explicit
missing/error states; California measures remain selectable while catalog-only
Georgia remains browseable and disabled. See [G7.1 local research
surfacing](status/g7-1-local-research-surfacing.md).

G7.2 status: **certified locally on 2026-08-03**. The app now combines state,
office/contest, race-versus-measure, and readiness filters with accessible
loading, source-error, unavailable, empty, reset, and mobile states. Local
create/join-league and create/update-pick flows pass browser and Firestore
emulator gates against all 14 certified California measures. Federal races
remain browseable and non-pickable without official allowlists; changed,
withdrawn, invalid, source-error, closed, and legacy-canonical cases fail closed.
The offline prediction audit found zero incompatible live-2026 references and
rewrote nothing. See [G7.2 local league and pick
workflow](status/g7-2-local-league-pick-workflow.md).

G7.3 status: **certified locally on 2026-08-03**. The release manifest and
Firebase-free validator pin the v2 catalog-beta contract at 470 races, 14
measures, 2,384 candidate-research documents, 14 measure-research documents,
470 metrics, one selector, and 3,353 total documents. It records zero
prediction-ready federal races and 14 prediction-ready California measures,
rejects the immutable identity-only v1 payload, enforces the ordered G8 state
machine and separate authorization boundaries, and verifies non-destructive
rollback paths. No production operation was executed. See [G7.3 release and
rollback runbook readiness](status/g7-3-release-rollback-runbook-readiness.md).

Exit gate:

- browser and emulator tests cover catalog-only, prediction-ready, closed,
  invalid-choice, withdrawal, source-error, and measure flows;
- deployment-readiness checks pass;
- the production rollout and rollback runbooks are current.

### G8 — Progressive production release

Status: **G8.1 catalog-beta offline certification completed locally on 2026-08-04; production stages remain separately authorized**

Use three releases rather than a nationwide big-bang cutover:

1. **Catalog beta** — publish research-ready races and measures with unavailable
   picks visibly disabled.
2. **Progressive predictions** — enable a contest when its official choices
   become prediction-ready.
3. **50-state certification** — verify every state as currently published,
   `officially_none`, or explicitly awaiting an official source.

Catalog beta, progressive prediction enablement, and eventual 50-state
certification are separate releases. Catalog beta follows this exact sequence:

```text
preflight
→ fresh bounded capture
→ offline certification
→ shadow write
→ namespace verification
→ Firestore rules deployment
→ application deployment
→ selector activation
→ production smoke test
→ rollback observation window
```

Each production read, write, deployment, selector change, deletion, and rollback
requires its own explicit authorization; no authorization is inherited from an
earlier stage. The G7.3 manifest is the local contract for ordering, fail-closed
stops, and rollback evidence. `canonical-2026-shadow-v1` remains immutable and
nonpublishable; canonical and legacy records are retained during rollback.

G8.1 status: **certified locally on 2026-08-04** from the one preserved fresh
capture after G6.4.1 offline recertification. The final bundle satisfies 470
races, 14 measures, 2,384 candidate-research documents, 14 measure-research
documents, 470 metrics, one selector, 3,353 total documents, zero
prediction-ready federal races, 14 prediction-ready California measures, and
zero duplicate, orphan, unresolved-reference, leakage, or incompatible-live
prediction findings. No production write, deployment, selector activation,
rollback, or deletion was performed.

G8.2B status: **production v2 shadow write and namespace verification completed
on 2026-08-05**. The one authorized direct apply completed 3,352 create-only
content writes across 10 bounded batches with a completed root manifest. The
one authorized verification returned `verified=true`, exact certified family
counts, and matching content, recorded, and expected namespace digests. The
active selector, active collections, legacy/v1 namespace, rules, application,
and deployment stages remain unchanged and separately authorized. Durable
evidence: [G8.2B production product-shadow write and verification](status/g8-2b-production-product-shadow.md).

### G9 — Live operations and coverage control

Status: **planned**

Turn local scripts into a repeatable operating system:

- scheduled, state-sharded refreshes;
- bounded retries and quota accounting;
- stale-data thresholds and visible freshness;
- parser/schema-drift alerts;
- per-state source and adapter health;
- unresolved identity and evidence review queues;
- coverage dashboards for contests, choices, research, metrics, and results;
- immutable run receipts and deterministic replay artifacts.

Target cadence:

| Data | Normal cadence | Near ballot publication/election |
| --- | --- | --- |
| FEC candidates and finance | weekly | weekly |
| Congress and roll calls | weekly | weekly |
| Machine-readable candidate/measure sources | weekly | daily when final lists are expected |
| Reviewed manual sources | monthly | weekly when final lists are expected |
| Census/historical metrics | annual or methodology change | no election-night refresh |
| Coverage verification | after every state batch | before every release |

Exit gate:

- a failed or stale state source is observable without inspecting logs manually;
- one state failure cannot corrupt or block other state updates;
- every active contest displays trustworthy freshness and source state.

### G10 — Results, scoring, and resolved-race lifecycle

Status: **planned; implementation begins after pre-election release is stable**

Use an explicit lifecycle:

```text
upcoming → live → closed → reporting → called → certified → archived
```

Required behavior:

- close picks through the product safety lock;
- ingest unofficial reporting separately from called and certified outcomes;
- define which approved state may trigger provisional versus final scoring;
- handle recounts, withdrawals, replacements, corrections, and certification
  changes without losing the evidence trail;
- make scoring idempotent and auditable;
- archive completed contests without deleting research or league history;
- use 2024 only as a resolved-race fixture and methodology test input.

Exit gate:

- result adapters, scoring, corrections, and rollback are emulator/browser
  tested;
- production scoring requires an approved result-state policy and separate
  authorization.

## Release milestones

| Milestone | Definition |
| --- | --- |
| M1 — Source-complete foundation | G5.1 and G5.2 complete |
| M2 — Progressive state coverage | At least one provider wave live locally and every state assigned |
| M3 — Decision-useful catalog | G6 coverage and provenance gates pass |
| M4 — Product-complete local release | G7 app/rules/browser gates pass |
| M5 — Catalog beta | G8 catalog deployment verified in production |
| M6 — Progressive predictions | Officially ready contests accept production picks |
| M7 — 50-state live coverage | Every state has current official coverage status and all published in-scope records |
| M8 — Resolved-race operations | G9 and G10 operating and verified |

## Definition of 50-state completion

The 2026 pre-election roadmap is complete when:

- 50/50 states have current official-source coverage records;
- all scheduled federal and gubernatorial contests are represented;
- every officially published statewide measure is represented;
- every contest is catalog-ready or has a documented fail-closed reason;
- all officially published choices are reflected in contest allowlists;
- every in-scope candidate and measure has baseline sourced research;
- every race has its required metric document;
- freshness, source health, and coverage are monitored;
- the full browse, league, pick, deadline, and unavailable-state flows pass in
  production;
- rollback is tested and legacy retirement remains auditable.

This definition does not require a state to publish data before its authority
does. It requires PolitiPiks to detect, represent, and refresh the authority's
current state correctly.

## Critical path and parallel work

The critical path is official state-source coverage and publication timing.
Engineering cannot make a final ballot exist early.

Work that should continue while ballots are unpublished:

- G5 source registry and reusable adapters;
- G6 research and metric depth;
- G7 user experience, rules, and failure states;
- G9 scheduling, monitoring, and coverage reporting.

Completed migration mechanics must not be reopened unless a failing test,
certification mismatch, or production verification provides concrete evidence
that their contract is wrong.

## Roadmap control

After every goal:

1. update its status and measured counts in this document;
2. link the durable `docs/status/` evidence record;
3. record focused implementation commits without implying they were deployed;
4. identify the next dependency-first goal and its production authority;
5. preserve unrelated dirty files and private ignored artifacts;
6. report blockers as external, implementation, data-quality, or authorization
   blockers rather than using a generic `blocked` state.

Changes to MVP scope, data-authority policy, readiness semantics, release order,
or result-scoring policy require an explicit decision recorded in this document.

## G8.3A versioned v2 activation and deployment readiness

G8.3A defines a separate `g8-3a-v2-activation/v1` contract for the verified
`canonical-2026-shadow-v2` namespace. It maps exactly 3,352 content documents
to active `races`, nested `candidateResearch`, `ballotMeasures`, nested measure
research, and `contestMetrics` paths. Canonical 2026 measures carry explicit
`catalogScope=canonical-2026-measures` and v2 generation metadata; the active
selector is the only exposure switch.

The local dry run is credential-free and reports 3,352 promoted content
documents, two selector/manifest operations, deterministic namespace and plan
digests, and zero writes. The state machine is validate shadow → pending
selector/manifest → bounded create-only promotion → exact content verification
→ final active selector. Existing content must be absent or exact-compatible;
conflicts and partial incompatible state stop without overwrite or deletion.

The future production sequence requires separate operation receipts and a
committed implementation. Use direct `npx tsx` with all target, generation,
digest, count, source-commit, and receipt values derived from the current
release manifest and offline plan. Do not substitute the existing
`activate-canonical-2026.ts` contract. Rollback is selector-only and retains
legacy/v1/v2 data. G8.3A itself performs no production operation.
