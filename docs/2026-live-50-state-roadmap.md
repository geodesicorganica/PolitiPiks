# PolitiPiks 2026 Live 50-State Roadmap

Status: **authoritative**

Last verified: **2026-08-10**

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

## G8.4A activation identity repair and local certification

G8.4A separates the immutable shadow source commit recorded by G8.2B
(`295466ccc52ccd4d6ad4f1dfb444d48410b92910`) from the current committed
activation implementation commit. Identity schema version `2` is recorded in
the selector and activation metadata while the separate
`g8-3a-v2-activation/v1` contract and legacy/v1 behavior remain unchanged.
The executor rejects swapped, missing, dirty, stale, and mismatched identities
before any Firebase import.

The Firebase-free command builder derives complete deterministic apply,
verify-only, and selector-only rollback arrays from the release manifest,
certified bundle, historical shadow identity, and current activation commit.
The certified dry run remains zero-write with 3,352 content documents, 3,354
future operations, and namespace digest
`ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`. G8.4A
does not authorize production access, selector activation, rollback,
deployment, deletion, network calls, or nested-app changes.

## G8.3B production Firestore rules deployment

G8.3B status: **completed with one authorized production rules deployment on
2026-08-06**. From nested commit `8bbc4bb611dd5826b446ca672c97a98a79a1694d`
on `codex/politipiks-2026-live-contract`, the direct Firebase CLI command
deployed only the configured Firestore rules target for project `politipiks`
and database
`ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a`. The deployed
`firestore.rules` SHA-256 is
`30d1dade24f9a96e27e963d27af6b4077731f7dbf83d13200e7f2da35812a4c4`.

The command exited `0` and Firebase reported successful compilation, upload,
and release of `firestore.rules`. No app, hosting, functions, storage,
selector, rollback, deletion, or Firestore document operation occurred; the
unrelated nested `.env.example` change was preserved. The authorization receipt
was `g8.3b-rules-deploy-2026-08-06`. Durable evidence: [G8.3B production
Firestore rules deployment](status/g8-3b-production-rules-deployment.md).

## G8.3C0 production application deployment target discovery

G8.3C0 status: **blocked on 2026-08-07**. The one authorized Firebase Hosting
site inventory returned exactly one site, `politipiks`, with default URL
`https://politipiks.web.app`; it did not return a live release/version,
previous rollback version, repository connection, application root, region, or
backend. The authorized App Hosting inventory could not return rows because the
project is not on the Blaze plan and the required API could not be enabled.

The local app remains a Vite frontend plus bundled Express/Node server, while
`firebase.json` configures Firestore only. Hosting site inventory therefore
identifies a candidate URL, not a certified full-application production
target. The active local commit `8bbc4bb611dd5826b446ca672c97a98a79a1694d`
and branch `codex/politipiks-2026-live-contract` are not present in the one
authorized `git ls-remote origin` result; remote `main` and `HEAD` resolve to
`88fe9121a3b3e4ad5a50776aed7f96e4519463ec`.

No production application version or rollback target is known, so no deploy,
rollback, Hosting configuration change, push, merge, Cloud Run query, or
additional remote call is authorized. Durable evidence: [G8.3C0 application
deployment target discovery](status/g8-3c0-app-deployment-target.md).

## G8.3C1 static Hosting readiness

G8.3C1 status: **locally certified on 2026-08-07; not deployed**. The nested
selector-aware app now has a deterministic browser-only `hosting-dist` build
for candidate Hosting site `politipiks`, with SPA deep-link fallback, hashed
asset caching, no-cache `index.html`, and an artifact guard that rejects server
bundles, source maps, credentials, private files, unsafe flags, Gemini/API
references, and secret-shaped assignments. The existing named-database
Firestore rules configuration is unchanged.

The user-facing app no longer triggers global refresh, Gemini enrichment, or
candidate-vote `/api` fetches. It reads certified Firestore catalog/research,
shows explicit unavailable evidence when canonical records are absent, and
states that official refreshes are handled by the controlled data pipeline.
Catalog, evidence, authentication, league, and pick workflows remain covered
by the existing emulator/browser checks; federal races remain browseable but
non-pickable, while the 14 selector-gated California measures remain pickable
under active v2 fixtures.

