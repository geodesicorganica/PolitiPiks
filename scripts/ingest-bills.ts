/**
 * ingest-bills.ts
 *
 * Ingests real state legislative bills from the OpenStates v3 API into the
 * PIP-S Firestore collections that the State Tab reads:
 *
 *   entities/{billNodeId}                — BILL NodeEntity (+ official abstract/title)
 *   entities/{billNodeId}/status_logs/*  — standardized status history from actions
 *   entities/{billNodeId}/versions/*     — bill text versions (extracted where the
 *                                          state publishes HTML/plain text; PDF-only
 *                                          versions keep metadata + URL)
 *   entities/{sponsorNodeId}             — POLITICIAN entities for sponsors
 *   edges/*                              — SPONSORED_BY sponsor→bill edges
 *   hearings/*                           — upcoming committee hearings from events
 *
 * Usage:
 *   npm run ingest-bills -- [--states CA,TX,NY,FL,GA] [--max-bills 25]
 *     [--skip-events] [--dry-run]
 * Env: OPENSTATES_API_KEY (required; free at https://openstates.org/accounts/signup/),
 *      PROJECT_ID / FIREBASE_SERVICE_ACCOUNT / FIRESTORE_DATABASE_ID
 *
 * The free OpenStates tier is rate-limited (~1 req/sec with a daily cap), so this
 * script paces itself and defaults to a bill cap per state. Run per-state shards
 * on different days to scale beyond the pilot.
 */
import process from 'node:process';
import { FieldValue } from '@google-cloud/firestore';
import { NodeEntity, StandardizedStatus } from '../src/types';
import { getArg, hasFlag, bootstrapFirestore } from './lib/firestoreCli.js';

function slugId(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'unknown';
}

// -----------------------------------------------------------------------------
// OpenStates API
// -----------------------------------------------------------------------------

const OPENSTATES_API = 'https://v3.openstates.org';
const API_SPACING_MS = 1300; // free tier ~1 req/sec

type OsBill = {
  id: string;
  identifier: string;
  title: string;
  session: string;
  classification?: string[];
  latest_action_date?: string;
  latest_action_description?: string;
  openstates_url?: string;
  abstracts?: Array<{ abstract?: string }>;
  actions?: Array<{ description?: string; date?: string; classification?: string[]; organization?: { name?: string } }>;
  sponsorships?: Array<{ name?: string; primary?: boolean; person?: { id?: string; name?: string } }>;
  versions?: Array<{ note?: string; date?: string; links?: Array<{ url?: string; media_type?: string }> }>;
};

type OsEvent = {
  id: string;
  name?: string;
  start_date?: string;
  status?: string;
  location?: { name?: string };
  agenda?: Array<{ description?: string; related_entities?: Array<{ name?: string; entity_type?: string }> }>;
};

let lastApiCall = 0;
async function osGet<T>(path: string, apiKey: string): Promise<T> {
  const wait = lastApiCall + API_SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastApiCall = Date.now();
  const resp = await fetch(`${OPENSTATES_API}${path}`, { headers: { 'X-API-KEY': apiKey, accept: 'application/json' } });
  if (resp.status === 429) throw new Error('OpenStates rate limit hit (429) — daily cap reached; re-run tomorrow or shard by state.');
  if (!resp.ok) throw new Error(`OpenStates ${resp.status} for ${path}`);
  return (await resp.json()) as T;
}

async function fetchBills(state: string, maxBills: number, apiKey: string): Promise<OsBill[]> {
  const bills: OsBill[] = [];
  let page = 1;
  const perPage = 20; // max allowed with includes
  while (bills.length < maxBills) {
    const path = `/bills?jurisdiction=${encodeURIComponent(state)}&sort=latest_action_desc` +
      `&include=abstracts&include=actions&include=sponsorships&include=versions` +
      `&per_page=${perPage}&page=${page}`;
    const json = await osGet<{ results: OsBill[]; pagination?: { max_page?: number } }>(path, apiKey);
    bills.push(...json.results);
    const maxPage = json.pagination?.max_page ?? page;
    if (page >= maxPage || json.results.length === 0) break;
    page += 1;
  }
  return bills.slice(0, maxBills);
}

