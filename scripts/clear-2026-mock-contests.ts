import { readFileSync } from 'node:fs';
import process from 'node:process';
import { Firestore } from '@google-cloud/firestore';
import { SEED_MEASURES, SEED_RACES } from '../src/constants/electionData';

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

async function deletePredictionsByTargetIds(db: Firestore, targetIds: string[]) {
  let deleted = 0;
  const chunks: string[][] = [];
  for (let index = 0; index < targetIds.length; index += 10) {
    chunks.push(targetIds.slice(index, index + 10));
  }

  for (const targetChunk of chunks) {
    const snap = await db.collection('predictions').where('targetId', 'in', targetChunk).get();
    if (snap.empty) continue;

    let batch = db.batch();
    let batchCount = 0;
    for (const pred of snap.docs) {
      batch.delete(pred.ref);
      deleted += 1;
      batchCount += 1;
      if (batchCount >= 450) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) {
      await batch.commit();
    }
  }

  return deleted;
}

async function main() {
  const serviceAccount = getServiceAccount();
  const projectId = getProjectId(serviceAccount);
  const databaseId = getDatabaseId();
  const db = createFirestore(projectId, databaseId, serviceAccount);

  const raceIds = SEED_RACES.map((race) => race.id);
  const measureIds = SEED_MEASURES.map((measure) => measure.id);
  const targetIds = [...raceIds, ...measureIds];

  const batch = db.batch();
  for (const raceId of raceIds) {
    batch.delete(db.doc(`races/${raceId}`));
  }
  for (const measureId of measureIds) {
    batch.delete(db.doc(`ballotMeasures/${measureId}`));
  }
  await batch.commit();

  const deletedPredictions = await deletePredictionsByTargetIds(db, targetIds);

  console.log(
    `Removed 2026 mock contests: races=${raceIds.length}, ballotMeasures=${measureIds.length}, predictions=${deletedPredictions}, project=${projectId}, database=${databaseId}.`,
  );
}

await main();