Durable evidence: [G8.3C1 static Hosting readiness](status/g8-3c1-static-hosting-readiness.md).
Nested implementation commits: `c63596e`, `f96b8dc`. No Hosting deployment,
selector change, rules deployment, production read/write, rollback, deletion,
merge, or push occurred. The next production Hosting action requires separate
authorization and an approved target/release receipt.

## G8.3C2 guarded Hosting preview deployment

G8.3C2 status: **preview deployed on 2026-08-07; read-only smoke passed after
local harness repair**. The one authorized read-only channel list showed only `live`, then
the exactly-once guarded deployment created preview channel
`g8-3c2-20260807` for site `politipiks` and emitted
`https://politipiks--g8-3c2-20260807-x6meubc8.web.app`, expiring after one day.
The certified artifact was 3 files / 1,339,389 bytes with deterministic digest
`94416db6b4673aafe3364dfef4d63555d1ca9c06ee6b5973521822e3ae7c116b`.

The initial bounded smoke attempt failed before creating a browser because its
inline Node stdin program used CommonJS `require` while Node evaluated the
program as an ES module. Under recovery authorization
`g8.3c2r-preview-smoke-2026-08-07`, the reusable ESM harness repair was committed
as nested `e926a20`. The required local gates passed, followed by exactly one
remote invocation at `2026-08-07T19:47:05.668Z`:

`node scripts/hosting-preview-smoke.mjs --base-url https://politipiks--g8-3c2-20260807-x6meubc8.web.app`

It exited `0`: `/`, `/races`, and `/leagues` each rendered and reloaded;
one hashed JS and one hashed CSS asset were served successfully across 12
asset responses; 23 Firestore read/listen requests occurred; and 0 API/runtime,
authentication, Firestore-write, unexpected-network, page, or console errors
were recorded. The smoke used one browser/context and performed no clicks,
sign-in, submissions, or writes. Preview content remained commit `f96b8dc` with
artifact digest
`94416db6b4673aafe3364dfef4d63555d1ca9c06ee6b5973521822e3ae7c116b`; live
site, selector, Firestore data, rules, Hosting configuration, and deployment
state were unchanged. No retry, redeployment, deletion, rollback, merge, or
push occurred. Durable evidence: [G8.3C2 Hosting preview smoke recovery
record](status/g8-3c2-hosting-preview.md).

## G8.3C3 production Hosting deployment

G8.3C3 status: **completed with one authorized live deployment and one passing
read-only live smoke on 2026-08-07**. The existing `politipiks:live` channel was
cloned once to rollback channel `g8-3c3-rollback-20260807`, whose emitted URL
returned HTTP 200. The exact certified artifact remained 3 files / 1,339,389
bytes with digest
`94416db6b4673aafe3364dfef4d63555d1ca9c06ee6b5973521822e3ae7c116b` and was
deployed to `https://politipiks.web.app` once from app commit `f96b8dc`.

The committed ESM harness was extended in nested commit `4135ebb` to require
explicit `--live-target` for the exact live host while preserving preview and
loopback support. The one live smoke rendered and reloaded `/`, `/races`, and
`/leagues`, served 12 hashed assets, recorded 26 Firestore reads, and recorded
zero API/runtime, authentication, Firestore-write, unexpected-network, page,
console, or navigation errors. The selector remained unchanged and conditional
rollback did not run. Firebase emitted no separate version identifier in the
deploy output. Durable evidence: [G8.3C3 production Hosting deployment](status/g8-3c3-production-hosting-deployment.md).

The focused deployment runbook now records the exact operation ledger and
rollback boundary in [G8.3C3 runbook receipt](status/g7-3-release-rollback-runbook-readiness.md). No selector activation,
Firestore document write, rules deployment, channel deletion, merge, or push
occurred.

## G8.4B canonical v2 catalog activation

G8.4B is **fail-closed after one authorized production apply attempt on
2026-08-08**. The required branch/HEAD, focused cleanliness, twice-identical
Firebase-free preflight, credentials, local gates, emulator gates, and generated
identity/count/digest arrays passed. The apply array was generated from the
manifest and certified bundle with identity schema `2`, shadow source
`295466ccc52ccd4d6ad4f1dfb444d48410b92910`, activation implementation
`e34e975a1994d2883e37646a42184dc9b4cd0c31`, and 3,352 content documents.

