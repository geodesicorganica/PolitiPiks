/**
 * Shared CLI bootstrap for scripts/*.ts batch jobs: arg parsing and Firestore
 * client construction from a service-account file or Application Default
 * Credentials. `createFirestore` enables `ignoreUndefinedProperties` so a
 * `body: undefined` field (meaning "not applicable" in our research/metrics
 * shapes) is silently omitted instead of throwing at write time.
 */
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { Firestore } from '@google-cloud/firestore';
import dotenv from 'dotenv';

// Preserve explicit shell/CI values, but make local batch scripts work from the
// documented .env.local file without a separate PowerShell export step.
if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: false, quiet: true });
} else {
  dotenv.config({ override: false, quiet: true });
}

export type ServiceAccount = Record<string, unknown>;

export function getArg(name: string) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

export function hasFlag(name: string) {
  return process.argv.includes(name);
}

export function getServiceAccount(): ServiceAccount | null {
  const serviceAccountPath = getArg('--service-account') ?? process.env.FIREBASE_SERVICE_ACCOUNT ?? null;
  if (!serviceAccountPath) return null;
  return JSON.parse(readFileSync(serviceAccountPath, 'utf8')) as ServiceAccount;
}

export function getDatabaseId() {
  const cliDb = getArg('--database') ?? getArg('--database-id');
  if (cliDb) return cliDb;
  if (process.env.FIRESTORE_DATABASE_ID) return process.env.FIRESTORE_DATABASE_ID;
  try {
    const firebaseJson = JSON.parse(readFileSync('firebase.json', 'utf8'));
    const db = firebaseJson?.firestore?.[0]?.database;
    if (typeof db === 'string' && db.length > 0) return db;
  } catch {
    // ignore
  }
  return '(default)';
}

export function getProjectId(serviceAccount: ServiceAccount | null) {
  const cliProject = getArg('--project-id') ?? getArg('--project');
  if (cliProject) return cliProject;
  if (process.env.PROJECT_ID) return process.env.PROJECT_ID;
  if (typeof serviceAccount?.project_id === 'string' && serviceAccount.project_id.length > 0) {
    return serviceAccount.project_id;
  }
  throw new Error('Missing project id. Provide --project-id or set PROJECT_ID.');
}

export function createFirestore(projectId: string, databaseId: string, serviceAccount: ServiceAccount | null) {
  const db = serviceAccount
    ? (() => {
        const clientEmail = serviceAccount.client_email;
        const privateKey = serviceAccount.private_key;
        if (typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
          throw new Error('Invalid service account JSON: expected client_email and private_key.');
        }
        return new Firestore({ projectId, databaseId, credentials: { client_email: clientEmail, private_key: privateKey } });
      })()
    : new Firestore({ projectId, databaseId });

  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

/** Resolves service account, project id, database id, and client in one call. */
export function bootstrapFirestore() {
  const serviceAccount = getServiceAccount();
  const projectId = getProjectId(serviceAccount);
  const databaseId = getDatabaseId();
  const db = createFirestore(projectId, databaseId, serviceAccount);
  return { db, projectId, databaseId, serviceAccount };
}