async function fetchEvents(state: string, apiKey: string): Promise<OsEvent[]> {
  try {
    const json = await osGet<{ results: OsEvent[] }>(
      `/events?jurisdiction=${encodeURIComponent(state)}&per_page=20`,
      apiKey,
    );
    return json.results;
  } catch (err) {
    console.warn(`[events] ${state}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Status + telemetry mapping
// -----------------------------------------------------------------------------

const STATUS_ORDER: StandardizedStatus[] = ['INTRODUCED', 'IN_COMMITTEE', 'FLOOR_VOTE', 'CROSS_CHAMBER', 'EXECUTIVE_ACTION', 'ENACTED', 'VETOED'];

function classifyAction(classifications: string[]): StandardizedStatus | null {
  const set = new Set(classifications);
  if (set.has('became-law') || set.has('executive-signature')) return 'ENACTED';
  if (set.has('executive-veto')) return 'VETOED';
  if (set.has('executive-receipt')) return 'EXECUTIVE_ACTION';
  if (set.has('passage')) return 'FLOOR_VOTE';
  if (set.has('reading-3')) return 'FLOOR_VOTE';
  if (set.has('committee-passage') || set.has('committee-passage-favorable')) return 'CROSS_CHAMBER';
  if (set.has('referral-committee')) return 'IN_COMMITTEE';
  if (set.has('introduction') || set.has('filing')) return 'INTRODUCED';
  return null;
}

/** Simple stage-based passage heuristic; honest about being a heuristic. */
function survivalProbabilityFor(status: StandardizedStatus | null): number {
  switch (status) {
    case 'ENACTED': return 1;
    case 'VETOED': return 0.05;
    case 'EXECUTIVE_ACTION': return 0.9;
    case 'CROSS_CHAMBER': return 0.65;
    case 'FLOOR_VOTE': return 0.5;
    case 'IN_COMMITTEE': return 0.3;
    case 'INTRODUCED': return 0.2;
    default: return 0.15;
  }
}

// -----------------------------------------------------------------------------
// Version text extraction
// -----------------------------------------------------------------------------

const MAX_VERSION_TEXT = 150_000; // stay far below the 1MB Firestore doc limit

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

async function extractVersionText(links: Array<{ url?: string; media_type?: string }>): Promise<{ text: string | null; truncated: boolean; url: string | null; mediaType: string | null }> {
  const preferred = ['text/plain', 'text/html', 'application/xhtml+xml'];
  const sorted = [...links].sort((a, b) => {
    const ai = preferred.indexOf(a.media_type ?? '');
    const bi = preferred.indexOf(b.media_type ?? '');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const link of sorted) {
    if (!link.url) continue;
    const mediaType = link.media_type ?? '';
    if (!preferred.includes(mediaType)) continue;
    try {
      const resp = await fetch(link.url, { headers: { accept: 'text/html,text/plain,*/*' }, signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) continue;
      const raw = await resp.text();
      const text = mediaType === 'text/plain' ? raw.trim() : htmlToText(raw);
      if (text.length < 200) continue; // likely an error page or stub
      const truncated = text.length > MAX_VERSION_TEXT;
      return { text: truncated ? text.slice(0, MAX_VERSION_TEXT) : text, truncated, url: link.url, mediaType };
    } catch {
      continue;
    }
  }
  const fallback = links.find((l) => l.url);
  return { text: null, truncated: false, url: fallback?.url ?? null, mediaType: fallback?.media_type ?? null };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

const DEFAULT_PILOT_STATES = ['CA', 'TX', 'NY', 'FL', 'GA'];

async function main() {
  const dryRun = hasFlag('--dry-run');
  const legacySummarize = hasFlag('--summarize');
  const skipEvents = hasFlag('--skip-events');
  const states = (getArg('--states') ?? DEFAULT_PILOT_STATES.join(','))
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const maxBills = parseInt(getArg('--max-bills') ?? '25', 10);

  const apiKey = process.env.OPENSTATES_API_KEY;
  if (!apiKey) {
    throw new Error('OPENSTATES_API_KEY is required. Get a free key at https://openstates.org/accounts/signup/');
  }
  if (legacySummarize) console.warn('--summarize is deprecated and ignored; only source-provided text is stored.');

  const { db } = bootstrapFirestore();

  let billsWritten = 0;
  let versionsWithText = 0;
  let sponsorsWritten = 0;
  let hearingsWritten = 0;

  for (const state of states) {
    const billNodeIdsByIdentifier = new Map<string, string>();
    console.log(`[${state}] Fetching up to ${maxBills} bills...`);
    const bills = await fetchBills(state, maxBills, apiKey);
    console.log(`[${state}] Got ${bills.length} bills.`);

    for (const bill of bills) {
      const billNodeId = slugId(`${state}-${bill.session}-${bill.identifier}`);
      billNodeIdsByIdentifier.set(bill.identifier.toUpperCase().replace(/\s+/g, ''), billNodeId);
      const actions = bill.actions ?? [];

      // Standardized status history.
      const statusLogs: Array<{ id: string; standardizedStatus: StandardizedStatus; rawStateStatus: string; assignedCommittee?: string; changedAt: string }> = [];
      let latestStatus: StandardizedStatus | null = null;
      for (const action of actions) {
        const standardized = classifyAction(action.classification ?? []);
        if (!standardized) continue;
        statusLogs.push({
          id: slugId(`${billNodeId}-${action.date}-${standardized}`),
          standardizedStatus: standardized,
          rawStateStatus: action.description ?? '',
          ...(action.organization?.name ? { assignedCommittee: action.organization.name } : {}),
          changedAt: action.date ?? new Date().toISOString(),
        });
        if (!latestStatus || STATUS_ORDER.indexOf(standardized) >= STATUS_ORDER.indexOf(latestStatus)) {
          latestStatus = standardized;
        }
      }

      // Version texts (latest two are what the redline needs; ingest all metadata).
      const versionDocs: Array<Record<string, unknown>> = [];
      const versions = bill.versions ?? [];
      for (let i = 0; i < versions.length; i++) {
        const v = versions[i];
        const wantText = i >= versions.length - 2; // extract text for the two latest only
        const extraction = wantText
          ? await extractVersionText(v.links ?? [])
          : { text: null, truncated: false, url: v.links?.find((l) => l.url)?.url ?? null, mediaType: v.links?.[0]?.media_type ?? null };
        if (extraction.text) versionsWithText += 1;
        versionDocs.push({
          id: slugId(`${billNodeId}-v${i}-${v.note ?? i}`),
          billNodeId,
          label: v.note ?? `Version ${i + 1}`,
          date: v.date ?? null,
          url: extraction.url,
          mediaType: extraction.mediaType,
          ...(extraction.text ? { text: extraction.text, textTruncated: extraction.truncated } : {}),
        });
      }

      const officialAbstract = bill.abstracts?.find((entry) => entry.abstract?.trim())?.abstract?.trim() ?? null;

      const entity: Record<string, unknown> = {
        name: `${bill.identifier}: ${bill.title}`.slice(0, 300),
        entityType: 'BILL',
        jurisdictionState: state,
        identifier: bill.identifier,
        session: bill.session,
        openStatesId: bill.id,
        sourceUrl: bill.openstates_url ?? null,
        latestActionAt: bill.latest_action_date ?? null,
        latestActionDescription: bill.latest_action_description ?? null,
        officialAbstract,
        createdAt: bill.latest_action_date ? `${bill.latest_action_date}T00:00:00Z` : new Date().toISOString(),
        telemetry: { survivalProbability: survivalProbabilityFor(latestStatus) },
        tldr: { whatChanges: officialAbstract ?? bill.title },
        updatedAt: new Date().toISOString(),
      };

      if (!dryRun) {
        const batch = db.batch();
        batch.set(db.doc(`entities/${billNodeId}`), entity, { merge: true });
        for (const log of statusLogs) {
          batch.set(db.doc(`entities/${billNodeId}/status_logs/${log.id}`), log, { merge: true });
        }
        for (const version of versionDocs) {
          batch.set(db.doc(`entities/${billNodeId}/versions/${version.id}`), version, { merge: true });
        }
        // Sponsors → POLITICIAN entities + SPONSORED_BY edges.
        for (const sponsorship of bill.sponsorships ?? []) {
          const sponsorName = sponsorship.person?.name ?? sponsorship.name;
          if (!sponsorName) continue;
          const sponsorId = sponsorship.person?.id ? slugId(sponsorship.person.id) : slugId(`pol-${state}-${sponsorName}`);
          batch.set(db.doc(`entities/${sponsorId}`), {
            name: sponsorName,
            entityType: 'POLITICIAN',
            jurisdictionState: state,
            ...(sponsorship.person?.id ? { openStatesPersonId: sponsorship.person.id } : {}),
            source: 'openstates',
            verificationLevel: 'derived',
            createdAt: new Date().toISOString(),
          }, { merge: true });
          batch.set(db.doc(`edges/${slugId(`${sponsorId}-sponsors-${billNodeId}`)}`), {
            sourceId: sponsorId,
            targetId: billNodeId,
            edgeType: 'SPONSORED_BY',
            weight: sponsorship.primary ? 1 : 0.5,
          }, { merge: true });
          sponsorsWritten += 1;
        }
        await batch.commit();
      }
      billsWritten += 1;
      if (billsWritten % 10 === 0) console.log(`Ingested ${billsWritten} bills so far...`);
    }

    // Hearings from events.
    if (!skipEvents) {
      const events = await fetchEvents(state, apiKey);
      for (const event of events) {
        if (!event.start_date) continue;
        const relatedBill = event.agenda
          ?.flatMap((a) => a.related_entities ?? [])
          .find((e) => e.entity_type === 'bill' && e.name);
        const hearing = {
          id: slugId(`${state}-${event.id}`),
          state,
          committee: event.name ?? 'Legislative Hearing',
          date: event.start_date,
          ...(event.location?.name ? { room: event.location.name } : {}),
          ...(relatedBill?.name ? { billId: `${state}-${relatedBill.name}` } : {}),
          ...(relatedBill?.name && billNodeIdsByIdentifier.get(relatedBill.name.toUpperCase().replace(/\s+/g, ''))
            ? { billNodeId: billNodeIdsByIdentifier.get(relatedBill.name.toUpperCase().replace(/\s+/g, '')) }
            : {}),
          status: event.status && event.status !== 'confirmed' ? capitalize(event.status) : 'Scheduled',
        };
        if (!dryRun) {
          await db.doc(`hearings/${hearing.id}`).set(hearing, { merge: true });
        }
        hearingsWritten += 1;
      }
    }
  }

  console.log(
    `${dryRun ? 'Planned' : 'Wrote'}: ${billsWritten} bills, ${versionsWithText} versions with extracted text, ${sponsorsWritten} sponsorships, ${hearingsWritten} hearings.`,
  );
  if (!dryRun) {
    await db.collection('pipelineRuns').add({
      script: 'ingest-bills',
      states,
      maxBills,
      sourceOnly: true,
      billsWritten,
      versionsWithText,
      sponsorsWritten,
      hearingsWritten,
      finishedAt: FieldValue.serverTimestamp(),
    });
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

await main();