The apply invocation exited `1` without reporting `status=active`, so the
authorized sequence stopped. Verify-only, live smoke, and conditional rollback
did not run; no retry or additional production read is authorized. The final
known selector state is unknown/unverified and requires a new explicit release
authorization before follow-up. Durable evidence: [G8.4B production catalog
activation attempt](status/g8-4b-production-catalog-activation.md).

## G8.4BR0 post-failure state audit

G8.4BR0 implemented and locally certified a selector-first, read-only auditor
for the consumed G8.4B attempt. Its generated production array was derived from
the current manifest, certified bundle, and committed implementation identity;
the twice-run Firebase-free preflight was identical and all required local
gates passed. The one authorized production invocation then exited `1` at the
Windows launcher boundary without stdout/stderr or an audit result. A harmless
reproduction returned `EINVAL` before launching its child. No selector or
content path was read, and production state remains unknown/unverified. No
retry, activation, verify-only, smoke, rollback, deployment, deletion, or push
is authorized. Durable evidence: [G8.4BR0 post-failure state audit](status/g8-4br0-post-failure-state-audit.md).

## G8.4BR2 corrected production state audit

G8.4BR2 stopped before production on 2026-08-09. Its single Firebase-free
preflight child exited `0` and passed the zero-read/write, direct Node/tsx,
51-argument, five-unique-receipt, 3,352-path, and namespace-digest checks, but
the direct UTF-8 output SHA-256 was
`2f5604e13d3b40a894eb5191016bfc48160f401ac3ca94c73fc9b18a4076b2f2`
rather than the required
`a21b518c0cb6015196c2ed4e25c73769adebc1d67e5372ec63bc283c3cd438bd`.
The preflight was not rerun and the production launcher was not invoked, so
there were zero production reads and the selector/content state remains
unknown/unverified. Durable evidence: [G8.4BR2 production state-audit preflight
stop](status/g8-4br2-production-state-audit.md).

## G8.4BR2R canonical-receipt-guarded production state audit

G8.4BR2R consumed its one authorized read-only production audit invocation on
2026-08-09. The committed preflight ran once and passed its versioned canonical
receipt gate: schema `g8-4br2-1-state-audit-preflight/v1`, digest
`c65879b157b9c6ae6b11d6ff8f109e29fc1f0ea5463b67396e26028e2162401b`,
Firebase initialization false, reads/writes `0/0`, `shell:false`, 51 ordered
production arguments, 5/5 unique receipts, 3,352 content paths, and namespace
digest `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`.

The production launcher and auditor child both started and exited `1`.
Launcher stdout contained valid JSON and launcher stderr was absent; the auditor
returned no JSON and had stderr present. Consequently, production read counts,
selector state/contract/metadata, and content counts/digests/conflicts remain
unknown/unverified rather than zero. The authorization is consumed, and no
retry, follow-up read, verify-only command, activation, resume, smoke, rollback,
deployment, deletion, write, push, or branch change occurred. Durable evidence:
[G8.4BR2R production state audit](status/g8-4br2r-production-state-audit.md).

## G8.4BR3A structured audit failure readiness

G8.4BR3A is locally certified with no production authorization. BR2R remains
immutable: its launcher and auditor child started/exited `1`, raw auditor
stderr was not retained, and the exact auditor error plus selector/content
state are unrecoverable/unknown from preserved evidence. The repair does not
infer a historical cause or retry the consumed audit.

The auditor now emits the versioned
`g8-4br3a-state-audit-result/v1` contract for every handled exit, including
argument, identity, environment, bootstrap, selector, exact-path, and
completion phases. Results include stable sanitized error codes, secret-safe
environment findings, selector-first read accounting, exact-path bounds, and
explicit unknown/not-attempted outcomes. Fault-injection, sanitization,
exact-argument offline replay, and alternate-port emulator coverage passed.

The canonical semantic preflight receipt is
`g8-4br3a-state-audit-preflight/v1`, digest
`08b8c556993b69de7142b38c92b74877cea6d5bb789dcfeacb12949a53e80c8d`, tied to
focused source identity `041c017e0483318354e44dd75a3866c9771fd763`, with 51
arguments, 3,352 bounded paths, Firebase initialization false, and reads and
writes both zero. Durable evidence:
[G8.4BR3A structured audit failure readiness](status/g8-4br3a-structured-audit-failure-readiness.md).

No production retry, selector operation, activation, resume, smoke, rollback,
deployment, deletion, push, branch change, or G8.4BR3B authorization occurred.

