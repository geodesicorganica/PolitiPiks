import { readFileSync } from 'node:fs';
import process from 'node:process';
import { Firestore } from '@google-cloud/firestore';
import { upsertContests } from './firestore.js';
import { loadMedsl2024StatewideContests } from './sources/medsl2024.js';

function getArg(name: string) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function readJsonSafe(path: string) {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferDatabaseId() {
  const cliDb = getArg('--database') ?? getArg('--database-id');
  if (cliDb) return cliDb;
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;

  const localFirebase = readJsonSafe('firebase.json');
  const parentFirebase = readJsonSafe('../firebase.json');
  const guessed =
    ((localFirebase?.firestore as Array<{ database?: unknown }> | undefined)?.[0]?.database as string | undefined) ??
    ((parentFirebase?.firestore as Array<{ database?: unknown }> | undefined)?.[0]?.database as string | undefined);

  return guessed && guessed.length > 0 ? guessed : '(default)';
}

function resolveProjectId(serviceAccount: Record<string, unknown> | null) {
  const cliProject = getArg('--project-id') ?? getArg('--project');
  if (cliProject) return cliProject;
  if (process.env.PROJECT_ID) return process.env.PROJECT_ID;
  if (typeof serviceAccount?.project_id === 'string' && serviceAccount.project_id.length > 0) {
    return serviceAccount.project_id;
  }
  throw new Error('Missing project id. Provide --project-id or set PROJECT_ID.');
}

function getServiceAccount() {
  const serviceAccountPath = getArg('--service-account') ?? process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountPath) return null;
  const raw = readFileSync(serviceAccountPath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
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

async function main() {
  const serviceAccount = getServiceAccount();
  const projectId = resolveProjectId(serviceAccount);
  const databaseId = inferDatabaseId();

  const db = createFirestore(projectId, databaseId, serviceAccount);
  const payload = await loadMedsl2024StatewideContests();
  await upsertContests(db, payload);

  console.log(
    `Seeded MEDSL 2024 contests: races=${payload.races.length}, ballotMeasures=${payload.ballotMeasures.length}, project=${projectId}, database=${databaseId}.`,
  );
}

await main();
