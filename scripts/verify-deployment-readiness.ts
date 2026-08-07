import { readFileSync } from 'node:fs';
import { assertHostingArtifact } from './verify-hosting-artifact';

const PROJECT_ID = 'politipiks';
const DATABASE_ID = 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a';

type AppConfig = { projectId?: string; firestoreDatabaseId?: string };
type FirebaseJson = {
  firestore?: Array<{ database?: string }>;
  hosting?: Array<{ site?: string; public?: string; ignore?: string[]; rewrites?: Array<{ source?: string; destination?: string }>; headers?: unknown[] }>;
};

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const appConfig = json<AppConfig>('firebase-applet-config.json');
const firebaseJson = json<FirebaseJson>('firebase.json');
for (const flag of [
  'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST',
  'VITE_USE_EMULATOR', 'VITE_USE_FIREBASE_EMULATORS', 'VITE_ENABLE_TEST_AUTH',
  'VITE_USE_MOCK_CONTESTS', 'VITE_ALLOW_ADMIN_SEED', 'USE_MOCK_DATA', 'TEST_MODE', 'ADMIN_MODE',
]) {
  assert(!process.env[flag], `Unsafe local flag ${flag} is enabled.`);
}
assert(appConfig.projectId === PROJECT_ID, `Firebase project mismatch: expected ${PROJECT_ID}, got ${appConfig.projectId}.`);
assert(appConfig.firestoreDatabaseId === DATABASE_ID, `App database mismatch: expected ${DATABASE_ID}, got ${appConfig.firestoreDatabaseId}.`);
assert(firebaseJson.firestore?.[0]?.database === DATABASE_ID, `Rules database mismatch: expected ${DATABASE_ID}, got ${firebaseJson.firestore?.[0]?.database}.`);
const hosting = firebaseJson.hosting?.find((entry) => entry.site === PROJECT_ID);
assert(hosting?.public === 'hosting-dist', 'Hosting must publish only hosting-dist.');
assert(hosting.rewrites?.some((rewrite) => rewrite.source === '**' && rewrite.destination === '/index.html'), 'Hosting must provide the SPA fallback.');
for (const requiredIgnore of ['**/*.map', '**/.env*', '**/server.*', '**/credentials/**', '**/private/**']) {
  assert(hosting.ignore?.includes(requiredIgnore), `Hosting ignore list is missing ${requiredIgnore}.`);
}

for (const [file, required] of [
  ['firestore.rules', 'match /ballotMeasures/{measureId}'],
  ['src/pages/Races.tsx', "useContestCatalog"],
  ['src/pages/LeagueDetail.tsx', "useContestCatalog"],
  ['server.ts', 'selectContestCatalog'],
  ['src/lib/useContestCatalog.ts', "doc(db, 'catalogActivations', 'canonical-2026')"],
  ['src/lib/contestCatalog.ts', 'selectContestCatalog'],
  ['src/lib/useCanonicalContestEvidence.ts', "'candidateResearch'"],
  ['firestore.rules', "match /catalogActivations/{activationId}"],
  ['firestore.rules', 'activeFederalRaceTarget'],
] as const) {
  assert(readFileSync(file, 'utf8').includes(required), `${file} is missing canonical collection contract ${required}.`);
}

assertHostingArtifact('hosting-dist');

console.log(`Deployment readiness passed: project=${PROJECT_ID}, hostingSite=${hosting.site}, database=${DATABASE_ID}, contestCollections=races,ballotMeasures.`);