## G8.4BR3B production structured state audit

G8.4BR3B consumed its one authorized read-only production auditor invocation on
2026-08-10. The committed preflight ran once and passed the canonical
`g8-4br3a-state-audit-preflight/v1` receipt gate with digest
`08b8c556993b69de7142b38c92b74877cea6d5bb789dcfeacb12949a53e80c8d`,
focused audit identity `041c017e0483318354e44dd75a3866c9771fd763`, activation
plan digest `9adde6e0a909b0950d0930d74d2942847916736db40abc4afc8b6b76fdee35d5`,
namespace digest `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`,
`shell:false`, 51 ordered arguments, 5/5 unique receipts, 3,352 bounded content
paths, Firebase initialization false, and reads/writes `0/0`.

The exact preflight-derived direct auditor attempted, started, and exited once
with exit `0`. Its `g8-4br3a-state-audit-result/v1` result completed with
Firebase initialization/bootstrap succeeded and one successful selector-first
read. `catalogActivations/canonical-2026` was absent, with null contract and
not-applicable metadata. Therefore no exact content paths were attempted: all
3,352 are explicitly not attempted, and content exact/missing/conflicting
counts are not applicable rather than zero. The structured safe next action is
to separately authorize a fresh v2 activation recovery.

The authorization is consumed. No retry, second read, collection scan,
verify-only command, activation, resume, smoke, rollback, deployment, deletion,
write, push, or branch change occurred. Durable evidence:
[G8.4BR3B production structured state audit](status/g8-4br3b-production-structured-state-audit.md).

## G8.4BR4A structured activation-recovery readiness

G8.4BR4A is locally certified at focused implementation identity
`cfff2011ed72f560f531983ce4291237479fa642`. It preserves immutable shadow
source identity `295466ccc52ccd4d6ad4f1dfb444d48410b92910`, the existing
`g8-3a-v2-activation/v1` selector contract, selector-only rollback, all
certified digests, and exactly 3,352 content documents.

Apply, verify-only, and rollback now emit the sanitized structured
`g8-4br4a-activation-result/v1` contract. Apply remains fail-closed: validate
shadow → create compatible pending selector → create-only compatible promotion
→ exact verification → active selector. Conflicts are never overwritten;
known mid-batch failures retain auditable pending state and compatible content
can resume only under a later separate authorization.

The canonical `g8-4br4a-activation-preflight/v1` receipt digest is
`e85147b793b07f7a3576091c482de6f8840f050d98cccf1dfb93e4297740db7e`.
Two post-commit preflights emitted byte-identical output and derived direct
`process.execPath` plus repository-resolved `tsx/cli` invocations with
`shell:false`, 47 ordered arguments per mode, four distinct future G8.4BR4B
receipt labels, Firebase initialization false, reads/writes `0/0`, namespace
digest `ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`,
and activation plan digest
`9f8827ac20dd9acfdcb0c6dd7beff8df30b767b504bbbe0fb366711b0ba3ca49`.

Focused unit, G8.3A compatibility, alternate-port activation emulator, BR3A
structured audit/unit/emulator, BR1/BR2 launcher/receipt, G8.2 shadow
unit/emulator, lint, build, and diff gates passed. Durable evidence:
[G8.4BR4A structured activation-recovery readiness](status/g8-4br4a-activation-recovery-readiness.md).

No G8.4BR4B authorization was created or used. No network call or production
read, write, activation, verify-only, rollback, smoke, deployment, deletion,
push, or branch change occurred. Every future production operation requires
its own fresh exact authorization and is consumed by its first invocation
regardless of outcome.

## G8.4BR4B guarded production activation recovery

G8.4BR4B consumed its one authorized production apply invocation on
2026-08-10. The single committed preflight passed the canonical
`g8-4br4a-activation-preflight/v1` receipt gate with digest
`e85147b793b07f7a3576091c482de6f8840f050d98cccf1dfb93e4297740db7e`,
focused activation identity `cfff2011ed72f560f531983ce4291237479fa642`,
activation plan digest
`9f8827ac20dd9acfdcb0c6dd7beff8df30b767b504bbbe0fb366711b0ba3ca49`,
namespace digest
`ada9574c279c159f9ec662f503164fc45b93d5c07644233e53dbbb6e67b93af0`,
47 ordered arguments per operation, four distinct G8.4BR4B receipts,
`shell:false`, and Firebase initialization/reads/writes/commands
`false/0/0/0`.

