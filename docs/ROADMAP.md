# Project Roadmap & Technical Debt

This document tracks future features, technical debt, and required enhancements for the Politipiks platform.

## Recently delivered (July 2026 data-pipeline build-out)

- **Real Bill Text Ingestion** — `scripts/ingest-bills.ts` pulls real bills, status
  history, sponsors, hearings, and text versions from OpenStates; the L2 Redline Diff
  Workbench now compares actual published revisions (states that publish only PDF
  versions degrade to a notice). See `docs/data-pipeline.md`.
- **Real contest metrics** — `scripts/build-contest-metrics.ts` writes historical
  prior-cycle results (MEDSL), Census demographics, and turnout to
  `contestMetrics/{raceId}` (the path the research drawer actually reads).
- **Free-source research enrichment** — FEC finance, Congress.gov member and
  legislation records, and official House/Senate roll-call feeds populate the
  research drawer without generated narratives.
- **2026 live cycle** — FEC ingest source for federal races; official-source,
  human-reviewed curated file for governors and ballot measures; leagues and the
  browse page are now cycle-scoped.

## Q3/Q4 Priority Features

- **Graph Topology Expansion**: Consider expanding the default neighborhood size or adding dynamic lazy-loading for 3+ degree traversal in the Expert Forensics (Level 3) tier. Donor/`FUNDED_BY` edges remain deferred — free state campaign-finance coverage is poor; the graph currently shows sponsor/committee relationships.
- **Activity Feed**: Build out the main user activity dashboard feed to complete the core navigation loop.
- **PDF bill-text extraction**: Add a PDF text extractor to `ingest-bills` so redlines work in states that only publish PDF versions.
- **Advanced PIP-S telemetry**: `survivalProbability` is a stage-based heuristic; SIS/spillover/camouflage scores need real models before they render for ingested bills (the UI hides absent signals).

## Technical Debt

- **Mock Data Cleanups**: Remove remaining local mocked arrays (`src/constants/electionData.ts` seed contests) and fully rely on the Firestore seed data.
- **Cloud Functions**: Migrate client-side metric aggregation logic to Firebase Cloud Functions for performance scaling.
- **Polling data**: intentionally absent (no free API); revisit if a paid source is approved.
