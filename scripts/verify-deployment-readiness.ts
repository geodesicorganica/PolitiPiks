import { readFileSync } from 'node:fs';

const PROJECT_ID = 'politipiks';
const DATABASE_ID = 'ai-studio-politipickmidter-cead0e40-d220-401c-9ce8-1d4e5901d29a';

type AppConfig = { projectId?: string; firestoreDatabaseId?: string };
type FirebaseJson = { firestore?: Array<{ database?: string }> };

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const appConfig = json<AppConfig>('firebase-applet-config.json');
const firebaseJson = json<FirebaseJson>('firebase.json');
assert(appConfig.projectId === PROJECT_ID, `Firebase project mismatch: expected ${PROJECT_ID}, got ${appConfig.projectId}.`);
assert(appConfig.firestoreDatabaseId === DATABASE_ID, `App database mismatch: expected ${DATABASE_ID}, got ${appConfig.firestoreDatabaseId}.`);
assert(firebaseJson.firestore?.[0]?.database === DATABASE_ID, `Rules database mismatch: expected ${DATABASE_ID}, got ${firebaseJson.firestore?.[0]?.database}.`);

for (const [file, required] of [
  ['firestore.rules', 'match /ballotMeasures/{measureId}'],
  ['src/pages/Races.tsx', "collection(db, 'ballotMeasures')"],
  ['src/pages/LeagueDetail.tsx', "collection(db, 'ballotMeasures')"],
  ['server.ts', 'db.collection("ballotMeasures")'],
] as const) {
  assert(readFileSync(file, 'utf8').includes(required), `${file} is missing canonical collection contract ${required}.`);
}

console.log(`Deployment readiness passed: project=${PROJECT_ID}, database=${DATABASE_ID}, contestCollections=races,ballotMeasures.`);