The exact preflight-derived apply attempted, started, and exited once with
exit `1` and valid `g8-4br4a-activation-result/v1` JSON. Certified-shadow
verification and Firebase initialization/bootstrap succeeded. The result
contract then accounted for 3,353 successful selector/destination reads: one
selector read observed `catalogActivations/canonical-2026` absent, then all
3,352 exact destination paths were inspected before writes. It does not
separately enumerate the earlier shadow-store reads. Content validation found
0 exact, 2,494 missing, 858 conflicting, and 0 unknown documents, so the
executor failed closed with `CONTENT_CONFLICT` before mutation. Selector
writes, content writes, and write batches were all 0 attempted.

The apply authorization is consumed and cannot be retried. Because apply did
not complete active/exact, the conditional verify-only command was not invoked
and its receipt remains absent. No retry, follow-up production read, state
audit, smoke, rollback, deployment, deletion, push, or branch change occurred.
Durable evidence:
[G8.4BR4B guarded production activation recovery](status/g8-4br4b-production-activation-recovery.md).

## G8.4BR5A conflict analysis readiness

G8.4BR5A is locally certified at focused implementation identity
`b9caf95ae47f856a1ed3282ab193c631bbe2ca85`, while activation identity
`cfff2011ed72f560f531983ce4291237479fa642` and the certified content remain
unchanged. It adds a strict private conflict-snapshot contract, Firebase-free
offline comparison and classification, and unresolved per-path resolution
planning for the 858 conflicts reported by the consumed G8.4BR4B apply.

The future capture surface is fail-closed to one selector read plus exactly
3,352 manifest-derived document reads, with zero writes, collection scans, or
retries. Full actual conflict documents are retained privately as rollback
evidence; production-only and protected values prevent automatic replacement,
and every disposition remains unresolved until explicit approval. The final
Firebase-free preflight ran twice with byte-identical 7,577-byte output and
canonical digest
`b220c4aeedf0d7ab3922dd73dd32afa7c4ea737706298f5393e74cdaba8a1b1f`.

Focused tests, deterministic offline replays, the mixed-state emulator,
BR4A/BR3A activation and audit regressions, G8.2 shadow/bundle regressions,
TypeScript, lint, build, and diff gates passed. No production capture, network
operation, read, write, replacement, deletion, activation, rollback, push, or
branch change occurred, and no G8.4BR5B authorization was created. Durable
evidence: [G8.4BR5A conflict analysis readiness](status/g8-4br5a-conflict-analysis-readiness.md).

## G8.4BR5B production conflict capture

G8.4BR5B consumed its one authorized production capture on 2026-08-10. The
single direct-Node preflight matched canonical digest
`b220c4aeedf0d7ab3922dd73dd32afa7c4ea737706298f5393e74cdaba8a1b1f`,
then its exact 28-element launcher read the absent selector and all 3,352
manifest-derived destination paths once. The capture exited `0`, performed
3,353 reads, zero writes and zero collection scans, and created a complete
validated 35,148,779-byte ignored snapshot with SHA-256
`425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3`.

The bounded observation matched BR4B at 0 exact, 2,494 missing, 858
conflicting, and 0 unknown documents. All 858 conflicts were substantive, had
protected and production-only differences, retained complete rollback
evidence, remained unresolved, and had `safeToReplace:false`. The selector and
counts therefore showed no drift from BR4B.

The required offline analysis and two replay processes each exited `1` with
no JSON and identical stderr hashes. Their Firebase-import, credential-load,
network, comparison, and replay-equality evidence is unknown/unverified. The
operator runner launched all three offline commands before checking the first
nonzero result; this local control-flow defect is recorded, but no second
production operation occurred. The capture authorization is consumed and
must never be retried. Durable evidence:
[G8.4BR5B production conflict capture](status/g8-4br5b-production-conflict-capture.md).

## G8.4BR5C offline conflict replay recovery

