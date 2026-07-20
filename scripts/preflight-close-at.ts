import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

type AppConfig = { projectId: string; firestoreDatabaseId: string };
type FirebaseJson = { firestore?: Array<{ database?: string }> };
type ServiceAccount = { project_id?: string; client_email?: string; private_key?: string };
type ProposedConversion = { id: string; closeDate?: unknown; proposedTimestamp: { seconds: number; nanoseconds: number; iso: string } | null; error?: string };

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const config = json<AppConfig>('firebase-applet-config.json');
const firebaseJson = json<FirebaseJson>('firebase.json');
if (firebaseJson.firestore?.[0]?.database !== config.firestoreDatabaseId) {
  throw new Error(`Refusing preflight: firebase.json database does not match app config (${firebaseJson.firestore?.[0]?.database} vs ${config.firestoreDatabaseId}).`);
}

const serviceAccountPath = arg('--service-account') ?? process.env.FIREBASE_SERVICE_ACCOUNT;
const serviceAccount = serviceAccountPath
  ? json<ServiceAccount>(serviceAccountPath)
  : undefined;
if (serviceAccount && serviceAccount.project_id !== config.projectId) {
  throw new Error(`Refusing preflight: service account project does not match app config (${serviceAccount.project_id} vs ${config.projectId}).`);
}

const app = getApps().find((item) => item.name === 'close-at-preflight') ?? initializeApp(
  serviceAccount ? { credential: cert(serviceAccount as Parameters<typeof cert>[0]), projectId: config.projectId } : { projectId: config.projectId },
  'close-at-preflight',
);
const db = getFirestore(app, config.firestoreDatabaseId);

function proposedConversion(id: string, closeDate: unknown): ProposedConversion {
  if (typeof closeDate !== 'string') return { id, closeDate, proposedTimestamp: null, error: 'closeDate is missing or not a string' };
  const milliseconds = Date.parse(closeDate);
  if (Number.isNaN(milliseconds)) return { id, closeDate, proposedTimestamp: null, error: 'closeDate is not parseable as an ISO timestamp' };
  return {
    id,
    closeDate,
    proposedTimestamp: {
      seconds: Math.floor(milliseconds / 1000),
      nanoseconds: (milliseconds % 1000) * 1_000_000,
      iso: new Date(milliseconds).toISOString(),
    },
  };
}

async function inspect(collectionName: 'races' | 'ballotMeasures') {
  const snapshot = await db.collection(collectionName)
    .where('electionYear', '==', 2026)
    .where('mode', '==', 'live')
    .get();
  const missingCloseAt = snapshot.docs
    .filter((item) => item.get('closeAt') == null)
    .map((item) => proposedConversion(item.id, item.get('closeDate')));
  return { scanned2026Live: snapshot.size, missingCloseAt };
}

const [races, ballotMeasures] = await Promise.all([inspect('races'), inspect('ballotMeasures')]);
console.log(JSON.stringify({
  readOnly: true,
  projectId: config.projectId,
  databaseId: config.firestoreDatabaseId,
  collections: ['races', 'ballotMeasures'],
  races,
  ballotMeasures,
  missingCloseAtCount: races.missingCloseAt.length + ballotMeasures.missingCloseAt.length,
}, null, 2));
