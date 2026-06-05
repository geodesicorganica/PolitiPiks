import { readFileSync } from 'node:fs';
import process from 'node:process';
import { Firestore } from '@google-cloud/firestore';

type Candidate = {
  id?: unknown;
  name?: unknown;
  party?: unknown;
};

type RaceDoc = {
  id: string;
  state?: unknown;
  office?: unknown;
  district?: unknown;
  closeDate?: unknown;
  candidates?: unknown;
  winnerId?: unknown;
};

type MeasureDoc = {
  id: string;
  state?: unknown;
  title?: unknown;
  closeDate?: unknown;
  result?: unknown;
};

type StateCoverage = {
  President: number;
  Governor: number;
  Senate: number;
  House: number;
  ballotMeasures: number;
  houseDistricts: Set<string>;
};

const EXPECTED_2024_HOUSE_SEATS: Record<string, number> = {
  AK: 1,
  AL: 7,
  AR: 4,
  AZ: 9,
  CA: 52,
  CO: 8,
  CT: 5,
  DC: 0,
  DE: 1,
  FL: 28,
  GA: 14,
  HI: 2,
  IA: 4,
  ID: 2,
  IL: 17,
  IN: 9,
  KS: 4,
  KY: 6,
  LA: 6,
  MA: 9,
  MD: 8,
  ME: 2,
  MI: 13,
  MN: 8,
  MO: 8,
  MS: 4,
  MT: 2,
  NC: 14,
  ND: 1,
  NE: 3,
  NH: 2,
  NJ: 12,
  NM: 3,
  NV: 4,
  NY: 26,
  OH: 15,
  OK: 5,
  OR: 6,
  PA: 17,
  RI: 2,
  SC: 7,
  SD: 1,
  TN: 9,
  TX: 38,
  UT: 4,
  VA: 11,
  VT: 1,
  WA: 10,
  WI: 8,
  WV: 2,
  WY: 1,
};

function getArg(name: string) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function getServiceAccountPath() {
  return getArg('--service-account') ?? process.env.FIREBASE_SERVICE_ACCOUNT ?? null;
}

