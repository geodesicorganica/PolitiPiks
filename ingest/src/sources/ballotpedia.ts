import { SourcePayload } from '../schema.js';

const API_BASE = 'https://api4.ballotpedia.org/data';

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function closeDateForElection(electionDateISO: string) {
  return `${electionDateISO}T23:59:59Z`;
}

function officeLabel(raw: string) {
  const s = raw.toLowerCase();
  if (s.includes('u.s. senate') || s.includes('us senate')) return 'Senate';
  if (s.includes('president')) return 'President';
  if (s.includes('u.s. house') || s.includes('us house')) return 'House';
  if (s.includes('governor')) return 'Governor';
  if (s.includes('attorney general')) return 'Attorney General';
  if (s.includes('secretary of state')) return 'Secretary of State';
  return raw;
}

function stableRaceId(opts: { state: string; electionDate: string; officeId: number | string; stageType?: string | null; stageParty?: string | null }) {
  const bits = [
    'bp',
    opts.state,
    opts.electionDate,
    String(opts.officeId),
    opts.stageType ?? '',
    opts.stageParty ?? '',
  ].filter(Boolean);
  return bits.join('-').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 120);
}

function stableMeasureId(opts: { state: string; electionDate: string; measureId?: number | string; name: string }) {
  const base = `bp-${opts.state}-${opts.electionDate}-${opts.measureId ?? ''}-${opts.name}`;
  return base.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 120);
}

async function bpGetJson(pathAndQuery: string) {
  const apiKey = requireEnv('BALLOTPEDIA_API_KEY');
  const resp = await fetch(`${API_BASE}${pathAndQuery}`, {
    headers: {
      'x-api-key': apiKey,
      accept: 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`Ballotpedia fetch failed ${resp.status} for ${pathAndQuery}`);
  return resp.json();
}

export async function loadBallotpediaStateElections(params: {
  state: string;
  year: number;
  types?: Array<'General' | 'Primary' | 'Special' | 'Recall'>;
  officeLevel?: 'Federal' | 'State' | 'Local';
}): Promise<SourcePayload> {
  const state = params.state.toUpperCase();
  const year = params.year;
  const types = params.types?.length ? params.types : ['General', 'Primary'];
  const officeLevel = params.officeLevel ?? 'State';

  const electionDates: Array<{ date: string; type: string }> = [];

  for (const type of types) {
    // Ballotpedia returns up to 25 per page.
    for (let page = 1; page <= 50; page++) {
      const json = await bpGetJson(`/election_dates/list?state=${encodeURIComponent(state)}&type=${encodeURIComponent(type)}&year=${encodeURIComponent(String(year))}&page=${page}`);
      if (!json?.success) break;
      const elections = json?.data?.elections ?? [];
      if (!Array.isArray(elections) || elections.length === 0) break;
      for (const e of elections) {
        if (e?.date && typeof e.date === 'string') {
          electionDates.push({ date: e.date, type: e.type ?? type });
        }
      }
      if (elections.length < 25) break;
    }
  }

  // De-dupe dates
  const uniqueDates = Array.from(new Set(electionDates.map((e) => e.date))).sort();

  const races: SourcePayload['races'] = [];
  const ballotMeasures: SourcePayload['ballotMeasures'] = [];

  for (const electionDate of uniqueDates) {
    const resp = await bpGetJson(
      `/elections_by_state?state=${encodeURIComponent(state)}&election_date=${encodeURIComponent(electionDate)}&office_level=${encodeURIComponent(officeLevel)}&district_type=State`,
    );

    const districts = resp?.data?.districts ?? [];
    if (!Array.isArray(districts)) continue;

    for (const d of districts) {
      const dRaces = d?.races ?? [];
      if (Array.isArray(dRaces)) {
        for (const r of dRaces) {
          const office = r?.office?.name ? String(r.office.name) : 'Office';
          const officeId = r?.office?.id ?? r?.id ?? `${office}`;

          const candidates = Array.isArray(r?.candidates) ? r.candidates : [];
          const mappedCandidates = candidates
            .map((c: any) => {
              const person = c?.person;
              const name = person?.name ? String(person.name) : null;
              if (!name) return null;
              const partyAff = Array.isArray(c?.party_affiliation) && c.party_affiliation.length ? c.party_affiliation[0] : null;
              const party = partyAff?.name ? String(partyAff.name) : 'Unknown';
              const id = person?.id != null ? `bp-person-${person.id}` : `bp-${state}-${electionDate}-${name}`;
              return { id, name, party };
            })
            .filter(Boolean) as Array<{ id: string; name: string; party: string }>;

          if (mappedCandidates.length === 0) continue;

          races.push({
            id: stableRaceId({
              state,
              electionDate,
              officeId,
              stageType: r?.stage_type ?? null,
              stageParty: r?.stage_party ?? null,
            }),
            state,
            office: officeLabel(office),
            district: null,
            closeDate: closeDateForElection(electionDate),
            candidates: mappedCandidates,
          });
        }
      }

      const dMeasures = d?.ballot_measures ?? [];
      if (Array.isArray(dMeasures)) {
        for (const m of dMeasures) {
          const name = m?.name ? String(m.name) : null;
          if (!name) continue;
          const summary = m?.summary ? String(m.summary) : (m?.ballot_question ? String(m.ballot_question) : '');
          ballotMeasures.push({
            id: stableMeasureId({ state, electionDate, measureId: m?.id ?? m?.measure_id, name }),
            state,
            title: name,
            description: summary || 'Ballot measure',
            closeDate: closeDateForElection(electionDate),
          });
        }
      }
    }
  }

  return { races, ballotMeasures };
}