G8.4BR5C is **locally certified on 2026-08-10; no production operation was
performed**. The preserved BR5B snapshot remains byte-identical at 35,148,779
bytes with SHA-256
`425a194c25432ba3fe4f91363f217bfe37adc5246ddf6e74b9aac89d587369c3`.
The fail-fast offline runner completed analysis and two verified replays with
exits `0/0/0`; the verified report outputs are byte-identical at SHA-256
`88fa9c80f01c6126ef5747e0e6f5c62e26aa6ad8099e69b2d8582567552f0a8d`,
with Firebase import, credentials, network requests, and production operations
all zero.

The proxy-contaminated emulator stop was recovered by stripping HTTP, HTTPS,
and ALL proxy variables only from emulator child environments and setting the
loopback no-proxy allowlist, while leaving the offline runner's blackholed
network proof unchanged. The mixed-conflict gate and four regression emulator
gates all passed once on `demo-no-project`, followed by focused unit, lint,
build, and diff gates. The state remains 0 exact, 2,494 missing, 858
substantive unresolved conflicts, 0 unknown, and `safeToReplace=0`; no conflict
disposition, snapshot body, selector, or production document changed. Durable
evidence: [G8.4BR5C offline conflict replay recovery](status/g8-4br5c-offline-conflict-replay-recovery.md).

## G8.4BR6A offline conflict disposition planning

G8.4BR6A is **locally certified on 2026-08-12 and not ready for an
executor; no production operation was performed**. A versioned offline-only
planner validated eight local lineage artifacts, rebuilt the certified bundle
at semantic digest
`7b9f6a8dc89f7a86c8481aaf5fe46418fc47dbe5675846b63d5149b273e1c8a7`,
and produced one complete draft plan entry for each of the 858 conflicts with
no duplicates or omissions.

The plan deterministically merges 429 metrics documents while leaving 429
race documents unresolved. It records 55,032 pointer rules: 35,486
current-certified authoritative values, 7,615 existing values backed by a
validated source, 7,722 runtime metadata values, and 4,209 candidate-identity
conflicts. Unsupported production-only, ambiguous, and conflicting-lineage
counts are zero. Because 4,209 policy conflicts remain, `readyForExecutor` is
`false`; 36 smallest digest-only evidence batches cover all 429 unresolved
paths.

Two independent builds and an isolated verified replay exited `0/0/0`. The
62,232,012-byte private plans were byte-identical at SHA-256
`bbb251ff0e30a4624c2e649baeda69d5b3c721ef46075ccb6a23e68c57fcccbd`;
the 19,979-byte reports were byte-identical at SHA-256
`8eeb876f30ebdd4189d3483115a918ba942cb461680c5dc0e22269c0306d640b`.
The plan digest is
`15f456e459c18fd0db51275b0c22de7b1fe5f9fb6b3dca841f111b9469c28cd9`.
Firebase import, credential loads, network requests, and production operations
were all zero, and the preserved snapshot remained byte-identical at its
required 35,148,779 bytes and SHA-256. Focused, regression, TypeScript, lint,
build, five alternate-port emulator, and diff gates all passed. Durable
evidence: [G8.4BR6A offline conflict provenance and draft-disposition plan](status/g8-4br6a-offline-conflict-disposition-plan.md).

## G8.4BR6B offline FEC candidate identity equivalence

G8.4BR6B is **locally certified on 2026-08-12 and remains not ready for an
executor; no disposition or production operation was performed**. A new
versioned offline-only equivalence contract derives candidate identity from the
same valid, nonempty FEC candidate ID only when it is unique on both sides of a
canonical race. It cross-checks the certified current bundle, approved
publication mapping, canonical seat/cycle/contest, official-FEC research
baseline, and normalized finance evidence where present. Candidate order,
name, party, incumbent flag, and Bioguide ID remain diagnostic-only.

The planner derived, rather than hard-coded, 2,097 accepted FEC pairs across
425 fully resolved races. Seven pairs were rejected across four remaining
races: four duplicate actual FEC IDs and three certified candidates without a
unique actual counterpart. Invalid IDs, reused IDs, seat mismatches, and
contradictory evidence are all zero. Exact next evidence batches identify the
four races by digest only.

All 858 dispositions were rebuilt. The revised plan deterministically merges
854 paths and leaves four race paths unresolved/no-op. Seven identity-policy
conflicts remain; unsupported production-only, conflicting-lineage, and
ambiguous-lineage blockers remain zero. Reproducible output and complete
rollback evidence are present, but `readyForExecutor` remains `false`.