function getServiceAccount() {
  const serviceAccountPath = getServiceAccountPath();
  if (!serviceAccountPath) return null;
  const raw = readFileSync(serviceAccountPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function getDatabaseId() {
  const cliDb = getArg('--database') ?? getArg('--database-id');
  if (cliDb) return cliDb;
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;

  try {
    const firebaseJsonRaw = readFileSync('firebase.json', 'utf8');
    const firebaseJson = JSON.parse(firebaseJsonRaw);
    const db = firebaseJson?.firestore?.[0]?.database;
    if (typeof db === 'string' && db.length > 0) return db;
  } catch {
    // ignore
  }

  return '(default)';
}

function getProjectId(serviceAccount: Record<string, unknown> | null) {
  const cliProject = getArg('--project-id') ?? getArg('--project');
  if (cliProject) return cliProject;
  if (process.env.PROJECT_ID) return process.env.PROJECT_ID;
  if (typeof serviceAccount?.project_id === 'string' && serviceAccount.project_id.length > 0) {
    return serviceAccount.project_id;
  }

  throw new Error('Missing project id. Provide --project-id or set PROJECT_ID.');
}

function createFirestore(projectId: string, databaseId: string, serviceAccount: Record<string, unknown> | null) {
  if (!serviceAccount) {
    return new Firestore({ projectId, databaseId });
  }

  const clientEmail = serviceAccount.client_email;
  const privateKey = serviceAccount.private_key;
  if (typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
    throw new Error('Invalid service account JSON: expected client_email and private_key.');
  }

  return new Firestore({
    projectId,
    databaseId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  });
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getYearFromCloseDate(closeDate: unknown) {
  const value = asString(closeDate);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return String(new Date(ms).getUTCFullYear());
}

function getYearFromId(id: string) {
  const match = id.match(/^(\d{4})[-_]/);
  return match?.[1] ?? 'unknown';
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function getStateCoverage(coverageByState: Map<string, StateCoverage>, state: string) {
  const existing = coverageByState.get(state);
  if (existing) return existing;

  const next: StateCoverage = {
    President: 0,
    Governor: 0,
    Senate: 0,
    House: 0,
    ballotMeasures: 0,
    houseDistricts: new Set<string>(),
  };
  coverageByState.set(state, next);
  return next;
}

function formatMap(map: Map<string, number>) {
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `  ${key}: ${value}`)
    .join('\n');
}

function formatCoverage(coverageByState: Map<string, StateCoverage>) {
  return Array.from(coverageByState.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([state, coverage]) => {
      const parts = [
        `President ${coverage.President}`,
        `Governor ${coverage.Governor}`,
        `Senate ${coverage.Senate}`,
        `House ${coverage.House}`,
        `Measures ${coverage.ballotMeasures}`,
      ];
      return `  ${state}: ${parts.join(', ')}`;
    })
    .join('\n');
}

async function main() {
  const serviceAccount = getServiceAccount();
  const projectId = getProjectId(serviceAccount);
  const databaseId = getDatabaseId();
  const db = createFirestore(projectId, databaseId, serviceAccount);

  const [raceSnap, measureSnap] = await Promise.all([
    db.collection('races').get(),
    db.collection('ballotMeasures').get(),
  ]);

  const races = raceSnap.docs.map((raceDoc) => ({ id: raceDoc.id, ...raceDoc.data() } as RaceDoc));
  const measures = measureSnap.docs.map((measureDoc) => ({ id: measureDoc.id, ...measureDoc.data() } as MeasureDoc));

  const countsByOffice = new Map<string, number>();
  const countsByDateYear = new Map<string, number>();
  const countsByIdYear = new Map<string, number>();
  const coverageByState = new Map<string, StateCoverage>();
  const contestKeys = new Set<string>();
  const issues: string[] = [];

  for (const race of races) {
    const state = asString(race.state) || 'UNKNOWN_STATE';
    const office = asString(race.office) || 'UNKNOWN_OFFICE';
    const dateYear = getYearFromCloseDate(race.closeDate);
    const idYear = getYearFromId(race.id);
    const candidates = Array.isArray(race.candidates) ? race.candidates as Candidate[] : [];

    increment(countsByOffice, office);
    increment(countsByIdYear, idYear);
    increment(countsByDateYear, dateYear ?? 'malformed');

    const coverage = getStateCoverage(coverageByState, state);
    if (office in coverage && office !== 'ballotMeasures') {
      coverage[office as keyof Omit<StateCoverage, 'ballotMeasures'>] += 1;
    }
    if (office === 'House') {
      coverage.houseDistricts.add(asString(race.district) || 'statewide');
    }

    const district = asString(race.district) || 'statewide';
    const contestKey = `${state}|${office}|${district}`;
    if (contestKeys.has(contestKey)) {
      issues.push(`Duplicate race slot: ${contestKey} (${race.id})`);
    }
    contestKeys.add(contestKey);

    if (!asString(race.state)) issues.push(`Race ${race.id} missing state`);
    if (!asString(race.office)) issues.push(`Race ${race.id} missing office`);
    if (!dateYear) issues.push(`Race ${race.id} has malformed closeDate`);
    if (!Array.isArray(race.candidates)) issues.push(`Race ${race.id} candidates is not an array`);
    if (candidates.length === 0) issues.push(`Race ${race.id} has no candidates`);

    const candidateIds = new Set<string>();
    for (const candidate of candidates) {
      const candidateId = asString(candidate.id);
      const candidateName = asString(candidate.name);
      if (!candidateId) issues.push(`Race ${race.id} has candidate with missing id`);
      if (!candidateName) issues.push(`Race ${race.id} has candidate with missing name`);
      if (candidateId && candidateIds.has(candidateId)) {
        issues.push(`Race ${race.id} has duplicate candidate id ${candidateId}`);
      }
      if (candidateId) candidateIds.add(candidateId);
    }

    const winnerId = asString(race.winnerId);
    if (idYear === '2024' && ['President', 'Senate', 'House'].includes(office) && !winnerId) {
      issues.push(`Race ${race.id} missing winnerId`);
    }
    if (winnerId && !candidateIds.has(winnerId)) {
      issues.push(`Race ${race.id} winnerId ${winnerId} is not in candidates`);
    }
  }

  for (const measure of measures) {
    const state = asString(measure.state) || 'UNKNOWN_STATE';
    const dateYear = getYearFromCloseDate(measure.closeDate);
    const idYear = getYearFromId(measure.id);

    increment(countsByIdYear, idYear);
    increment(countsByDateYear, dateYear ?? 'malformed');
    getStateCoverage(coverageByState, state).ballotMeasures += 1;

    if (!asString(measure.state)) issues.push(`Measure ${measure.id} missing state`);
    if (!asString(measure.title)) issues.push(`Measure ${measure.id} missing title`);
    if (!dateYear) issues.push(`Measure ${measure.id} has malformed closeDate`);
    if (idYear === '2024' && !['pass', 'fail'].includes(asString(measure.result))) {
      issues.push(`Measure ${measure.id} missing pass/fail result`);
    }
  }

  const missingStateViewSlots: string[] = [];
  const allStates = new Set([...Object.keys(EXPECTED_2024_HOUSE_SEATS), ...coverageByState.keys()]);
  for (const state of Array.from(allStates).sort((a, b) => a.localeCompare(b))) {
    const coverage = coverageByState.get(state);
    const expectedHouseSeats = EXPECTED_2024_HOUSE_SEATS[state];

    if (!coverage) {
      missingStateViewSlots.push(`${state}: missing all contests`);
      continue;
    }

    if (coverage.President === 0) {
      missingStateViewSlots.push(`${state}: missing President`);
    }

    if (typeof expectedHouseSeats === 'number' && coverage.House !== expectedHouseSeats) {
      missingStateViewSlots.push(`${state}: expected ${expectedHouseSeats} House contests, found ${coverage.House}`);
    }
  }

  const output = [
    `Contest verification for project=${projectId}, database=${databaseId}`,
    '',
    `Totals: races=${races.length}, ballotMeasures=${measures.length}, states=${coverageByState.size}`,
    '',
    'Races by office:',
    formatMap(countsByOffice) || '  none',
    '',
    'Contests by closeDate year:',
    formatMap(countsByDateYear) || '  none',
    '',
    'Contests by id year:',
    formatMap(countsByIdYear) || '  none',
    '',
    'State coverage:',
    formatCoverage(coverageByState) || '  none',
    '',
    `Actionable 2024 coverage gaps (${missingStateViewSlots.length}):`,
    missingStateViewSlots.slice(0, 80).map((item) => `  ${item}`).join('\n') || '  none',
    missingStateViewSlots.length > 80 ? `  ... ${missingStateViewSlots.length - 80} more` : '',
    '',
    `Data quality issues (${issues.length}):`,
    issues.slice(0, 80).map((item) => `  ${item}`).join('\n') || '  none',
    issues.length > 80 ? `  ... ${issues.length - 80} more` : '',
  ].filter((line) => line !== '').join('\n');

  console.log(output);
}

await main();
