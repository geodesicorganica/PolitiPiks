# Free-Source Data Pipeline

Politipiks does not require an LLM for contest availability or research. The
production contract is source-backed facts, transparent missing fields, and a
link to the underlying public record.

## Implemented sources

| Source | Endpoint/feed | Destination | Refresh |
| --- | --- | --- | --- |
| FEC candidates | `/v1/candidates/` | `races/*` | weekly |
| FEC filing + finance | `/candidate/{id}/committees/`, `/candidate/{id}/totals/`, `/schedules/schedule_e/by_candidate/` | candidate `campaign` and `campaignFinance` buckets | weekly, resumable |
| Congress.gov members | `/member/{bioguideId}`, sponsored and cosponsored legislation | candidate identity, record, activity, service history | weekly |
| Congress.gov House votes | `/house-vote/{congress}/{session}` and `/members` | candidate `voteRecord` bucket | weekly |
| Senate.gov votes | vote-menu and individual roll-call XML | candidate `voteRecord` bucket | weekly |
| Census | ACS 5-year profile + Decennial DHC | `contestMetrics/*` demographics and turnout denominator | annual |
| MEDSL | official result CSV/ZIP feeds | historical contests/results/metrics | after certification |
| OpenStates | `/bills`, `/events` plus source-linked bill versions | PIP-S entities, actions, sponsors, redlines, hearings | daily/weekly shards |
| Google Civic | `/elections`, `/voterinfo` | protected, non-persistent lookup response | on demand |

The state-provider interface lives in
`ingest/src/sources/stateElectionProvider.ts`. A state is not considered
automated until its provider has an official HTTPS machine-readable endpoint,
fixtures, and a certified-ballot capability declaration.

## Required commands

Use direct `tsx` commands on this Windows workstation so npm does not strip
flags. `.env.local` is loaded automatically by both root scripts and ingest CLI
commands.

```powershell
# Federal contest refresh (curated funded scope)
npx tsx ingest/src/seed-fec2026.ts --candidate-scope funded --dry-run
npx tsx ingest/src/seed-fec2026.ts --candidate-scope funded

# Wider review report; do not seed until reviewed
npx tsx ingest/src/seed-fec2026.ts --candidate-scope all-filed --state GA --dry-run

# Detect stale impossible FEC districts seeded by older code (read-only first)
npx tsx scripts/prune-invalid-federal-races.ts --year 2026 --state GA

# Source-backed candidate enrichment
npx tsx scripts/enrich-fec-finance.ts --year 2026 --state GA --limit 10 --max-calls 30 --dry-run
npx tsx scripts/enrich-fec-finance.ts --year 2026 --state GA --limit 10 --max-calls 30
npx tsx scripts/enrich-structured.ts --year 2026 --state GA
npx tsx scripts/enrich-roll-calls.ts --year 2026 --state GA --max-votes 20 --dry-run
npx tsx scripts/enrich-roll-calls.ts --year 2026 --state GA --max-votes 20

# State legislation without AI
npx tsx scripts/ingest-bills.ts --states GA --max-bills 25 --dry-run
npx tsx scripts/ingest-bills.ts --states GA --max-bills 25

npm run test-free-sources
npm run verify-contests
```

FEC finance normally performs three API calls per candidate. `--max-calls`
makes large runs resumable within an hourly allocation. A research document is
still written when no processed totals exist, so users receive an official FEC
source and an honest availability statement rather than a fabricated zero. A
missing FEC filing profile can be backfilled from the stored candidate record with
zero additional calls when the finance snapshot is still fresh.

## State election coverage

The five-state first wave remains adapter work because their official election
offices do not share one national schema:

| State | Current mode | Required adapter output |
| --- | --- | --- |
| CA | official-site/manual review | governor candidates, certified measures, text and fiscal analysis URLs |
| TX | official-site/manual review | governor candidates, certified measures and source URLs |
| NY | official-site/manual review | candidate lists, ballot propositions and official text |
| FL | official-site/manual review | candidate tracking, certified ballot and amendment details |
| GA | official-site/manual review | qualifying candidates, certified measures and official text |

Until a provider is implemented, `data/2026/curated-contests.json` is the human
gate. Each entry must carry an official source URL and qualification status. An
empty discovery file is never seedable.

## Intentionally visible gaps

- No nationwide free certified feed for governors or statewide measures.
- FEC filing status is not proof that a candidate is on a state ballot.
- Campaign platforms and policy positions have no universal official API.
- State campaign-finance and measure support/opposition data are fragmented.
- Fiscal effects are absent unless an official source supplies a fiscal note.
- Polling remains absent.

These gaps stay empty in the UI. They are not filled by generated prose.