Two independent builds and `--verify-replay` exited `0/0/0`. The private plans
are byte-identical at 81,061,814 bytes and SHA-256
`1f0b71444b2958ab012a03fde3b74f8603df4035f843a2363361d584a7b6752e`;
the revised plan digest is
`7b5da128cad3ee688949209643ab63626e2a70a18b6765f8a57b9956f162ab48`.
The complete focused/regression/TypeScript/lint/build/emulator/diff ledger
passed once, the snapshot remained byte-identical, and Firebase import,
credentials, network requests, production operations, and executed
dispositions were all zero. Durable evidence:
[G8.4BR6B offline FEC candidate identity equivalence](status/g8-4br6b-fec-candidate-identity-equivalence.md).

## G8.4BR6CR final identity resolution recovery

G8.4BR6CR is **locally certified on 2026-08-13 with the final plan ready for an
executor; no executor, disposition, or production operation was authorized**.
The original failed BR6C receipt was preserved byte-for-byte.
Its failure was reproduced with the same zero stdout bytes and 1,027-byte
stderr digest, then safely classified as
`BR6C_EXCEPTION_OUTPUT_NOT_CERTIFIED` without exposing raw stderr or private
candidate/document content.

The root cause was limited to the four validated exceptional races: generic
BR6B drafting retained three stale `/updatedAt/*` runtime pointers after the
identity blockers were cleared, producing a hybrid output instead of a
complete certified replacement. A public-seam regression test was observed
RED before a fail-closed correction reclassified exactly those three pointers
for exceptional replacements. GREEN and the full diagnostic build now resolve
CA-40, FL-11, and TX-22 through validated one-to-one corrections and NJ-08
through only its approved many-to-one alias merge.

The resulting plan covers 858/858 paths with four certified replacements, 854
deterministic merges, zero unresolved paths, zero policy conflicts, complete
rollback evidence, reproducible outputs, and `readyForExecutor=true`. New
`g8-4br6cr-*` no-clobber diagnostic/build/replay/final receipts retain only
sanitized phase/code/hash/count evidence. Firebase import, credentials,
network requests, production operations, and executed dispositions remain
zero. All 21 local gates passed once. The authorized final two independent
builds and one `--verify-replay` exited `0/0/0`; every report and all four
plans, including the isolated replay child, are byte-identical. Durable evidence:
[G8.4BR6CR final identity resolution recovery](status/g8-4br6cr-final-identity-resolution-recovery.md).

## G8.4BR7A independent executor-readiness review

G8.4BR7A is **independently PASS on 2026-08-13 for use of the BR6CR plan only
as input to future local-executor design; it is not production authorization**.
A separate Firebase-free verifier treats the BR6 artifacts as hostile JSON and
does not import or call any BR6 planner. The committed range from `1715985`
through `683b518` was reviewed for weakened guards, hidden assumptions, stale
runtime metadata, unsafe merges, and implicit operations; no P0/P1 finding
remains.

The verifier independently derived all 858 paths from the certified activation
source bundle and immutable snapshot: 429 races and 429 metrics. It proved
2,097 unique same-race FEC pairs across 425 regular races, all eight G2.1
exception mappings, three one-to-one exception races, and NJ-08's sole
two-alias many-to-one group. It reconstructed all 854 deterministic merges and
four complete certified replacements, verified 858 rollback documents, and
found zero unresolved provenance, policy conflicts, protected-field changes,
unsafe timestamps, or executor-operation fields.

Independent recomputation matched plan digest
`ecc155e0e08a4ac599593f70041ee53d806b48a149ac375c7b2c901d4c76dd23`,
outputs digest
`0ac958cd0dbcf43cba20ef1b64ab7957fa4255dc76a79efb71306146957f84e2`,
and rollback digest
`80241286ec7cfb0e45844adbf2758883e0c8d8ec8d2b98c26b3db5f66986529d`.
Focused tamper, strict codec, TypeScript, lint, build, and diff gates passed.
The one final invocation ran two independent verifier passes and one isolated
replay at `0/0/0`; all three 2,543-byte receipts are byte-identical at SHA-256
`6b84d9fe141cd0c992ef8262a93cc0baaedc223d2ddf99011240eb61ec8ad491`.
Firebase import, credentials, network requests, production operations, and
executed dispositions remain zero. Durable evidence:
[G8.4BR7A independent executor-readiness review](status/g8-4br7a-independent-executor-readiness-review.md).
